import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { StudioDatabase } from "../../db/client";
import { AssetRepository } from "../assets/repository";
import { CharacterProfileRepository } from "../characters/repository";
import { ProjectRepository } from "../projects/repository";
import { ImageReviewRepository } from "./repository";

const paths: string[] = [];
afterEach(() => paths.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

const scores = { identity: 5, scene: 4, realism: 4, composition: 5, technical: 4 };

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "studio-review-"));
  paths.push(root);
  const database = new StudioDatabase(join(root, "studio.sqlite"));
  const projects = new ProjectRepository(database);
  const project = projects.create("图片项目", "image");
  const asset = new AssetRepository(database).createOrGet({
    type: "image",
    name: "候选一",
    managedPath: join(root, "candidate.png"),
    sourcePath: "generated://job/job-1",
    sha256: "candidate-one",
    mediaType: "image/png",
    rightsStatus: "authorized",
    confirmation: "draft",
    metadata: { provenance: "ai_generated", rightsReview: "approved", rightsReviewNote: "已核实生成参考来源" },
  }).asset;
  projects.attachAsset(project.id, asset.id);
  return { database, project, asset, repository: new ImageReviewRepository(database) };
};

describe("ImageReviewRepository", () => {
  it("追加保存审片历史，并用最新记录驱动候选状态", () => {
    const { project, asset, repository } = setup();
    const first = repository.create({ projectId: project.id, assetId: asset.id, decision: "pending", scores, note: "先观察" });
    const approved = repository.create({ projectId: project.id, assetId: asset.id, decision: "approved", scores, note: "身份与构图通过" });

    const workspace = repository.workspace(project.id);
    expect(workspace.reviews.map((item) => item.id)).toEqual([approved.id, first.id]);
    expect(workspace.candidates[0]).toMatchObject({ reviewCount: 2, latestReview: { decision: "approved" } });
    expect(workspace.candidates[0].asset.confirmation).toBe("confirmed");
  });

  it("淘汰候选必须记录下一轮调整方向", () => {
    const { project, asset, repository } = setup();
    expect(() => repository.create({ projectId: project.id, assetId: asset.id, decision: "rejected", scores }))
      .toThrow("淘汰候选时请写明下一轮调整方向");
  });

  it("只有通过审片且完成使用权复核的图片才能晋级项目母版", () => {
    const { project, asset, repository } = setup();
    const pending = repository.create({ projectId: project.id, assetId: asset.id, decision: "pending", scores });
    expect(() => repository.promote({ reviewId: pending.id, targetType: "project" })).toThrow("只有审片通过");

    const approved = repository.create({ projectId: project.id, assetId: asset.id, decision: "approved", scores });
    const promotion = repository.promote({ reviewId: approved.id, targetType: "project" });
    expect(promotion).toMatchObject({ assetId: asset.id, targetType: "project", targetId: project.id });
    expect(repository.workspace(project.id).candidates[0].projectMaster).toBe(true);
  });

  it("角色母版晋级会归档主参考并绑定角色，而不是生成孤立标记", () => {
    const { database, project, asset, repository } = setup();
    const characters = new CharacterProfileRepository(database);
    const character = characters.create({
      projectId: project.id,
      name: "林澜",
      card: { intent: "角色", subject: "成年女性", identityAnchor: "黑发", bodyAndWardrobe: "", expressionAndPose: "", scene: "", lighting: "", camera: "", style: "", avoid: "", aspectRatio: "2:3", referenceAssetIds: [] },
    });
    const approved = repository.create({ projectId: project.id, assetId: asset.id, decision: "approved", scores });
    repository.promote({ reviewId: approved.id, targetType: "character", targetId: character.id });

    expect(characters.get(character.id)?.masterAssetId).toBe(asset.id);
    const member = database.database.prepare("SELECT membership_role, module_key FROM asset_collection_members WHERE asset_id = ?").get(asset.id);
    expect(member).toEqual({ membership_role: "主参考", module_key: "identity" });
  });
});
