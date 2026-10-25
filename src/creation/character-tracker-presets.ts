import type { CharacterStateTracker } from "../shared/types";
import {
  GUIDED_MOODS,
  GUIDED_SCENES,
  GUIDED_WARDROBES,
  type GuidedMood,
  type GuidedScene,
  type GuidedWardrobe,
} from "./creative-plan";

export type CharacterTrackerPresetId = "mood" | "location" | "wardrobe" | "affinity";

export type CharacterTrackerPreset = {
  id: CharacterTrackerPresetId;
  label: string;
  description: string;
  visibility: CharacterStateTracker["visibility"];
  updateRule: string;
};

export const CHARACTER_TRACKER_PRESETS: CharacterTrackerPreset[] = [
  {
    id: "mood",
    label: "心情",
    description: "跟随剧情压力与关系变化",
    visibility: "visible",
    updateRule: "根据事件结果、人物关系与场景压力更新；没有明确事件时保持不变。",
  },
  {
    id: "location",
    label: "地点",
    description: "记录角色当前所处场景",
    visibility: "visible",
    updateRule: "角色进入新场景时更新；同一段连续剧情中保持不变。",
  },
  {
    id: "wardrobe",
    label: "服装",
    description: "记录当前造型与换装连续性",
    visibility: "visible",
    updateRule: "只有发生明确换装时更新；其余镜头沿用当前造型。",
  },
  {
    id: "affinity",
    label: "关系温度",
    description: "用于关系剧情与互动分支",
    visibility: "internal",
    updateRule: "信任、坦诚与共同经历提高数值；冲突、欺骗与疏离降低数值。",
  },
];

export const DEFAULT_CHARACTER_TRACKER_IDS: CharacterTrackerPresetId[] = [
  "mood",
  "location",
  "wardrobe",
  "affinity",
];

export type CharacterTrackerContext = {
  mood: GuidedMood;
  scene: GuidedScene;
  wardrobe: GuidedWardrobe;
};

export type CharacterTrackerValues = {
  mood: string;
  location: string;
  wardrobe: string;
};

const optionLabel = <T extends string>(options: Array<{ id: T; label: string }>, id: T) =>
  options.find((item) => item.id === id)?.label ?? id;

export function buildCharacterStateTrackers(
  ids: CharacterTrackerPresetId[],
  context: CharacterTrackerContext,
): CharacterStateTracker[] {
  return buildCharacterStateTrackersFromValues(ids, {
    mood: optionLabel(GUIDED_MOODS, context.mood),
    location: optionLabel(GUIDED_SCENES, context.scene),
    wardrobe: optionLabel(GUIDED_WARDROBES, context.wardrobe),
  });
}

export function buildCharacterStateTrackersFromValues(
  ids: CharacterTrackerPresetId[],
  values: CharacterTrackerValues,
): CharacterStateTracker[] {
  const selected = new Set(ids);
  return CHARACTER_TRACKER_PRESETS
    .filter((preset) => selected.has(preset.id))
    .map((preset) => {
      if (preset.id === "mood") return {
        ...preset,
        valueKind: "choice" as const,
        value: values.mood,
        options: GUIDED_MOODS.map((item) => item.label),
      };
      if (preset.id === "location") return {
        ...preset,
        valueKind: "choice" as const,
        value: values.location,
        options: GUIDED_SCENES.filter((item) => item.id !== "custom").map((item) => item.label),
      };
      if (preset.id === "wardrobe") return {
        ...preset,
        valueKind: "choice" as const,
        value: values.wardrobe,
        options: GUIDED_WARDROBES.map((item) => item.label),
      };
      return {
        ...preset,
        valueKind: "scale" as const,
        value: "20",
        min: 0,
        max: 100,
        options: [],
      };
    });
}
