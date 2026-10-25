import { describe, expect, it } from "vitest";
import {
  buildSingleImageChoices,
  buildSingleImageReview,
  describeSingleImageSource,
  summarizeSingleImageChoices,
  type SingleImageChoiceInput,
} from "./single-image-flow";

const baseInput: SingleImageChoiceInput = {
  sourceMode: "new",
  sourceName: "月下东方",
  presetLabel: "月下东方",
  roleLabel: "东方主角",
  wardrobeLabel: "东方礼服",
  poseLabel: "回身瞬间",
  expressionLabel: "清冷克制",
  sceneLabel: "东方古风",
  moodLabel: "清冷克制",
  shotLabel: "半身人像",
  styleLabel: "真实摄影",
  aspectRatio: "2:3",
  constraintLabels: ["锁定脸部", "真实皮肤"],
};

describe("单张画面已选约束", () => {
  it("六条约束按选择流水线顺序排列并带上所属步骤", () => {
    const choices = buildSingleImageChoices(baseInput);

    expect(choices.map((choice) => choice.id)).toEqual(["source", "direction", "look", "scene", "shot", "constraints"]);
    expect(choices.map((choice) => choice.stage)).toEqual(["direction", "direction", "character", "story", "output", "output"]);
    expect(choices.map((choice) => choice.value)).toEqual([
      "原创角色",
      "月下东方",
      "东方主角 · 东方礼服",
      "东方古风 · 清冷克制",
      "半身人像 · 真实摄影",
      "锁定脸部 · 真实皮肤",
    ]);
  });

  it("人物来源区分原创、角色资产与参考图", () => {
    expect(describeSingleImageSource({ sourceMode: "new", sourceName: "月下东方" })).toBe("原创角色");
    expect(describeSingleImageSource({ sourceMode: "saved", sourceName: "蝶灵" })).toBe("角色 · 蝶灵");
    expect(describeSingleImageSource({ sourceMode: "reference", sourceName: "参考图 01" })).toBe("参考图 · 参考图 01");
    expect(describeSingleImageSource({ sourceMode: "saved", sourceName: "" })).toBe("角色资产");
  });

  it("自定义场景使用用户补充的描述，未选内容标记为待选择", () => {
    const choices = buildSingleImageChoices({
      ...baseInput,
      sceneIsCustom: true,
      sceneLabel: "自定义",
      sceneText: "雨夜天台",
      wardrobeLabel: undefined,
      constraintLabels: [],
    });

    expect(choices.find((choice) => choice.id === "scene")?.value).toBe("雨夜天台 · 清冷克制");
    expect(choices.find((choice) => choice.id === "look")?.value).toBe("东方主角");
    expect(choices.find((choice) => choice.id === "constraints")?.value).toBe("未锁定");
    expect(summarizeSingleImageChoices(buildSingleImageChoices({ ...baseInput, presetLabel: "" }))).toEqual({
      total: 6,
      pending: 1,
      locked: 5,
    });
  });

  it("生成前确认按人物与画面两组复核，比约束条多出动作表情与画面比例", () => {
    const review = buildSingleImageReview(baseInput);

    expect(review.map((group) => group.title)).toEqual(["人物", "画面"]);
    expect(review[0].items.map((item) => item.label)).toEqual(["人物来源", "视觉方向", "角色造型", "动作表情"]);
    expect(review[1].items.map((item) => item.label)).toEqual(["场景气质", "镜头质感", "画面比例", "必须保持"]);
    expect(review[0].items.find((item) => item.id === "performance")?.value).toBe("回身瞬间 · 清冷克制");
    expect(review[1].items.find((item) => item.id === "ratio")?.value).toBe("2:3");
  });
});
