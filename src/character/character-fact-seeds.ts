import {
  GUIDED_AGES,
  GUIDED_ARCHETYPES,
  GUIDED_BODIES,
  GUIDED_CONFLICTS,
  GUIDED_DRIVES,
  GUIDED_ETHNICITIES,
  GUIDED_EXPRESSIONS,
  GUIDED_EYES,
  GUIDED_EYE_COLORS,
  GUIDED_FACES,
  GUIDED_HAIR,
  GUIDED_HAIR_COLORS,
  GUIDED_HEIGHTS,
  GUIDED_INTERESTS,
  GUIDED_LOWER_SHAPES,
  GUIDED_MOODS,
  GUIDED_OPENINGS,
  GUIDED_PERFORMANCES,
  GUIDED_POSES,
  GUIDED_PROPORTIONS,
  GUIDED_RELATIONSHIPS,
  GUIDED_ROLES,
  GUIDED_SKIN_TONES,
  GUIDED_UPPER_VOLUMES,
  GUIDED_VOICES,
  GUIDED_WARDROBES,
  type GuidedOption,
} from "../creation/creative-plan";
import { findCharacterSlot, type CharacterSlotGroup } from "../shared/character-slots";
import type { CharacterFactInput, CreativeCard } from "../shared/types";

const optionLabel = <T extends string>(options: GuidedOption<T>[], id?: string) =>
  options.find((option) => option.id === id)?.label ?? "";

const subjectGender: Record<string, string> = {
  adult_woman: "女性呈现",
  adult_man: "男性呈现",
  duo: "双人关系",
  nonhuman: "非人角色",
};

/**
 * 将用户已经点选过的人物决策拆成资产域的结构化事实，避免保存角色后重新录入。
 * 这里只同步明确选择；需要图片佐证的正侧背视角仍保持缺失，不能用文字冒充证据。
 */
export function buildCharacterFactSeeds(card: CreativeCard): CharacterFactInput[] {
  const facts = new Map<string, CharacterFactInput>();
  const add = (slotKey: string, group: CharacterSlotGroup, label: string, value: string) => {
    if (!value.trim()) return;
    const slot = findCharacterSlot(slotKey);
    facts.set(slotKey, {
      slotKey,
      group,
      label: slot?.label ?? label,
      value,
      state: "confirmed",
      note: "从创作选择自动同步",
      evidence: [],
    });
  };

  const appearance = card.appearanceProfile;
  if (appearance) {
    add("identity.age", "identity", "成年年龄段", optionLabel(GUIDED_AGES, appearance.ageId));
    add("identity.gender", "identity", "性别呈现", subjectGender[appearance.subjectId] ?? "");
    add("identity.ancestry", "identity", "族裔／物种设定", optionLabel(GUIDED_ETHNICITIES, appearance.ethnicityId));
    add("identity.persona", "identity", "辨识身份与气质", optionLabel(GUIDED_ROLES, appearance.roleId));
    add("skin.tone", "skin", "肤色", optionLabel(GUIDED_SKIN_TONES, appearance.skinToneId));
    add("face.shape", "face", "脸型", optionLabel(GUIDED_FACES, appearance.faceId));
    add("face.eyes", "face", "眼睛", optionLabel(GUIDED_EYES, appearance.eyesId));
    add("face.eye_color", "face", "瞳色", optionLabel(GUIDED_EYE_COLORS, appearance.eyeColorId));
    add("hair.style", "hair", "发型结构", optionLabel(GUIDED_HAIR, appearance.hairId));
    add("hair.color", "hair", "发色", optionLabel(GUIDED_HAIR_COLORS, appearance.hairColorId));
    add("body.build", "body", "形体轮廓", optionLabel(GUIDED_BODIES, appearance.bodyId));
    add("body.height", "body", "身高印象", optionLabel(GUIDED_HEIGHTS, appearance.heightId));
    add("body.proportions", "body", "身材比例", optionLabel(GUIDED_PROPORTIONS, appearance.proportionId));
    add("body.shoulders", "body", "肩颈与上身", optionLabel(GUIDED_UPPER_VOLUMES, appearance.upperVolumeId));
    add("body.waist_hip", "body", "腰胯与下身", optionLabel(GUIDED_LOWER_SHAPES, appearance.lowerShapeId));
    add("wardrobe.direction", "wardrobe", "造型方向", optionLabel(GUIDED_WARDROBES, appearance.wardrobeId));
    add("pose.standing", "pose", "基础站姿", optionLabel(GUIDED_POSES, appearance.poseId));
    add("expression.neutral", "expression", "常态表情", optionLabel(GUIDED_EXPRESSIONS, appearance.expressionId));
  }

  const core = card.characterCore;
  if (core) {
    add("identity.persona", "identity", "辨识身份与气质", optionLabel(GUIDED_ROLES, core.roleId));
    add("character.personality", "identity", "性格气质", optionLabel(GUIDED_MOODS, core.personalityId));
    add("character.voice", "identity", "声线方向", optionLabel(GUIDED_VOICES, core.voiceId));
    add("character.relationship", "identity", "关系定位", optionLabel(GUIDED_RELATIONSHIPS, core.relationshipId));
    add("character.interest", "identity", "生活兴趣", optionLabel(GUIDED_INTERESTS, core.interestId));
    add("character.performance", "identity", "表演方向", optionLabel(GUIDED_PERFORMANCES, core.performanceId));
    add("character.archetype", "identity", "人物原型", optionLabel(GUIDED_ARCHETYPES, core.archetypeId));
    add("character.drive", "identity", "核心目标", optionLabel(GUIDED_DRIVES, core.driveId));
    add("character.conflict", "identity", "内在冲突", optionLabel(GUIDED_CONFLICTS, core.conflictId));
    add("character.opening", "identity", "默认开场", optionLabel(GUIDED_OPENINGS, core.openingId));
  }

  return [...facts.values()];
}
