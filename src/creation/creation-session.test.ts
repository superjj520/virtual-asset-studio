import { beforeEach, describe, expect, it } from "vitest";
import { createDefaultSeriesPlan } from "./candidate-variations";
import { clearCreationSession, loadCreationSession, saveCreationSession } from "./creation-session";
import { DEFAULT_GUIDED_APPEARANCE, DEFAULT_GUIDED_STORY_PLAN } from "./creative-plan";

const draft = {
  sourceMode: "new" as const,
  presetId: "oriental_moon" as const,
  direction: "portrait" as const,
  characterId: "",
  referenceAssetId: "",
  sceneProfileId: "",
  subject: "adult_woman" as const,
  customSubject: "",
  appearance: { ...DEFAULT_GUIDED_APPEARANCE },
  scene: "ancient_east" as const,
  customScene: "",
  mood: "cool" as const,
  shot: "half_body" as const,
  visualStyle: "photoreal" as const,
  aspectRatio: "2:3" as const,
  constraints: ["identity" as const],
  trackerIds: [],
  customTrackers: [],
  purpose: "portrait" as const,
  qualityTier: "premium" as const,
};

describe("creation session", () => {
  beforeEach(() => window.localStorage.clear());

  it("保存并恢复四类创作的选择、候选数与系列计划", () => {
    const seriesPlan = createDefaultSeriesPlan();
    saveCreationSession({
      kind: "series",
      phase: "creator",
      draft: { ...draft, direction: "series_pack", aspectRatio: "9:16" },
      candidateCount: 4,
      seriesPlan,
      storyPlan: { ...DEFAULT_GUIDED_STORY_PLAN },
      generationSeed: 1234,
    });
    const restored = loadCreationSession();
    expect(restored?.kind).toBe("series");
    expect(restored?.draft?.aspectRatio).toBe("9:16");
    expect(restored?.candidateCount).toBe(4);
    expect(restored?.seriesPlan).toHaveLength(seriesPlan.length);
    expect(restored?.generationSeed).toBe(1234);
  });

  it("保存创作台阶段与任务定位", () => {
    saveCreationSession({
      phase: "studio",
      kind: "series",
      taskId: "task-1",
      studioStage: "refine",
      candidateCount: 4,
      seriesPlan: createDefaultSeriesPlan(),
      storyPlan: { ...DEFAULT_GUIDED_STORY_PLAN },
    });
    const restored = loadCreationSession();
    expect(restored?.phase).toBe("studio");
    expect(restored?.taskId).toBe("task-1");
    expect(restored?.studioStage).toBe("refine");
  });

  it("拒绝未知类型与非法候选数", () => {
    window.localStorage.setItem("virtual-asset-studio.creation-session.v1", JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      kind: "video",
      phase: "creator",
      draft,
      candidateCount: 3,
      seriesPlan: [],
      storyPlan: {},
    }));
    expect(loadCreationSession()).toBeUndefined();
  });

  it("清理会话", () => {
    saveCreationSession({
      kind: "image",
      phase: "creator",
      draft,
      candidateCount: 2,
      seriesPlan: createDefaultSeriesPlan(),
      storyPlan: { ...DEFAULT_GUIDED_STORY_PLAN },
    });
    clearCreationSession();
    expect(loadCreationSession()).toBeUndefined();
  });
});
