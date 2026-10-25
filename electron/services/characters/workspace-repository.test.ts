import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { CreativeCard } from "../../../src/shared/types";
import { StudioDatabase } from "../../db/client";
import { CharacterProfileRepository } from "./repository";
import { CharacterWorkspaceRepository } from "./workspace-repository";

const card: CreativeCard = {
  intent: "角色连续创作",
  subject: "成年东亚女性",
  identityAnchor: "鹅蛋脸、深棕色眼睛、黑色长发",
  bodyAndWardrobe: "修长比例、月白礼服",
  expressionAndPose: "平静直视镜头",
  scene: "深夜庭院",
  lighting: "冷暖电影光",
  camera: "85mm 人像",
  style: "真人摄影",
  avoid: "脸部漂移",
  aspectRatio: "2:3",
  referenceAssetIds: [],
};

const setup = () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), "studio-character-workspace-")), "db.sqlite"));
  const characters = new CharacterProfileRepository(database);
  const workspace = new CharacterWorkspaceRepository(database, characters);
  return { database, characters, workspace };
};

const addAsset = (database: StudioDatabase, id = randomUUID()) => {
  database.database.prepare(`INSERT INTO assets
    (id, type, name, managed_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at)
    VALUES (?, 'image', '角色候选', ?, ?, 'image/png', 'unknown', 'draft', '{}', 'now', 'now')`)
    .run(id, `/tmp/${id}.png`, id);
  return id;
};

it("角色版本保存不可变快照，新的锁定版本会替代旧版本", () => {
  const { database, characters, workspace } = setup();
  const profile = characters.create({ name: "蝶灵", card });
  characters.upsertFact(profile.id, {
    slotKey: "face.shape", value: "柔和鹅蛋脸", state: "draft", evidence: [],
  });
  const first = workspace.createVersion(profile.id, { label: "初始设定" });
  characters.upsertFact(profile.id, {
    slotKey: "face.shape", value: "轮廓更清晰", state: "draft", evidence: [],
  });
  expect(workspace.getVersion(first.id)?.snapshot.facts).toEqual(expect.arrayContaining([
    expect.objectContaining({ slotKey: "face.shape", value: "柔和鹅蛋脸" }),
  ]));

  database.database.prepare("UPDATE character_profiles SET lifecycle = 'confirmed' WHERE id = ?").run(profile.id);
  const locked1 = workspace.createVersion(profile.id, { status: "locked", label: "定妆 V1" });
  const locked2 = workspace.createVersion(profile.id, { status: "locked", label: "定妆 V2" });
  expect(workspace.getVersion(locked1.id)?.status).toBe("superseded");
  expect(workspace.getVersion(locked2.id)?.status).toBe("locked");
  expect(workspace.listVersions(profile.id).map((item) => item.versionNumber)).toEqual([3, 2, 1]);
  database.close();
});

it("角色状态只能属于当前角色，同一角色只有一个正在使用的状态", () => {
  const { database, characters, workspace } = setup();
  const profile = characters.create({ name: "蝶灵", card });
  const other = characters.create({ name: "月灵", card });
  const version = workspace.createVersion(profile.id);
  const otherVersion = workspace.createVersion(other.id);
  expect(() => workspace.createState(profile.id, {
    versionId: otherVersion.id, name: "错误状态", kind: "scene",
  })).toThrow(/版本不属于/);

  const publicState = workspace.createState(profile.id, {
    versionId: version.id, name: "公开工作状态", kind: "scene", status: "active",
    wardrobe: "深色西装", scene: "办公室", emotion: "克制",
    trackers: [
      { id: "mood", label: "心情", valueKind: "choice", value: "克制", options: ["克制", "放松"], visibility: "visible", updateRule: "剧情压力变化时更新" },
      { id: "mood", label: "重复心情", valueKind: "text", value: "应被丢弃", options: [], visibility: "visible", updateRule: "" },
    ],
  });
  const privateState = workspace.createState(profile.id, {
    versionId: version.id, name: "私人放松状态", kind: "performance", status: "active",
    wardrobe: "居家服", scene: "公寓", emotion: "放松",
  });
  expect(workspace.getState(publicState.id)?.status).toBe("draft");
  expect(workspace.getState(publicState.id)?.trackers).toEqual([
    expect.objectContaining({ id: "mood", label: "心情", value: "克制" }),
  ]);
  expect(workspace.getState(privateState.id)?.status).toBe("active");
  expect(workspace.getWorkspace(profile.id).activeState?.id).toBe(privateState.id);
  const updated = workspace.updateState(privateState.id, {
    trackers: [{ id: "affinity", label: "关系温度", valueKind: "scale", value: "35", min: 0, max: 100, options: [], visibility: "internal", updateRule: "信任增加时提高" }],
  });
  expect(updated.trackers).toEqual([expect.objectContaining({ id: "affinity", value: "35", visibility: "internal" })]);
  const columns = database.database.prepare("PRAGMA table_info(character_states)").all() as Array<{ name: string }>;
  expect(columns.some((column) => column.name === "trackers_json")).toBe(true);
  database.close();
});

it("生成会话锁定角色版本与状态，参考和结果资产都回写角色媒体血缘", () => {
  const { database, characters, workspace } = setup();
  const profile = characters.create({ name: "蝶灵", card });
  const version = workspace.createVersion(profile.id);
  const state = workspace.createState(profile.id, {
    versionId: version.id, name: "雨夜街头", kind: "scene", status: "active", scene: "雨夜城市",
  });
  const referenceId = addAsset(database, "reference-1");
  const outputId = addAsset(database, "output-1");
  const session = workspace.createSession({
    characterProfileId: profile.id,
    characterVersionId: version.id,
    characterStateId: state.id,
    title: "雨夜肖像候选",
    mode: "text_to_image",
    prompt: "同一角色置于雨夜街头",
    aspectRatio: "2:3",
    referenceAssetIds: [referenceId],
  });
  workspace.attachMedia(profile.id, {
    versionId: version.id,
    stateId: state.id,
    sessionId: session.id,
    assetId: outputId,
    parentAssetId: referenceId,
    role: "candidate",
  });
  expect(() => workspace.updateSessionStatus(session.id, "completed")).toThrow(/不能从/);
  workspace.updateSessionStatus(session.id, "running");
  workspace.updateSessionStatus(session.id, "review");

  const snapshot = workspace.getWorkspace(profile.id);
  expect(snapshot.sessions[0]).toMatchObject({ id: session.id, status: "review" });
  expect(snapshot.media).toEqual(expect.arrayContaining([
    expect.objectContaining({ assetId: referenceId, role: "reference" }),
    expect.objectContaining({ assetId: outputId, role: "candidate", parentAssetId: referenceId }),
  ]));
  expect(snapshot.media.find((item) => item.assetId === outputId)?.asset.name).toBe("角色候选");
  expect(database.database.pragma("foreign_key_check")).toEqual([]);
  expect(database.database.prepare("SELECT version FROM schema_migrations WHERE version = 5").get()).toEqual({ version: 5 });
  database.close();
});

it("生成会话拒绝跨角色版本与跨角色状态", () => {
  const { database, characters, workspace } = setup();
  const first = characters.create({ name: "角色甲", card });
  const second = characters.create({ name: "角色乙", card });
  const firstVersion = workspace.createVersion(first.id);
  const secondVersion = workspace.createVersion(second.id);
  const secondState = workspace.createState(second.id, {
    versionId: secondVersion.id, name: "乙的状态", kind: "baseline",
  });
  expect(() => workspace.createSession({
    characterProfileId: first.id,
    characterVersionId: firstVersion.id,
    characterStateId: secondState.id,
    title: "错误会话",
    mode: "text_to_image",
    aspectRatio: "1:1",
  })).toThrow(/状态不属于/);
  database.close();
});
