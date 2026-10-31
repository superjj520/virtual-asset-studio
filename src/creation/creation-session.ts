import type { CharacterCreationDraft } from "./character-creation-draft";
import type { CreationLaunchKind } from "./CreationLaunchpad";
import type { CandidateVariation } from "./candidate-variations";
import { DEFAULT_GUIDED_STORY_PLAN, type GuidedStoryPlan } from "./creative-plan";
import type { CreativeCard, CreativeTask } from "../shared/types";
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


export const resolveCreationKind = (card: CreativeCard): CreationLaunchKind => {
  if (card.deliveryMode === "story_scene") return "scene";
  if (card.deliveryMode === "series_pack") return "series";
  if (card.deliveryMode === "character_sheet" || card.appearanceProfile) return "character";
  return "image";
};

const RESUMABLE_TASK_STATUSES = new Set<CreativeTask["status"]>(["draft", "ready", "producing", "blocked", "review"]);
export const RESUME_TASK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 会话只是“上次停在哪”的快捷方式，事实来源仍是本地数据库中的创作任务。
 * 本地会话被清空或换设备后，最近一个仍可继续的任务也应能回到启动页。
 */
export function deriveResumableSessionFromTasks(
  tasks: CreativeTask[],
  dismissedTaskId = "",
  now = Date.now(),
): CreationSession | undefined {
  const latest = [...tasks]
    .filter((task) => RESUMABLE_TASK_STATUSES.has(task.status) && task.id !== dismissedTaskId)
    .filter((task) => {
      const updatedAt = Date.parse(task.updatedAt);
      return Number.isFinite(updatedAt) && now - updatedAt <= RESUME_TASK_TTL_MS;
    })
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
  if (!latest) return undefined;
  return {
    version: 1,
    updatedAt: latest.updatedAt,
    kind: resolveCreationKind(latest.card),
    phase: "studio",
    taskId: latest.id,
    studioStage: latest.resultAssetId || latest.status === "review" ? "candidates" : "plan",
    candidateCount: 2,
    seriesPlan: [],
    storyPlan: { ...DEFAULT_GUIDED_STORY_PLAN },
  };
}
