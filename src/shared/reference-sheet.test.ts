import { describe, expect, it } from "vitest";
import type { CreativeCard } from "./types";
import {
  applyReferenceSheetToCard,
  buildReferenceSheetPrompt,
  normalizeReferenceSheetSlots,
  referenceSheetLayout,
  type ReferenceSheetRecipe,
} from "./reference-sheet";

const card: CreativeCard = {
  intent: "人物写真",
  subject: "成年女性",
  identityAnchor: "原身份",
  bodyAndWardrobe: "原服装",
  expressionAndPose: "原姿态",
  scene: "原场景",
  lighting: "原光线",
  camera: "半身人像",
  style: "真实摄影",
  avoid: "卡通感",
  aspectRatio: "2:3",
  referenceAssetIds: [],
};

const recipe = (
  slots: Array<{ role: "identity" | "wardrobe" | "pose" | "scene"; assetId: string }>,
): ReferenceSheetRecipe => {
  const normalized = normalizeReferenceSheetSlots(slots);
  return {
    version: 1,
    layout: referenceSheetLayout(normalized),
    slots: normalized.map((slot) => ({ ...slot, name: slot.assetId })),
    prompt: buildReferenceSheetPrompt(normalized),
    rightsBasis: "由已审片且已授权的参考图本地合成",
    createdAt: "2026-10-31T00:00:00.000Z",
  };
};

describe("reference sheet", () => {
  it("去重、按身份/服装/姿态/场景排序并保留资产", () => {
    const slots = normalizeReferenceSheetSlots([
      { role: "scene", assetId: "scene-1" },
      { role: "identity", assetId: "face-1" },
      { role: "identity", assetId: "face-2" },
      { role: "wardrobe", assetId: "face-1" },
      { role: "pose", assetId: "pose-1" },
      { role: "unknown", assetId: "x" },
    ]);
    expect(slots.map((slot) => slot.assetId)).toEqual([
      "face-1",
      "pose-1",
      "scene-1",
    ]);
  });

  it("两张用左右版式，三张用两上一下，四张用 2×2 版式", () => {
    const two = referenceSheetLayout([
      { role: "identity", assetId: "a" },
      { role: "wardrobe", assetId: "b" },
    ]);
    expect(two.kind).toBe("1x2");
    expect([two.width, two.height]).toEqual([1440, 960]);
    expect(two.panels.map((panel) => panel.label)).toEqual(["左格", "右格"]);

    const three = referenceSheetLayout([
      { role: "identity", assetId: "a" },
      { role: "wardrobe", assetId: "b" },
      { role: "pose", assetId: "c" },
    ]);
    expect(three.panels.map((panel) => panel.label)).toEqual([
      "左上格",
      "右上格",
      "下方整行",
    ]);
    expect(three.panels[2].width).toBe(1392);
    expect(three.panels[2].height).toBe(684);

    const four = referenceSheetLayout([
      { role: "identity", assetId: "a" },
      { role: "wardrobe", assetId: "b" },
      { role: "pose", assetId: "c" },
      { role: "scene", assetId: "d" },
    ]);
    expect(four.kind).toBe("2x2");
    expect(four.panels.map((panel) => panel.label)).toEqual([
      "左上格",
      "右上格",
      "左下格",
      "右下格",
    ]);
    expect(four.panels.every((panel) => panel.width === 684)).toBe(true);
  });

  it("提示词说明每格用途，并要求成图不是拼贴", () => {
    const prompt = buildReferenceSheetPrompt([
      { role: "identity", assetId: "a" },
      { role: "wardrobe", assetId: "b" },
      { role: "pose", assetId: "c" },
      { role: "scene", assetId: "d" },
    ]);
    expect(prompt.positive).toContain("生成一张完整的单幅新画面，不是拼贴图");
    const threePrompt = buildReferenceSheetPrompt([
      { role: "identity", assetId: "a" },
      { role: "wardrobe", assetId: "b" },
      { role: "scene", assetId: "c" },
    ]);
    expect(threePrompt.positive).toContain("上方两格、下方整行的三格");
    expect(threePrompt.positive).toContain("下方整行只提供场景");

    expect(prompt.positive).toContain("左上格只提供人物身份");
    expect(prompt.positive).toContain("右上格只提供服装与配饰");
    expect(prompt.positive).toContain("左下格只提供姿态与身体朝向");
    expect(prompt.positive).toContain("右下格只提供场景、光线与色调");
    expect(prompt.negative).toContain("拼贴画");
    expect(prompt.modules).toHaveLength(4);
  });

  it("把分区语义写入创作卡，不改变原卡对象", () => {
    const next = applyReferenceSheetToCard(
      card,
      recipe([
        { role: "identity", assetId: "a" },
        { role: "wardrobe", assetId: "b" },
        { role: "pose", assetId: "c" },
        { role: "scene", assetId: "d" },
      ]),
    );
    expect(next).not.toBe(card);
    expect(next.identityAnchor).toContain("左上格人物身份");
    expect(next.bodyAndWardrobe).toContain("右上格服装与配饰");
    expect(next.expressionAndPose).toContain("左下格姿态");
    expect(next.scene).toContain("右下格场景");
    expect(next.mustKeep).toContain("参考图是素材参考板");
    expect(next.avoid).toContain("分屏");
    expect(card.identityAnchor).toBe("原身份");
  });

  it("两张卡提示词使用左右格标签，且没有场景模块", () => {
    const prompt = buildReferenceSheetPrompt([
      { role: "identity", assetId: "a" },
      { role: "wardrobe", assetId: "b" },
    ]);
    expect(prompt.positive).toContain("左格只提供人物身份");
    expect(prompt.positive).toContain("右格只提供服装与配饰");
    expect(prompt.positive).not.toContain("场景参考");
    expect(prompt.modules).toHaveLength(2);
  });
});
