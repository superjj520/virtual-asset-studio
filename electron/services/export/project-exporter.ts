import { copyFileSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import type { Asset, Project } from "../../../src/shared/types";

export type ProjectExportContext = {
  characters?: unknown[];
  collections?: unknown[];
  shots?: unknown[];
  recipes?: unknown[];
  tasks?: unknown[];
};

export const exportProject = (
  project: Project,
  assets: Asset[],
  destinationDirectory: string,
  context: ProjectExportContext = {},
): string => {
  const exportName = `${project.name.replace(/[\\/:*?"<>|]/g, "_")}-资产包-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  mkdirSync(destinationDirectory, { recursive: true });
  const stagingRoot = join(destinationDirectory, `.vas-export-stage-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const stagingDirectory = join(stagingRoot, exportName);
  const exportDirectory = join(destinationDirectory, exportName);
  const assetsDirectory = join(stagingDirectory, "assets");
  const integrity: Array<{ path: string; bytes: number; sha256: string }> = [];
  try {
    mkdirSync(assetsDirectory, { recursive: true });
    const manifestAssets = assets.map((asset) => {
      if (!statSync(asset.managedPath).isFile()) throw new Error(`资产文件不存在：${asset.name}`);
      const filename = `${asset.id}-${basename(asset.managedPath)}`;
      const target = join(assetsDirectory, filename);
      copyFileSync(asset.managedPath, target);
      const sourceBytes = readFileSync(asset.managedPath);
      const copiedBytes = readFileSync(target);
      const sourceHash = createHash("sha256").update(sourceBytes).digest("hex");
      const copiedHash = createHash("sha256").update(copiedBytes).digest("hex");
      if (sourceHash !== copiedHash || sourceBytes.byteLength !== copiedBytes.byteLength)
        throw new Error(`导出校验失败：${asset.name}`);
      integrity.push({ path: `assets/${filename}`, bytes: copiedBytes.byteLength, sha256: copiedHash });
      const { managedPath: _managedPath, sourcePath: _sourcePath, ...portableAsset } = asset;
      return { ...portableAsset, exportedFile: `assets/${filename}` };
    });
  const exportedFiles = new Map(manifestAssets.map((asset) => [asset.id, asset.exportedFile]));
  const portableCharacters = (context.characters ?? []).map((character) => {
    if (!character || typeof character !== 'object' || !('evidenceAssets' in character) || !Array.isArray(character.evidenceAssets)) return character;
    return { ...character, evidenceAssets: (character.evidenceAssets as Asset[]).map((asset) => {
      const { managedPath: _managedPath, sourcePath: _sourcePath, ...portableAsset } = asset;
      return { ...portableAsset, exportedFile: exportedFiles.get(asset.id) ?? null };
    }) };
  });
  const portableCollections = (context.collections ?? []).map((collection) => {
    if (!collection || typeof collection !== 'object' || !('assets' in collection) || !Array.isArray(collection.assets)) return collection;
    return {
      ...collection,
      assets: collection.assets.map((asset) => {
        if (!asset || typeof asset !== 'object' || !('id' in asset)) return asset;
        const { managedPath: _managedPath, sourcePath: _sourcePath, ...portableAsset } = asset as Asset;
        return { ...portableAsset, exportedFile: exportedFiles.get((asset as Asset).id) ?? null };
      }),
    };
  });
  const confirmed = manifestAssets.filter(
    (asset) => asset.confirmation === "confirmed" && ["authorized", "original"].includes(asset.rightsStatus),
  );
    writeFileSync(
    join(stagingDirectory, "manifest.json"),
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        formatVersion: 3,
        project,
        release: {
          confirmedAssetIds: confirmed.map((asset) => asset.id),
          pendingRightsAssetIds: manifestAssets.filter((asset) => asset.confirmation === "confirmed" && !["authorized", "original"].includes(asset.rightsStatus)).map((asset) => asset.id),
          candidateAssetIds: manifestAssets
            .filter((asset) => asset.confirmation === "draft")
            .map((asset) => asset.id),
          rejectedAssetIds: manifestAssets
            .filter((asset) => asset.confirmation === "rejected")
            .map((asset) => asset.id),
          note: "只有已审片且使用权明确的资产进入推荐清单；待核权利和其余版本保留来源关系供复核。",
        },
        assets: manifestAssets,
        production: {
          characters: portableCharacters,
          collections: portableCollections,
          shots: context.shots ?? [],
          recipes: context.recipes ?? [],
          tasks: context.tasks ?? [],
        },
        integrity: { algorithm: "sha256", files: integrity },
      },
      null,
      2,
    ),
    "utf8",
  );
    renameSync(stagingDirectory, exportDirectory);
    rmSync(stagingRoot, { recursive: true, force: true });
    return exportDirectory;
  } catch (error) {
    rmSync(stagingRoot, { recursive: true, force: true });
    throw error;
  }
};
