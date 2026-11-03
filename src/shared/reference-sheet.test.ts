import { describe, expect, it } from "vitest";
import type { CreativeCard } from "./types";
import {
  applyReferenceSheetToCard,
  buildReferenceSheetPrompt,
  normalizeReferenceSheetSlots,
  referenceSheetLayout,
  splitReferenceSheetSlots,
  stripReferenceSheetLayoutLanguage,
  type ReferenceSheetRecipe,
  type ReferenceSheetRole,
} from "./reference-sheet";
import { findReferenceStyle } from "./reference-styles";

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
  slots: Array<{ role: ReferenceSheetRole; assetId: string }>,
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

    const five = referenceSheetLayout([
      { role: "identity", assetId: "a" },
      { role: "wardrobe", assetId: "b" },
      { role: "pose", assetId: "c" },
      { role: "scene", assetId: "d" },
      { role: "extra1", assetId: "e" },
    ]);
    expect(five.kind).toBe("3x2");
    expect(five.panels).toHaveLength(5);
    expect(five.panels[4].label).toBe("中下格");

    const six = referenceSheetLayout([
      { role: "identity", assetId: "a" },
      { role: "wardrobe", assetId: "b" },
      { role: "pose", assetId: "c" },
      { role: "scene", assetId: "d" },
      { role: "extra1", assetId: "e" },
      { role: "extra2", assetId: "f" },
    ]);
    expect(six.kind).toBe("3x2");
    expect(six.panels).toHaveLength(6);
    expect(six.panels[5].label).toBe("右下格");
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

    const withExtras = buildReferenceSheetPrompt([
      { role: "identity", assetId: "a" },
      { role: "wardrobe", assetId: "b" },
      { role: "extra1", assetId: "c" },
      { role: "extra2", assetId: "d" },
      { role: "pose", assetId: "e" },
    ]);
    expect(withExtras.modules).toHaveLength(5);
    expect(withExtras.positive).toContain("2 行 3 列的六格");
    expect(withExtras.positive).toContain("补充 1");
    expect(withExtras.positive).toContain("补充参考不得覆盖");
  });

  it("选择画风后写入正向约束与负面词", () => {
    const style = findReferenceStyle("oriental_ink");
    const prompt = buildReferenceSheetPrompt(
      [
        { role: "identity", assetId: "a" },
        { role: "wardrobe", assetId: "b" },
      ],
      style,
    );
    expect(prompt.modules).toHaveLength(3);
    expect(prompt.modules.at(-1)?.label).toBe("画风");
    expect(prompt.positive).toContain("东方水墨审美");
    expect(prompt.negative).toContain("西式油画");
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

    const withExtra = applyReferenceSheetToCard(
      card,
      recipe([
        { role: "identity", assetId: "a" },
        { role: "wardrobe", assetId: "b" },
        { role: "extra1", assetId: "c" },
      ]),
    );
    expect(withExtra.mustKeep).toContain("补充参考 c");
    expect(withExtra.mustKeep).toContain("补充参考不得覆盖");
  });

  it("补充参考不允许带发型，发色与发型只认身份参考", () => {
    const withExtra = applyReferenceSheetToCard(
      card,
      recipe([
        { role: "identity", assetId: "a" },
        { role: "wardrobe", assetId: "b" },
        { role: "extra1", assetId: "c" },
      ]),
    );

    // 曾经这里写着「只提取材质、配饰、发型轮廓或光影」，
    // 与「身份参考含发型」自相矛盾，模型会把补充参考的发色一起带进来。
    expect(withExtra.mustKeep).not.toContain("发型轮廓");
    expect(withExtra.mustKeep).toContain("发型、肤色、脸型");
    expect(withExtra.identityAnchor).toContain("发色与发型走向");

    const prompt = buildReferenceSheetPrompt([
      { role: "identity", assetId: "a" },
      { role: "extra1", assetId: "c" },
    ]);
    expect(prompt.positive).not.toContain("发型轮廓");
    expect(prompt.positive).toContain("发型");
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

  it("单参考模型会剥掉参考板版式语言，避免模型复刻分格", () => {
    const stripped = stripReferenceSheetLayoutLanguage([
      "保持人物脸型与肤色。",
      "参考图是一张2×2 四格素材参考板，每个分区只读取对应信息。",
      "左上格只提供人物身份：严格沿用脸型。",
      "输出约束：单个人物、无分屏、无边框。",
    ].join("\n"));
    expect(stripped).toBe("保持人物脸型与肤色。\n输出约束：单个人物、无分屏、无边框。");
  });

describe("深度图独立通道", () => {
  it("把深度图从参考板槽位里分出来，不参与拼图", () => {
    const { board, depth } = splitReferenceSheetSlots([
      { role: "identity", assetId: "a1", kind: "portrait" },
      { role: "pose", assetId: "a2", kind: "pose" },
      { role: "extra1", assetId: "a3", kind: "depth" },
    ]);
    expect(board.map((slot) => slot.assetId)).toEqual(["a1", "a2"]);
    expect(depth?.assetId).toBe("a3");
  });

  it("只有深度图时没有可拼的分区", () => {
    const { board, depth } = splitReferenceSheetSlots([
      { role: "pose", assetId: "a1", kind: "depth" },
    ]);
    expect(board).toEqual([]);
    expect(depth?.assetId).toBe("a1");
  });

  it("把法线图也分出来：它走 ControlNet Normal，不是参考板分区", () => {
    const { board, normal, depth } = splitReferenceSheetSlots([
      { role: "identity", assetId: "a1", kind: "portrait" },
      { role: "extra1", assetId: "a2", kind: "normal" },
    ]);
    expect(board.map((slot) => slot.assetId)).toEqual(["a1"]);
    expect(normal?.assetId).toBe("a2");
    expect(depth).toBeUndefined();
  });

  it("深度图和法线图同时存在时各走各的通道，都不进拼图", () => {
    const { board, depth, normal } = splitReferenceSheetSlots([
      { role: "identity", assetId: "a1" },
      { role: "extra1", assetId: "a2", kind: "depth" },
      { role: "extra2", assetId: "a3", kind: "normal" },
    ]);
    expect(board.map((slot) => slot.assetId)).toEqual(["a1"]);
    expect(depth?.assetId).toBe("a2");
    expect(normal?.assetId).toBe("a3");
  });

  it("没有深度图时 board 就是全部槽位", () => {
    const { board, depth } = splitReferenceSheetSlots([
      { role: "identity", assetId: "a1" },
      { role: "scene", assetId: "a2" },
    ]);
    expect(board).toHaveLength(2);
    expect(depth).toBeUndefined();
  });

  it("布局按去掉深度图后的槽位数算，不会多出一格", () => {
    const withDepth = referenceSheetLayout([
      { role: "identity", assetId: "a1" },
      { role: "wardrobe", assetId: "a2" },
      { role: "extra1", assetId: "a3", kind: "depth" },
    ]);
    expect(withDepth.panels).toHaveLength(2);
  });

  it("深度图写进必须保持的说明里，明确它没被拼进参考板", () => {
    const card = { identityAnchor: "", bodyAndWardrobe: "", expressionAndPose: "", scene: "", mustKeep: "", avoid: "" } as unknown as CreativeCard;
    const recipe = {
      version: 1 as const,
      layout: referenceSheetLayout([{ role: "identity", assetId: "a1" }]),
      slots: [{ role: "identity" as const, assetId: "a1", name: "身份图" }],
      depth: { role: "extra1" as const, assetId: "a3", name: "深度图 A" },
      prompt: { positive: "", negative: "", modules: [] },
      rightsBasis: "",
      createdAt: "",
    };
    const next = applyReferenceSheetToCard(card, recipe);
    expect(next.mustKeep).toContain("深度图 A");
    expect(next.mustKeep).toContain("没有被拼进参考板");
  });
});

describe("深度图落到创作卡", () => {
  it("合成后把深度图资产 id 写进卡，出图时才知道要送哪一张", () => {
    const card = { identityAnchor: "", bodyAndWardrobe: "", expressionAndPose: "", scene: "", mustKeep: "", avoid: "" } as unknown as CreativeCard;
    const recipe = {
      version: 1 as const,
      layout: referenceSheetLayout([{ role: "identity", assetId: "a1" }]),
      slots: [{ role: "identity" as const, assetId: "a1", name: "身份图" }],
      depth: { role: "extra1" as const, assetId: "depth-9", name: "深度图 B" },
      prompt: { positive: "", negative: "", modules: [] },
      rightsBasis: "",
      createdAt: "",
    };
    expect(applyReferenceSheetToCard(card, recipe).depthAssetId).toBe("depth-9");
  });

  it("没有深度图时不写这个字段，避免出图链路去查一个空 id", () => {
    const card = { identityAnchor: "", bodyAndWardrobe: "", expressionAndPose: "", scene: "", mustKeep: "", avoid: "" } as unknown as CreativeCard;
    const recipe = {
      version: 1 as const,
      layout: referenceSheetLayout([{ role: "identity", assetId: "a1" }]),
      slots: [{ role: "identity" as const, assetId: "a1", name: "身份图" }],
      prompt: { positive: "", negative: "", modules: [] },
      rightsBasis: "",
      createdAt: "",
    };
    expect(applyReferenceSheetToCard(card, recipe).depthAssetId).toBeUndefined();
  });
});
