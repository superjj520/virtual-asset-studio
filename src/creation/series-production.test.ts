import { expect, it } from "vitest";
import { productionShotVariableLines, selectProductionShots } from "./series-production";

const plan = [
  { id: "base", label: "系列基准", directive: "建立基线" },
  { id: "action", label: "动作瞬间", directive: "捕捉动作峰值" },
  { id: "wide", label: "环境全景", directive: "交代环境" },
];

it("只选择已采用且在计划内的镜头，保持计划顺序", () => {
  expect(selectProductionShots(plan, ["环境全景", "系列基准"]).map((shot) => shot.label)).toEqual(["系列基准", "环境全景"]);
  expect(selectProductionShots(plan, ["不存在"])).toEqual([]);
  expect(selectProductionShots(plan, [])).toEqual([]);
});

it("采用镜头转成一行一个生产变量", () => {
  expect(productionShotVariableLines(selectProductionShots(plan, ["动作瞬间"]))).toBe("动作瞬间：捕捉动作峰值");
});
