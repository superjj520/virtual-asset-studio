import type { CharacterCreationDraft } from "./character-creation-draft";
import type { CreationLaunchKind } from "./CreationLaunchpad";
import type { CandidateVariation } from "./candidate-variations";
import type { GuidedStoryPlan } from "./creative-plan";
import type { CreationStudioStage } from "./CreationStudioJourney";

const CREATION_SESSION_KEY = "virtual-asset-studio.creation-session.v1";
export const CREATION_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type CreationSessionDraft = Omit<CharacterCreationDraft, "version" | "updatedAt">;

export type CreationSession = {
  version: 1;
  updatedAt: string;
  kind: CreationLaunchKind;
  phase: "creator" | "studio";
  draft?: CreationSessionDraft;
  taskId?: string;
  studioStage?: CreationStudioStage;
  candidateCount: 1 | 2 | 4;
  seriesPlan: CandidateVariation[];
  storyPlan: GuidedStoryPlan;
  generationSeed?: number;
};

const KINDS = new Set<CreationLaunchKind>(["character", "image", "scene", "series"]);

function storage() {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadCreationSession(): CreationSession | undefined {
  try {
    const raw = storage()?.getItem(CREATION_SESSION_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const value = parsed as Record<string, unknown>;
    if (value.version !== 1 || typeof value.updatedAt !== "string") return undefined;
    const updatedAt = Date.parse(value.updatedAt);
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > CREATION_SESSION_TTL_MS) {
      storage()?.removeItem(CREATION_SESSION_KEY);
      return undefined;
    }
    if (!KINDS.has(value.kind as CreationLaunchKind)) return undefined;
    const phase = value.phase === "studio" ? "studio" : "creator";
    if (phase === "creator" && (!value.draft || typeof value.draft !== "object" || Array.isArray(value.draft))) return undefined;
    if (phase === "studio" && (typeof value.taskId !== "string" || !value.taskId)) return undefined;
    if (![1, 2, 4].includes(Number(value.candidateCount))) return undefined;
    if (!Array.isArray(value.seriesPlan) || !value.storyPlan || typeof value.storyPlan !== "object") return undefined;
    return { ...value, phase } as unknown as CreationSession;
  } catch {
    return undefined;
  }
}

export function saveCreationSession(input: Omit<CreationSession, "version" | "updatedAt">): CreationSession {
  const next: CreationSession = {
    ...input,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  try {
    storage()?.setItem(CREATION_SESSION_KEY, JSON.stringify(next));
  } catch {
    // 本地空间不足时不阻断创作主流程。
  }
  return next;
}

export function clearCreationSession() {
  try {
    storage()?.removeItem(CREATION_SESSION_KEY);
  } catch {
    // 清理失败不影响当前创作。
  }
}

export const creationKindLabel: Record<CreationLaunchKind, string> = {
  character: "角色塑造",
  image: "单张画面",
  scene: "剧情场景",
  series: "系列镜头",
};
