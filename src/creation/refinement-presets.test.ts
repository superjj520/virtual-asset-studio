import { describe, expect, it } from "vitest";
import type { CreativeCard } from "../shared/types";
import { applyCreationRefinement, getCreationRefinements } from "./refinement-presets";

const card: CreativeCard = {
  intent: "人物写真",
  subject: "成年女性",
  identityAnchor: "鹅蛋脸",
  bodyAndWardrobe: "黑色礼服",
  expressionAndPose: "安静站立",
  scene: "酒店走廊",
  lighting: "柔和侧光",
  camera: "全身构图",
  style: "真实摄影",
  mustKeep: "锁定脸部",
  avoid: "文字",
  aspectRatio: "2:3",
  referenceAssetIds: [],
};

describe("applyCreationRefinement", () => {
  it("换场景时锁定人物与造型", () => {
    const next = applyCreationRefinement(card, "scene");
    expect(next.scene).toContain("只替换");
    expect(next.mustKeep).toContain("服装");
    expect(next.identityAnchor).toBe(card.identityAnchor);
  });

  it("换镜头时不覆盖原始镜头要求", () => {
    const next = applyCreationRefinement(card, "camera");
    expect(next.camera).toContain("全身构图");
    expect(next.camera).toContain("只改变景别");
  });

  it("剧情场景使用叙事语言呈现单变量调整", () => {
    const refinements = getCreationRefinements("story_scene");
    expect(refinements.map((item) => item.label)).toEqual([
      "情绪强度",
      "剧情动作",
      "造型状态",
      "空间关系",
      "叙事镜头",
      "时间光线",
    ]);
    expect(refinements.find((item) => item.id === "camera")?.apply(card).camera).toContain("只改变景别");
  });
});
