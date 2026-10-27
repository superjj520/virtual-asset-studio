import { expect, it } from "vitest";
import { orderSeriesCandidates, seriesCandidateLabel, seriesShotPosition } from "./series-candidate-order";

const plan = [{ label: "系列基准" }, { label: "动作瞬间" }, { label: "越肩关系" }];

it("把系列候选按镜头顺序排列", () => {
  const ordered = orderSeriesCandidates(
    [{ id: "c", label: "越肩关系" }, { id: "a", label: "系列基准" }, { id: "b", label: "动作瞬间" }],
    plan,
    (item) => item.label,
  );
  expect(ordered.map((item) => item.id)).toEqual(["a", "b", "c"]);
});

it("系列候选标签带镜头序号，非系列标签保持原样", () => {
  expect(seriesCandidateLabel("动作瞬间", plan)).toBe("第 2 镜 · 动作瞬间");
  expect(seriesCandidateLabel("主方案", plan)).toBe("主方案");
  expect(seriesShotPosition("未知", plan)).toBeUndefined();
});
