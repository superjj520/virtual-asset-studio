import { expect, it } from "vitest";
import type { CharacterState, CreativeCard } from "../shared/types";
import { buildCharacterExtensionCard } from "./character-extensions";

const base: CreativeCard = {
  visualPresetId: "oriental_moon",
  intent: "",
  subject: "成年角色",
  identityAnchor: "固定脸部",
  bodyAndWardrobe: "主造型",
  expressionAndPose: "",
  scene: "",
  lighting: "柔光",
  camera: "",
  style: "写实",
  avoid: "身份漂移",
  aspectRatio: "2:3",
  referenceAssetIds: ["master-1"],
};

const state: CharacterState = {
  id: "state-1",
  profileId: "character-1",
  versionId: "version-1",
  name: "雨夜",
  kind: "scene",
  status: "active",
  wardrobe: "黑色长外套",
  hair: "湿发",
  expression: "克制",
  pose: "回身",
  scene: "雨夜街头",
  emotion: "警觉",
  continuityNotes: "外套与湿发连续",
  createdAt: "",
  updatedAt: "",
};

it("表情组保留角色来源并生成四项可执行计划", () => {
  const card = buildCharacterExtensionCard({
    base,
    characterId: "character-1",
    versionId: "version-1",
    stateId: state.id,
    kind: "expression_set",
    state,
  });
  expect(card.deliveryMode).toBe("character_sheet");
  expect(card.aspectRatio).toBe("4:3");
  expect(card.characterExtension).toEqual({
    kind: "expression_set",
    sourceCharacterId: "character-1",
    sourceVersionId: "version-1",
    sourceStateId: "state-1",
  });
  expect(card.candidatePlan).toHaveLength(4);
  expect(card.expressionAndPose).toContain("只改变表情");
  expect(card.mustKeep).toContain("外套与湿发连续");
  expect(card.referenceAssetIds).toEqual(["master-1"]);
  expect(card.visualPresetId).toBe("oriental_moon");
});

it("服装变体只扩展造型，不丢失身份和参考素材", () => {
  const card = buildCharacterExtensionCard({ base, characterId: "character-1", kind: "wardrobe_set" });
  expect(card.deliveryMode).toBe("series_pack");
  expect(card.candidatePlan?.map((item) => item.label)).toEqual(["主造型", "日常造型", "工作造型", "重要场合"]);
  expect(card.identityAnchor).toBe("固定脸部");
  expect(card.referenceAssetIds).toEqual(["master-1"]);
  expect(card.mustKeep).toContain("角色脸部结构");
});

it("剧情场景把人物内核转成四段可选择的叙事推进", () => {
  const card = buildCharacterExtensionCard({ base, characterId: "character-1", kind: "story_scene", state });
  expect(card.deliveryMode).toBe("story_scene");
  expect(card.candidatePlan?.map((item) => item.label)).toEqual(["开场建立", "目标推进", "冲突爆发", "情绪余波"]);
  expect(card.candidatePlan?.[2].directive).toContain("内在冲突");
});

it("对话演出使用关系节拍而不是通用构图候选", () => {
  const card = buildCharacterExtensionCard({ base, characterId: "character-1", kind: "dialogue_scene", state });
  expect(card.candidatePlan?.map((item) => item.label)).toEqual(["试探", "施压", "关系转折", "沉默余韵"]);
});
