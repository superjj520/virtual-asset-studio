import { describe, expect, it } from "vitest";
import { CREATION_FLOW_CONTRACTS, getCreationFlowContract } from "./creation-flow";

describe("创作流程契约", () => {
  it("四种结果拥有独立且完整的选择式流程", () => {
    expect(Object.keys(CREATION_FLOW_CONTRACTS)).toEqual(["character", "image", "scene", "series"]);

    for (const contract of Object.values(CREATION_FLOW_CONTRACTS)) {
      expect(contract.stages).toHaveLength(4);
      expect(contract.stages.map((stage) => stage.id)).toEqual(["direction", "character", "story", "output"]);
      expect(contract.finalAction).not.toBe("进入创作台");
      expect(contract.rootAriaLabel).not.toBe("可视化角色创作器");
    }
  });

  it("单张、场景和系列不会复用角色步骤文案", () => {
    expect(getCreationFlowContract("image").stages.map((stage) => stage.label)).toEqual(["主体", "造型", "场景", "确认"]);
    expect(getCreationFlowContract("scene").stages.map((stage) => stage.label)).toEqual(["演员", "表演", "剧情", "输出"]);
    expect(getCreationFlowContract("series").stages.map((stage) => stage.label)).toEqual(["角色", "连续性", "分镜", "交付"]);
  });

  it("单张画面最后一步是生成前确认，不是参数输出页", () => {
    const image = getCreationFlowContract("image");
    const finalStage = image.stages[image.stages.length - 1];
    expect(finalStage.label).toBe("确认");
    expect(finalStage.short).toContain("核对");
  });
});
