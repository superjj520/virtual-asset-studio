import { expect, it } from "vitest";
import { buildBatchVariables } from "./batch-variants";

it("系列采用镜头使用镜头标签与镜头方向，不写成场景变化", () => {
  const [variant] = buildBatchVariables({
    values: ["动作瞬间：捕捉动作峰值，保持角色连续"],
    positive: "角色基线",
    negative: "多余人物",
    series: true,
  });
  expect(variant.label).toBe("动作瞬间");
  expect(variant.prompt).toContain("镜头方向：捕捉动作峰值");
  expect(variant.prompt).not.toContain("场景为");
});

it("普通批量仍使用变体标签与场景变化", () => {
  const [variant] = buildBatchVariables({
    values: ["雨夜街头"],
    positive: "角色基线",
    series: false,
  });
  expect(variant.label).toBe("变体 1：雨夜街头");
  expect(variant.prompt).toContain("本轮唯一变化：场景为雨夜街头");
});
