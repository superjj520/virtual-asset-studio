import { describe, expect, it } from "vitest";
import { findCharacterSlot } from "../shared/character-slots";
import type { CreativeCard } from "../shared/types";
import { choicesForCharacterFact } from "./character-fact-choices";
import { buildCharacterFactSeeds } from "./character-fact-seeds";

const card = {
  intent: "建立可持续使用的角色",
  subject: "成年女性",
  identityAnchor: "东方主角",
  bodyAndWardrobe: "匀称；东方礼服",
  expressionAndPose: "平静克制；自然放松",
  scene: "东方古风",
  lighting: "月光",
  camera: "角色设定板",
  style: "真实摄影",
  avoid: "身份漂移",
  aspectRatio: "4:3",
  referenceAssetIds: [],
  appearanceProfile: {
    subjectId: "adult_woman",
    ageId: "twenties",
    roleId: "oriental_lead",
    ethnicityId: "east_asian",
    skinToneId: "porcelain",
    faceId: "oval",
    eyesId: "clear",
    eyeColorId: "dark_brown",
    hairId: "long_black",
    hairColorId: "black",
    bodyId: "balanced",
    heightId: "average",
    proportionId: "balanced",
    upperVolumeId: "balanced",
    lowerShapeId: "balanced",
    wardrobeId: "oriental",
    poseId: "relaxed",
    expressionId: "neutral",
  },
  characterCore: {
    roleId: "oriental_lead",
    personalityId: "cool",
    voiceId: "soft",
    relationshipId: "independent",
    interestId: "art",
    performanceId: "portrait",
    archetypeId: "seeker",
    driveId: "truth",
    conflictId: "trust_guard",
    openingId: "first_meeting",
  },
} as CreativeCard;

describe("buildCharacterFactSeeds", () => {
  it("把创作选择转成可管理的人物细项，而不是只保留长文本", () => {
    const facts = buildCharacterFactSeeds(card);
    const byKey = new Map(facts.map((fact) => [fact.slotKey, fact]));

    expect(byKey.get("identity.age")?.value).toBe("22–29 岁");
    expect(byKey.get("identity.gender")?.value).toBe("女性呈现");
    expect(byKey.get("identity.ancestry")?.value).toBe("东亚");
    expect(byKey.get("face.shape")?.value).toBe("柔和鹅蛋脸");
    expect(byKey.get("hair.style")?.value).toBe("黑色长发");
    expect(byKey.get("body.proportions")?.value).toBe("自然均衡");
    expect(byKey.get("expression.neutral")?.value).toBe("平静克制");
    expect(byKey.get("pose.standing")?.value).toBe("自然放松");
    expect(byKey.get("character.relationship")?.value).toBe("独立主角");
    expect(byKey.get("character.voice")?.value).toBe("轻柔");
    expect(byKey.get("character.archetype")?.value).toBe("探索者");
    expect(byKey.get("character.drive")?.value).toBe("揭开真相");
    expect(byKey.get("character.conflict")?.value).toBe("信任与防备");
    expect(byKey.get("character.opening")?.value).toBe("初次登场");
    expect(facts.every((fact) => fact.state === "confirmed")).toBe(true);
  });

  it("旧卡只有角色内核时仍能同步性格、声线、关系与兴趣", () => {
    const facts = buildCharacterFactSeeds({
      ...card,
      appearanceProfile: undefined,
      characterCore: {
        roleId: "oriental_lead",
        personalityId: "cool",
        voiceId: "soft",
        relationshipId: "independent",
        interestId: "art",
        performanceId: "portrait",
      },
    });
    expect(facts.map((fact) => fact.slotKey)).toEqual([
      "identity.persona",
      "character.personality",
      "character.voice",
      "character.relationship",
      "character.interest",
      "character.performance",
    ]);
  });

  it("所有自动同步细项都属于标准角色槽位，可直接写入本地角色库", () => {
    const facts = buildCharacterFactSeeds(card);
    expect(facts.filter((fact) => !findCharacterSlot(fact.slotKey)).map((fact) => fact.slotKey)).toEqual([]);
    expect(facts.filter((fact) => choicesForCharacterFact(fact.slotKey).length === 0).map((fact) => fact.slotKey)).toEqual([]);
  });
});
