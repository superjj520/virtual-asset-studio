import { describe, expect, it } from "vitest";
import type { CreativeCard } from "../shared/types";
import { buildLocalSceneAssetDraft, inferSceneKind } from "./local-scene-asset";

const card: CreativeCard = {
  deliveryMode: "story_scene",
  intent: "剧情场景",
  subject: "成年角色",
  identityAnchor: "锁定人物身份",
  bodyAndWardrobe: "主造型",
  expressionAndPose: "克制回身",
  scene: "深夜东方幻想庭院",
  lighting: "冷月光",
  camera: "中景叙事镜头",
  style: "电影级真实材质",
  mustKeep: "角色脸部与服装不变",
  avoid: "文字水印",
  aspectRatio: "16:9",
  referenceAssetIds: [],
  storyPlan: {
    relationshipId: "alone",
    momentId: "discovery",
    pacingId: "rising",
    atmosphereId: "mysterious",
  },
};

describe("buildLocalSceneAssetDraft", () => {
  it("把确认方向与剧情选择整理为可管理场景资产", () => {
    const draft = buildLocalSceneAssetDraft({
      card,
      characterName: "月下东方",
      directionLabel: "冲突爆发",
      directionDirective: "人物面对突发威胁",
    });

    expect(draft.nameBase).toContain("月下东方");
    expect(draft.profile.kind).toBe("fantasy");
    expect(draft.profile.requiredElements).toContain("冲突爆发");
    expect(draft.profile.forbiddenChanges).toContain("角色脸部与服装不变");
    expect(draft.state.name).toContain("冲突爆发");
    expect(draft.state.lighting).toBe("冷月光");
  });

  it("依据场景语义推断基础类型", () => {
    expect(inferSceneKind({ ...card, scene: "极简摄影棚", style: "时尚编辑" })).toBe("studio");
    expect(inferSceneKind({ ...card, scene: "现代办公室室内", style: "真实摄影" })).toBe("interior");
  });
});
