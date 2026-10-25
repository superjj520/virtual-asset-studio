import { describe, expect, it } from "vitest";
import {
  buildCandidateVariations,
  createDefaultSeriesPlan,
  moveCandidateVariation,
  replaceCandidateVariation,
} from "./candidate-variations";

describe("buildCandidateVariations", () => {
  it("普通候选不是重复提示词，而是自动控制单一变化维度", () => {
    const variations = buildCandidateVariations(4, "portrait");
    expect(variations.map((item) => item.label)).toEqual(["主方案", "构图备选", "情绪备选", "光影备选"]);
    expect(new Set(variations.map((item) => item.directive)).size).toBe(4);
  });

  it("动态关键帧使用可承接的视频变化策略", () => {
    const variations = buildCandidateVariations(2, "dynamic_keyframe");
    expect(variations.map((item) => item.label)).toEqual(["动作起点", "动作承接"]);
    expect(variations[0].directive).toContain("关键帧");
  });

  it("系列镜头可以替换、调整顺序并进入真实候选策略", () => {
    const original = createDefaultSeriesPlan();
    const replaced = replaceCandidateVariation(original, 1, "action_moment");
    const moved = moveCandidateVariation(replaced, 1, 1);
    const variations = buildCandidateVariations(4, "series_pack", moved);

    expect(original.map((item) => item.id)).toEqual([
      "series_base",
      "close_emotion",
      "full_body",
      "environment_interaction",
    ]);
    expect(variations.map((item) => item.id)).toEqual([
      "series_base",
      "full_body",
      "action_moment",
      "environment_interaction",
    ]);
    expect(variations[2].directive).toContain("动作峰值");
  });

  it("非系列模式也优先执行角色工作室写入的标准资产计划", () => {
    const plan = [
      { id: "calm", label: "平静", directive: "只改变表情为平静" },
      { id: "smile", label: "放松", directive: "只改变表情为放松" },
    ];
    expect(buildCandidateVariations(2, "character_sheet", plan)).toEqual(plan);
  });
});
