import type { CharacterUseCase } from "../shared/character-slots";
import type {
  CharacterStateTracker,
  CreativeAspectRatio,
  GenerationQualityTier,
} from "../shared/types";
import type {
  CreationDirection,
  CreationPresetId,
  GuidedAppearance,
  GuidedConstraint,
  GuidedMood,
  GuidedScene,
  GuidedShot,
  GuidedSubject,
  GuidedVisualStyle,
} from "./creative-plan";
import type { CharacterTrackerPresetId } from "./character-tracker-presets";

const CHARACTER_CREATION_DRAFT_KEY = "virtual-asset-studio.character-creation-draft.v1";
const CHARACTER_CREATOR_PROGRESS_KEY = "virtual-asset-studio.character-creator-progress.v1";

export type CharacterCreationSourceMode = "new" | "saved" | "reference";

export type CharacterCreationDraft = {
  version: 1;
  updatedAt: string;
  sourceMode: CharacterCreationSourceMode;
  presetId: CreationPresetId;
  direction: CreationDirection;
  characterId: string;
  referenceAssetId: string;
  sceneProfileId: string;
  subject: GuidedSubject;
  customSubject: string;
  appearance: GuidedAppearance;
  scene: GuidedScene;
  customScene: string;
  mood: GuidedMood;
  shot: GuidedShot;
  visualStyle: GuidedVisualStyle;
  aspectRatio: CreativeAspectRatio;
  constraints: GuidedConstraint[];
  trackerIds: CharacterTrackerPresetId[];
  customTrackers: CharacterStateTracker[];
  purpose: CharacterUseCase;
  qualityTier: GenerationQualityTier;
};

export type CharacterCreatorProgress = {
  version: 1;
  section: "direction" | "identity" | "face" | "hair" | "body" | "world" | "details" | "output";
  quickStage: "direction" | "character" | "story" | "output";
  corePanel: "identity" | "relationship" | "narrative" | "performance" | "state";
  mode: "quick" | "fine";
};

function storage() {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
function readObject(key: string): Record<string, unknown> | undefined {
  try {
    const raw = storage()?.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

export function loadCharacterCreationDraft(): CharacterCreationDraft | undefined {
  const parsed = readObject(CHARACTER_CREATION_DRAFT_KEY);
  if (!parsed || parsed.version !== 1 || typeof parsed.updatedAt !== "string") return undefined;
  if (!parsed.appearance || typeof parsed.appearance !== "object" || Array.isArray(parsed.appearance)) return undefined;
  if (!Array.isArray(parsed.constraints) || !Array.isArray(parsed.trackerIds) || !Array.isArray(parsed.customTrackers)) return undefined;
  return parsed as CharacterCreationDraft;
}

export function saveCharacterCreationDraft(input: Omit<CharacterCreationDraft, "version" | "updatedAt">) {
  const next: CharacterCreationDraft = {
    ...input,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  try {
    storage()?.setItem(CHARACTER_CREATION_DRAFT_KEY, JSON.stringify(next));
  } catch {
    // 本地空间不足时不阻断创作主流程。
  }
  return next;
}

export function loadCharacterCreatorProgress(): CharacterCreatorProgress | undefined {
  const parsed = readObject(CHARACTER_CREATOR_PROGRESS_KEY);
  if (!parsed || parsed.version !== 1) return undefined;
  const sections = new Set(["direction", "identity", "face", "hair", "body", "world", "details", "output"]);
  const stages = new Set(["direction", "character", "story", "output"]);
  const panels = new Set(["identity", "relationship", "narrative", "performance", "state"]);
  const modes = new Set(["quick", "fine"]);
  if (!sections.has(String(parsed.section)) || !stages.has(String(parsed.quickStage)) || !panels.has(String(parsed.corePanel)) || !modes.has(String(parsed.mode))) return undefined;
  return parsed as CharacterCreatorProgress;
}

export function saveCharacterCreatorProgress(input: Omit<CharacterCreatorProgress, "version">) {
  const next: CharacterCreatorProgress = { ...input, version: 1 };
  try {
    storage()?.setItem(CHARACTER_CREATOR_PROGRESS_KEY, JSON.stringify(next));
  } catch {
    // 进度记录失败时仍允许用户继续完成当前创作。
  }
  return next;
}

export function clearCharacterCreationDraft() {
  try {
    storage()?.removeItem(CHARACTER_CREATION_DRAFT_KEY);
    storage()?.removeItem(CHARACTER_CREATOR_PROGRESS_KEY);
  } catch {
    // 清理失败不会影响已经完成的角色资产。
  }
}
