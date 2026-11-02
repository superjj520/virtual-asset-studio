import { describe, expect, it } from "vitest";
import type { CreativeCard, CreativeRecipe } from "./types";
import {
  buildRecipePackage,
  parseRecipePackage,
  recipePackageFileName,
  RECIPE_PACKAGE_FORMAT,
  RECIPE_PACKAGE_VERSION,
  serializeRecipePackage,
} from "./recipe-package";

const card: CreativeCard = {
  intent: "角色主视觉",
  subject: "短发女性",
  identityAnchor: "圆脸、单眼皮",
  bodyAndWardrobe: "米色针织衫",
  expressionAndPose: "自然站立",
  scene: "落地窗前的午后",
  lighting: "侧逆光",
  camera: "85mm 半身",
  style: "电影写实",
  avoid: "塑料皮肤",
  aspectRatio: "2:3",
  referenceAssetIds: ["asset-1", "asset-2"],
  referenceBindings: [
    { assetId: "asset-1", role: "identity", priority: "primary" },
    { assetId: "asset-2", role: "wardrobe", priority: "support" },
  ],
  projectId: "project-1",
  visualPresetId: "cinematic",
};

const recipe: CreativeRecipe = {
  id: "recipe-1",
  projectId: "project-1",
  creativeTaskId: "task-1",
  providerId: "flux",
  name: "午后侧逆光人像",
  purpose: "角色主视觉",
  applicability: "同一角色身份，只换场景",
  invalidationConditions: ["更换角色身份"],
  card,
  prompt: "a short-haired woman, backlit",
  negative: "plastic skin",
  sourceAssetIds: ["asset-3"],
  status: "validated",
  evidence: ["曾用于三张候选"],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
};

describe("配方包", () => {
  it("导出时剥掉参考图引用、项目与任务 id", () => {
    const pack = buildRecipePackage(recipe, "2026-11-02T00:00:00.000Z");

    expect(pack.format).toBe(RECIPE_PACKAGE_FORMAT);
    expect(pack.version).toBe(RECIPE_PACKAGE_VERSION);
    expect(pack.exportedAt).toBe("2026-11-02T00:00:00.000Z");
    expect(pack.recipe.card.referenceAssetIds).toEqual([]);
    expect(pack.recipe.card.referenceBindings).toBeUndefined();
    expect(pack.recipe.card.projectId).toBeUndefined();
    // 方法本身要完整保留
    expect(pack.recipe.card.intent).toBe("角色主视觉");
    expect(pack.recipe.prompt).toBe("a short-haired woman, backlit");
    expect(pack.recipe.evidence).toEqual(["曾用于三张候选"]);
    expect(JSON.stringify(pack)).not.toContain("task-1");
    expect(JSON.stringify(pack)).not.toContain("asset-3");
  });

  it("序列化后能原样解析回来", () => {
    const restored = parseRecipePackage(serializeRecipePackage(recipe)).recipe;

    expect(restored.name).toBe(recipe.name);
    expect(restored.providerId).toBe("flux");
    expect(restored.applicability).toBe(recipe.applicability);
    expect(restored.invalidationConditions).toEqual(recipe.invalidationConditions);
    expect(restored.card.scene).toBe(recipe.card.scene);
    expect(restored.card.aspectRatio).toBe("2:3");
    expect(restored.prompt).toBe(recipe.prompt);
  });

  it("文件名去掉路径分隔符", () => {
    expect(recipePackageFileName("午后/侧逆光:人像")).toBe("午后-侧逆光-人像.recipe.json");
    expect(recipePackageFileName("   ")).toBe("创作配方.recipe.json");
  });

  it("拒绝空内容、坏 JSON、别家的包与本应用未来的版本", () => {
    expect(() => parseRecipePackage("  ")).toThrow("配方包是空的");
    expect(() => parseRecipePackage("{oops")).toThrow("不是有效的 JSON");
    expect(() => parseRecipePackage(JSON.stringify({ format: "other", version: 1 }))).toThrow(
      "不是虚拟资产创作工作台的配方包",
    );
    expect(() =>
      parseRecipePackage(
        JSON.stringify({
          format: RECIPE_PACKAGE_FORMAT,
          version: RECIPE_PACKAGE_VERSION + 1,
          recipe: { name: "未来的配方", card: {} },
        }),
      ),
    ).toThrow("比当前应用更新");
  });

  it("缺少名称或创作卡时给出可读的报错", () => {
    expect(() =>
      parseRecipePackage(
        JSON.stringify({ format: RECIPE_PACKAGE_FORMAT, version: 1, recipe: { card: {} } }),
      ),
    ).toThrow("缺少配方名称");
    expect(() =>
      parseRecipePackage(
        JSON.stringify({ format: RECIPE_PACKAGE_FORMAT, version: 1, recipe: { name: "没有卡" } }),
      ),
    ).toThrow("缺少创作卡");
  });

  it("导入被手改过的包时再次剥掉参考图并提示", () => {
    const tampered = JSON.stringify({
      format: RECIPE_PACKAGE_FORMAT,
      version: 1,
      recipe: {
        name: "别人的配方",
        card: { intent: "人像", referenceAssetIds: ["foreign-asset"], aspectRatio: "16:9" },
        prompt: "portrait",
      },
    });

    const { recipe: imported, warnings } = parseRecipePackage(tampered);

    expect(imported.card.referenceAssetIds).toEqual([]);
    expect(warnings.some((item) => item.includes("参考图引用已清空"))).toBe(true);
    expect(imported.purpose).toBe("未填写用途");
    expect(imported.invalidationConditions).toEqual([]);
  });

  it("缺字段的创作卡会被补齐，不会把空值带到界面", () => {
    const { recipe: imported } = parseRecipePackage(
      JSON.stringify({
        format: RECIPE_PACKAGE_FORMAT,
        version: 1,
        recipe: { name: "半张卡", card: { intent: "只有意图", aspectRatio: "不是比例" } },
      }),
    );

    expect(imported.card.intent).toBe("只有意图");
    expect(imported.card.subject).toBe("");
    expect(imported.card.avoid).toBe("");
    expect(imported.card.aspectRatio).toBe("1:1");
  });
});
