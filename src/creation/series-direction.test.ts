import { describe, expect, it } from "vitest";
import { createDefaultSeriesPlan } from "./candidate-variations";
import {
  applySeriesDirection,
  buildSeriesDirections,
  findSeriesDirectionId,
  replaceSeriesShot,
  SERIES_DIRECTIONS,
  seriesPlanSignature,
  summarizeSeriesDirectionChanges,
} from "./series-direction";

describe("系列整组方向", () => {
  it("提供四个整组方向，每个方向都保留四个镜头的顺序", () => {
    expect(SERIES_DIRECTIONS).toHaveLength(4);
    expect(new Set(SERIES_DIRECTIONS.map((direction) => direction.id)).size).toBe(4);
    expect(new Set(SERIES_DIRECTIONS.map((direction) => seriesPlanSignature(direction.plan))).size).toBe(4);
    for (const direction of SERIES_DIRECTIONS) {
      expect(direction.plan).toHaveLength(4);
      expect(direction.plan[0].id).toBe("series_base");
      expect(direction.hint.length).toBeGreaterThan(0);
    }
  });

  it("默认序列命中叙事递进，不额外生成当前序列", () => {
    const plan = createDefaultSeriesPlan();
    const directions = buildSeriesDirections(plan);

    expect(findSeriesDirectionId(plan)).toBe("narrative");
    expect(directions).toHaveLength(4);
    expect(directions.map((direction) => direction.id)).toEqual(["narrative", "emotion", "action", "space"]);
    expect(directions.every((direction) => direction.id !== "current")).toBe(true);
  });

  it("用户改过顺序后把当前序列放在第一位，并避免重复方向", () => {
    const plan = createDefaultSeriesPlan();
    [plan[1], plan[3]] = [plan[3], plan[1]];
    const directions = buildSeriesDirections(plan);

    expect(findSeriesDirectionId(plan)).toBe("current");
    expect(directions[0].id).toBe("current");
    expect(directions[0].plan.map((item) => item.id)).toEqual(plan.map((item) => item.id));
    expect(directions).toHaveLength(4);
    expect(new Set(directions.map((direction) => seriesPlanSignature(direction.plan))).size).toBe(4);
  });

  it("应用方向返回完整克隆，修改结果不会污染方向库", () => {
    const applied = applySeriesDirection(SERIES_DIRECTIONS[2]);
    applied[0].label = "被修改";

    expect(applied).toHaveLength(4);
    expect(SERIES_DIRECTIONS[2].plan[0].label).toBe("系列基准");
  });

  it("逐镜替换只改目标镜头，顺序和镜头数保持不变", () => {
    const plan = createDefaultSeriesPlan();
    const next = replaceSeriesShot(plan, 2, "detail_closeup");

    expect(next).toHaveLength(4);
    expect(next.map((item) => item.id)).toEqual(["series_base", "close_emotion", "detail_closeup", "environment_interaction"]);
    expect(plan[2].id).toBe("full_body");
    expect(next[0]).not.toBe(plan[0]);
  });

  it("对比整组方向时逐镜标出变化，而不是把镜头当成方向", () => {
    const current = createDefaultSeriesPlan();
    const next = replaceSeriesShot(current, 1, "action_moment");
    const changes = summarizeSeriesDirectionChanges(current, next);

    expect(changes).toHaveLength(4);
    expect(changes.map((change) => change.changed)).toEqual([false, true, false, false]);
    expect(changes[1]).toMatchObject({ index: 1, before: "近景情绪", after: "动作瞬间" });
  });
});
