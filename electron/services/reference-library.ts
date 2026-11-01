import { randomUUID } from "node:crypto";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import { mkdir, rm, writeFile } from "node:fs/promises";
import type { Asset, AssetType } from "../../src/shared/types";
import {
  CLOUD_REFERENCE_SOURCE,
  type CloudReferenceCatalog,
  type CloudReferenceItem,
  type CloudReferenceKind,
} from "../../src/shared/reference-library";
import type { AssetRepository } from "./assets/repository";
import type { ImportService } from "./import/import-service";
import type { ProjectRepository } from "./projects/repository";

const BASE_URL = "https://ai-pose-gallery.anhao.app";
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_BYTES = 24 * 1024 * 1024;

type PoseRow = {
  id: string;
  姿势编号?: string;
  姿势名称?: string;
  体系?: string;
  分类?: string;
  角度?: string;
  缩略图?: string;
  原图?: string;
};

type CostumeRow = {
  id: string;
  分类?: string;
  服装名称?: string;
  标签?: string[];
  缩略图?: string;
  预览图?: string;
  原图?: string;
};

type PortraitRow = {
  id: string;
  分区?: string;
  发长?: string;
  发型名称?: string;
  标题?: string;
  缩略图?: string;
  原图?: string;
};

class CloudReferenceLibrary {
  private cache?: { value: CloudReferenceCatalog; expiresAt: number };
  private inflight?: Promise<CloudReferenceCatalog>;
  private readonly thumbnailCache = new Map<string, string>();

  constructor(
    private readonly importer: ImportService,
    private readonly assets: AssetRepository,
    private readonly projects: ProjectRepository,
  ) {}

  async list(): Promise<CloudReferenceCatalog> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.value;
    if (this.inflight) return this.inflight;
    this.inflight = this.load().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  async thumbnail(url: string): Promise<string> {
    assertCloudUrl(url);
    const cached = this.thumbnailCache.get(url);
    if (cached) return cached;
    const response = await transport(url);
    if (!response.ok)
      throw new Error(`云端缩略图读取失败（${response.status}）。`);
    const contentType = response.headers.get("content-type") ?? "image/webp";
    if (!contentType.startsWith("image/"))
      throw new Error("云端缩略图返回的不是图片。");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 4 * 1024 * 1024)
      throw new Error("云端缩略图超过 4MB。");
    const dataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
    this.thumbnailCache.set(url, dataUrl);
    return dataUrl;
  }

  async importItem(item: CloudReferenceItem, projectId?: string): Promise<Asset> {
    assertCloudItem(item);
    const response = await transport(item.imageUrl);
    if (!response.ok)
      throw new Error(`云端参考图下载失败（${response.status}）。`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_BYTES) throw new Error("云端参考图超过 24MB。");
    const contentType = response.headers.get("content-type") ?? "";
    const extension = extensionFor(item.imageUrl, contentType);
    const safeTitle =
      item.title.replace(/[\\/:*?"<>|]/g, " ").trim().slice(0, 60) ||
      `云端参考-${item.id}`;
    const temporaryDirectory = join(tmpdir(), `vas-cloud-${randomUUID()}`);
    await mkdir(temporaryDirectory, { recursive: true });
    const temporaryPath = join(temporaryDirectory, `${safeTitle}${extension}`);
    try {
      await writeFile(temporaryPath, buffer);
      const result = await this.importer.import({
        filePath: temporaryPath,
        sourcePath: item.imageUrl,
        type: assetTypeFor(item.kind),
        projectId,
        rightsStatus: "authorized",
        rightsReason: `云端参考库直接引用：${item.sourceName}（${item.kind} / ${item.id}）`,
        secondaryCategory: item.category,
      });
      this.assets.updateConfirmation(result.asset.id, "confirmed");
      if (projectId) this.projects.attachAsset(projectId, result.asset.id);
      this.assets.mergeMetadata(result.asset.id, {
        cloudReference: {
          sourceName: item.sourceName,
          sourceUrl: item.sourceUrl,
          itemId: item.id,
          kind: item.kind,
          title: item.title,
          imageUrl: item.imageUrl,
          thumbUrl: item.thumbUrl,
        },
      });
      const updated = this.assets.findById(result.asset.id);
      if (!updated) throw new Error("云端参考图写入资产库后未找到。");
      return updated;
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }

  private async load(): Promise<CloudReferenceCatalog> {
    const [poses, costumes, portraits] = await Promise.all([
      this.fetchJson<PoseRow[]>("/data/pose-zh.json"),
      this.fetchJson<CostumeRow[]>("/data/costume-zh.json"),
      this.fetchJson<PortraitRow[]>("/data/portrait-zh.json"),
    ]);
    const poseItems = groupPoses(poses);
    const costumeItems = costumes.map((row) => ({
      id: `costume-${row.id}`,
      kind: "costume" as const,
      title: row.服装名称 ?? row.id,
      category: row.分类 ?? "服装",
      tags: row.标签 ?? [],
      thumbUrl: absoluteUrl(row.缩略图 ?? row.预览图),
      imageUrl: absoluteUrl(row.原图 ?? row.预览图 ?? row.缩略图),
    }));
    const portraitItems = portraits.map((row) => ({
      id: `portrait-${row.id}`,
      kind: "portrait" as const,
      title: row.标题 ?? row.发型名称 ?? row.id,
      category: row.分区 ?? "人像",
      tags: [row.发长, row.发型名称].filter((value): value is string => Boolean(value)),
      thumbUrl: absoluteUrl(row.缩略图),
      imageUrl: absoluteUrl(row.原图 ?? row.缩略图),
    }));
    const normalize = (items: Array<Omit<CloudReferenceItem, "sourceName" | "sourceUrl">>) =>
      items
        .filter((item) => Boolean(item.thumbUrl && item.imageUrl))
        .map((item) => ({
          ...item,
          sourceName: CLOUD_REFERENCE_SOURCE.name,
          sourceUrl: CLOUD_REFERENCE_SOURCE.url,
        }));
    const items = [
      ...normalize(portraitItems),
      ...normalize(costumeItems),
      ...normalize(poseItems),
    ];
    const value: CloudReferenceCatalog = {
      sourceName: CLOUD_REFERENCE_SOURCE.name,
      sourceUrl: CLOUD_REFERENCE_SOURCE.url,
      attribution: CLOUD_REFERENCE_SOURCE.attribution,
      fetchedAt: new Date().toISOString(),
      counts: {
        portrait: portraitItems.length,
        costume: costumeItems.length,
        pose: poseItems.length,
      },
      items,
    };
    this.cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await transport(`${BASE_URL}${path}`);
    if (!response.ok)
      throw new Error(`云端参考库读取失败（${response.status}）。`);
    return (await response.json()) as T;
  }
}

const transport = async (url: string): Promise<Response> => {
  if (process.versions.electron) {
    const { net } = await import("electron");
    return net.fetch(url);
  }
  return fetch(url);
};

const absoluteUrl = (path?: string): string => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${BASE_URL}/${path.replace(/^\/+/, "")}`;
};

const extensionFor = (url: string, contentType: string): string => {
  const fromUrl = extname(new URL(url).pathname).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(fromUrl)) return fromUrl;
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  return ".jpg";
};

const assetTypeFor = (kind: CloudReferenceKind): AssetType =>
  kind === "costume" ? "wardrobe" : kind === "pose" ? "pose" : "reference_image";

const assertCloudUrl = (value: string): void => {
  if (!value) throw new Error("云端参考图缺少图片地址。");
  const url = new URL(value);
  if (url.origin !== BASE_URL) throw new Error("只允许引用已登记的云端参考库。");
};

const assertCloudItem = (item: CloudReferenceItem): void => {
  if (!item?.imageUrl) throw new Error("云端参考图缺少图片地址。");
  assertCloudUrl(item.imageUrl);
};

const groupPoses = (rows: PoseRow[]): Array<Omit<CloudReferenceItem, "sourceName" | "sourceUrl">> => {
  const groups = new Map<string, PoseRow[]>();
  for (const row of rows) {
    const key = row.姿势编号 ?? row.id;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].map(([key, variants]) => {
    const preferred = variants.find((row) => row.角度 === "正面") ?? variants[0];
    return {
      id: `pose-${key}`,
      kind: "pose" as const,
      title: `${preferred.姿势名称 ?? key} · ${variants.length} 视角`,
      category: preferred.体系 ?? preferred.分类 ?? "姿势",
      tags: [preferred.分类, preferred.角度].filter((value): value is string => Boolean(value)),
      thumbUrl: absoluteUrl(preferred.缩略图),
      imageUrl: absoluteUrl(preferred.原图 ?? preferred.缩略图),
    };
  });
};

export { CloudReferenceLibrary };
export const createCloudReferenceLibrary = (
  importer: ImportService,
  assets: AssetRepository,
  projects: ProjectRepository,
) => new CloudReferenceLibrary(importer, assets, projects);
