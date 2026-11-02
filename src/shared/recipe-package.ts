import type { CreativeAspectRatio, CreativeCard, CreativeRecipe, ProviderId } from "./types";

/**
 * 配方包：把「这张图是怎么做出来的」抽成可跨机器传递的 JSON。
 *
 * 只带方法，不带资产：参考图、项目、任务、配方 id 全是本机概念，
 * 原样带到别人机器上只会指向不存在的记录，所以导出时统一剥掉，
 * 导入时再补一次（别人手改过的包可能又塞回来）。
 */
export const RECIPE_PACKAGE_FORMAT = "virtual-asset-studio/recipe";
export const RECIPE_PACKAGE_VERSION = 1;

export const RECIPE_PACKAGE_EXTENSION = ".recipe.json";

export type RecipePackageRecipe = {
  name: string;
  purpose: string;
  applicability: string;
  invalidationConditions: string[];
  providerId?: ProviderId;
  card: CreativeCard;
  prompt: string;
  negative: string;
  evidence: string[];
};

export type RecipePackage = {
  format: string;
  version: number;
  exportedAt: string;
  recipe: RecipePackageRecipe;
};

export type RecipePackageImport = {
  recipe: RecipePackageRecipe;
  warnings: string[];
};

const ASPECT_RATIOS: CreativeAspectRatio[] = ["1:1", "2:3", "3:2", "4:3", "9:16", "16:9"];

const TEXT_FIELDS = [
  "intent",
  "subject",
  "identityAnchor",
  "bodyAndWardrobe",
  "expressionAndPose",
  "scene",
  "lighting",
  "camera",
  "style",
  "avoid",
] as const;

const asText = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const asTextList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** 导出前剥掉本机绑定，避免把别人的资产 id 也带出去。 */
const cardForShare = (card: CreativeCard): { card: CreativeCard; dropped: boolean } => {
  const next: CreativeCard = {
    ...card,
    referenceAssetIds: [],
  };
  const dropped = (card.referenceAssetIds?.length ?? 0) > 0 || Boolean(card.referenceBindings?.length);
  delete next.referenceBindings;
  delete next.projectId;
  return { card: next, dropped };
};

/** 导入时补齐字段：别人手改过的包不该让界面崩。 */
const cardForImport = (value: Record<string, unknown>, warnings: string[]): CreativeCard => {
  const card = { ...value } as CreativeCard;
  for (const field of TEXT_FIELDS) {
    if (typeof card[field] !== "string") (card as Record<string, unknown>)[field] = "";
  }
  const assetIds = asTextList(card.referenceAssetIds);
  if (assetIds.length) {
    warnings.push("配方包里的参考图引用已清空：图片是本地资产，需要在参考卡里重新选。");
  }
  card.referenceAssetIds = [];
  delete card.referenceBindings;
  delete card.projectId;
  if (!ASPECT_RATIOS.includes(card.aspectRatio)) card.aspectRatio = "1:1";
  if (card.paradigmIds && !Array.isArray(card.paradigmIds)) delete card.paradigmIds;
  if (card.candidatePlan && !Array.isArray(card.candidatePlan)) delete card.candidatePlan;
  return card;
};

export const buildRecipePackage = (
  recipe: CreativeRecipe,
  exportedAt: string = new Date().toISOString(),
): RecipePackage => {
  const { card } = cardForShare(recipe.card);
  return {
    format: RECIPE_PACKAGE_FORMAT,
    version: RECIPE_PACKAGE_VERSION,
    exportedAt,
    recipe: {
      name: recipe.name,
      purpose: recipe.purpose,
      applicability: recipe.applicability,
      invalidationConditions: [...recipe.invalidationConditions],
      providerId: recipe.providerId,
      card,
      prompt: recipe.prompt,
      negative: recipe.negative,
      evidence: [...recipe.evidence],
    },
  };
};

export const serializeRecipePackage = (
  recipe: CreativeRecipe,
  exportedAt?: string,
): string => `${JSON.stringify(buildRecipePackage(recipe, exportedAt), null, 2)}\n`;

/** 文件名只保留安全字符，避免导出时撞上路径分隔符。 */
export const recipePackageFileName = (name: string): string => {
  const safe = name.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 60);
  return `${safe || "创作配方"}${RECIPE_PACKAGE_EXTENSION}`;
};

export const parseRecipePackage = (text: string): RecipePackageImport => {
  if (!text.trim()) throw new Error("配方包是空的，请选择从本应用导出的 JSON 文件。");

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("配方包不是有效的 JSON，请重新导出后再导入。");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("配方包格式不正确。");
  }

  const data = raw as Record<string, unknown>;
  if (data.format !== RECIPE_PACKAGE_FORMAT) {
    throw new Error("这不是虚拟资产创作工作台的配方包。");
  }
  const version = typeof data.version === "number" ? data.version : 0;
  if (version > RECIPE_PACKAGE_VERSION) {
    throw new Error(`配方包版本 v${version} 比当前应用更新，请升级后再导入。`);
  }

  const source = data.recipe;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("配方包里没有配方内容。");
  }
  const recipe = source as Record<string, unknown>;
  const name = asText(recipe.name).trim();
  if (!name) throw new Error("配方包缺少配方名称。");

  const cardRaw = recipe.card;
  if (!cardRaw || typeof cardRaw !== "object" || Array.isArray(cardRaw)) {
    throw new Error("配方包缺少创作卡，导入后无法复用。");
  }

  const warnings: string[] = [];
  if ((recipe.invalidationConditions as unknown[] | undefined)?.length === 0) {
    warnings.push("这条配方没有失效条件，套用前请自己确认适用边界。");
  }

  return {
    recipe: {
      name,
      purpose: asText(recipe.purpose).trim() || "未填写用途",
      applicability: asText(recipe.applicability).trim() || "未填写适用范围",
      invalidationConditions: asTextList(recipe.invalidationConditions),
      providerId: typeof recipe.providerId === "string" ? (recipe.providerId as ProviderId) : undefined,
      card: cardForImport(cardRaw as Record<string, unknown>, warnings),
      prompt: asText(recipe.prompt),
      negative: asText(recipe.negative),
      evidence: asTextList(recipe.evidence),
    },
    warnings,
  };
};
