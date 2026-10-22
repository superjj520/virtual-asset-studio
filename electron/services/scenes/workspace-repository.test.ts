import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { StudioDatabase } from "../../db/client";
import { SceneWorkspaceRepository } from "./workspace-repository";
import { CharacterWorkspaceRepository } from "../characters/workspace-repository";

const setup = () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), "studio-scene-workspace-")), "db.sqlite"));
  return { database, workspace: new SceneWorkspaceRepository(database) };
};

it("场景档案分离固定空间结构与可变化环境状态", () => {
  const { database, workspace } = setup();
  const scene = workspace.createProfile({
    name: "雨夜玻璃温室",
    kind: "interior",
    anchor: "狭长中轴温室，中央石板路，两侧种植池",
    layout: "入口朝南，北端拱形玻璃门",
    materials: "旧铁框、潮湿玻璃、深色石材",
    colorSystem: "墨绿、冷蓝、少量暖金",
    requiredElements: "拱形门、石板路、两侧植物",
    forbiddenChanges: "禁止改变中轴结构和门窗位置",
  });
  const version = workspace.createVersion(scene.id, { label: "基础空间 V1" });
  const night = workspace.createState(scene.id, {
    versionId: version.id,
    name: "雨夜",
    status: "active",
    timeOfDay: "深夜",
    weather: "小雨",
    lighting: "室外冷月光，室内少量暖灯",
    atmosphere: "玻璃凝结水汽",
  });
  const dawn = workspace.createState(scene.id, {
    versionId: version.id,
    name: "清晨",
    status: "active",
    timeOfDay: "清晨",
    weather: "雨停",
    lighting: "低角度晨光",
  });

  expect(workspace.getState(night.id)?.status).toBe("draft");
  expect(workspace.getWorkspace(scene.id)).toMatchObject({
    activeVersion: { id: version.id },
    activeState: { id: dawn.id },
    scene: { anchor: "狭长中轴温室，中央石板路，两侧种植池" },
  });
  workspace.updateState(night.id, { status: "active" });
  expect(workspace.getState(dawn.id)?.status).toBe("draft");
  expect(workspace.getWorkspace(scene.id).activeState?.id).toBe(night.id);
  database.close();
});

it("锁定场景版本需要确认档案，并保留不可变快照", () => {
  const { database, workspace } = setup();
  const scene = workspace.createProfile({ name: "城市屋顶", kind: "exterior", anchor: "低矮围墙与水塔" });
  expect(() => workspace.createVersion(scene.id, { status: "locked" })).toThrow(/确认/);
  workspace.updateProfile(scene.id, { lifecycle: "confirmed", layout: "水塔位于画面右后方" });
  const first = workspace.createVersion(scene.id, { status: "locked", label: "正式场景 V1" });
  workspace.updateProfile(scene.id, { layout: "水塔位于画面左后方" });
  const second = workspace.createVersion(scene.id, { status: "locked", label: "正式场景 V2" });

  expect(workspace.getVersion(first.id)).toMatchObject({
    status: "superseded",
    snapshot: { layout: "水塔位于画面右后方" },
  });
  expect(workspace.getVersion(second.id)).toMatchObject({ status: "locked", versionNumber: 2 });
  database.close();
});

it("场景素材血缘拒绝跨场景版本和状态", () => {
  const { database, workspace } = setup();
  const first = workspace.createProfile({ name: "场景甲", kind: "studio", anchor: "白色影棚" });
  const second = workspace.createProfile({ name: "场景乙", kind: "fantasy", anchor: "漂浮宫殿" });
  const firstVersion = workspace.createVersion(first.id);
  const secondVersion = workspace.createVersion(second.id);
  const secondState = workspace.createState(second.id, { versionId: secondVersion.id, name: "黄昏" });
  database.database.prepare(`INSERT INTO assets
    (id, type, name, managed_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at)
    VALUES ('scene-asset', 'image', '场景参考', '/tmp/scene.png', 'scene', 'image/png', 'authorized', 'confirmed', '{}', 'now', 'now')`).run();

  expect(() => workspace.attachMedia(first.id, {
    versionId: firstVersion.id,
    stateId: secondState.id,
    assetId: "scene-asset",
    role: "layout_reference",
  })).toThrow(/状态不属于/);
  database.database.prepare(`INSERT INTO assets
    (id, type, name, managed_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at)
    VALUES ('unsafe-scene-asset', 'image', '未授权参考', '/tmp/unsafe.png', 'unsafe', 'image/png', 'unknown', 'draft', '{}', 'now', 'now')`).run();
  expect(() => workspace.attachMedia(first.id, {
    versionId: firstVersion.id, assetId: "unsafe-scene-asset", role: "layout_reference",
  })).toThrow(/已确认且具备使用权/);
  workspace.attachMedia(first.id, { versionId: firstVersion.id, assetId: "scene-asset", role: "master" });
  expect(workspace.getProfile(first.id)?.masterAssetId).toBe("scene-asset");
  database.close();
});

it("图片生成会话同时锁定场景版本和状态，并能回到场景工作室", () => {
  const { database, workspace } = setup();
  database.database.prepare(`INSERT INTO projects (id, name, medium, brief_json, created_at, updated_at)
    VALUES ('project-1', '温室项目', 'image', '{}', 'now', 'now'), ('project-2', '其他项目', 'image', '{}', 'now', 'now')`).run();
  const scene = workspace.createProfile({ projectId: "project-1", name: "玻璃温室", kind: "interior", anchor: "中轴温室" });
  const version = workspace.createVersion(scene.id);
  const state = workspace.createState(scene.id, { versionId: version.id, name: "雨夜", status: "active" });
  const sessions = new CharacterWorkspaceRepository(database);
  expect(() => sessions.createSession({
    projectId: "project-2", sceneProfileId: scene.id, sceneVersionId: version.id, sceneStateId: state.id,
    title: "跨项目候选", mode: "text_to_image", aspectRatio: "3:2",
  })).toThrow(/场景不属于/);
  const session = sessions.createSession({
    projectId: "project-1",
    sceneProfileId: scene.id,
    sceneVersionId: version.id,
    sceneStateId: state.id,
    title: "温室候选",
    mode: "text_to_image",
    aspectRatio: "3:2",
  });

  expect(session).toMatchObject({ sceneProfileId: scene.id, sceneVersionId: version.id, sceneStateId: state.id });
  expect(workspace.getWorkspace(scene.id).sessions).toEqual([
    expect.objectContaining({ id: session.id, sceneStateId: state.id }),
  ]);
  database.close();
});
