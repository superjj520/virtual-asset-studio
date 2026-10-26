import type { CreativeCandidatePlanItem } from "../shared/types";
import {
  replaceCandidateVariation,
  SERIES_VARIATION_LIBRARY,
  type CandidateVariation,
} from "./candidate-variations";

export type SeriesDirection = {
  id: string;
  label: string;
  hint: string;
  plan: CandidateVariation[];
};

export type SeriesShotAdjustmentKind = "scene" | "wardrobe" | "mood";

export type SeriesShotAdjustmentOption = {
  id: string;
  label: string;
  /** 只追加一个变化；沿用项不写提示词。 */
  directive: string;
};

export const SERIES_SHOT_ADJUSTMENT_LABELS: Record<SeriesShotAdjustmentKind, string> = {
  scene: "场景",
  wardrobe: "造型",
  mood: "情绪",
};

/**
 * 逐镜细项只改变当前镜头，身份、服装连续性与整组顺序保持不变。
 * 选项使用稳定编号保存，展示文案以后可以继续调整。
 */
export const SERIES_SHOT_ADJUSTMENTS: Record<SeriesShotAdjustmentKind, SeriesShotAdjustmentOption[]> = {
  scene: [
    { id: "inherit", label: "沿用整组场景", directive: "" },
    { id: "same_space_detail", label: "同场景近景", directive: "保持同一场景，只把取景收近到当前动作发生的位置" },
    { id: "new_space", label: "同世界观新空间", directive: "只替换为同一世界观下的新空间，人物身份与造型不变" },
    { id: "environment_wide", label: "环境占主导", directive: "让环境在画面中占主导，人物仍是可识别的视觉锚点" },
  ],
  wardrobe: [
    { id: "inherit", label: "沿用整组造型", directive: "" },
    { id: "fabric_detail", label: "布料与配饰细节", directive: "保持同一套服装，只让布料纹理、配饰和穿着细节更清楚" },
    { id: "motion_state", label: "动作后的自然状态", directive: "保持同一套服装，只表现动作后的自然褶皱、垂坠与状态变化" },
    { id: "alternate_wardrobe", label: "同世界观替换造型", directive: "只替换为同一世界观下的另一套造型，人物身份与体型不变" },
  ],
  mood: [
    { id: "inherit", label: "沿用整组情绪", directive: "" },
    { id: "calm", label: "平静克制", directive: "只把当前镜头的情绪调整为平静、克制，动作幅度保持收敛" },
    { id: "tense", label: "紧张警觉", directive: "只把当前镜头的情绪调整为紧张、警觉，身体重心保持稳定" },
    { id: "warm", label: "柔和放松", directive: "只把当前镜头的情绪调整为柔和、放松，表情自然可读" },
    { id: "determined", label: "坚定果断", directive: "只把当前镜头的情绪调整为坚定、果断，视线与重心更明确" },
  ],
};

const SHOT_ADJUSTMENT_KINDS: SeriesShotAdjustmentKind[] = ["scene", "wardrobe", "mood"];

const cloneVariation = (item: CandidateVariation): CandidateVariation => ({ ...item });
const cloneDirection = (direction: SeriesDirection): SeriesDirection => ({
  ...direction,
  plan: direction.plan.map(cloneVariation),
});

const makePlan = (ids: string[]): CandidateVariation[] => ids.map((id) => {
  const item = SERIES_VARIATION_LIBRARY.find((variation) => variation.id === id);
  if (!item) throw new Error(`未知的系列镜头类型：${id}`);
  return cloneVariation(item);
});

/**
 * 系列方向描述的是“整组 4 个镜头怎么排”，不是某一个镜头。
 * 单图/角色使用的 LocalDirectionCandidateGallery 不能直接拿来承载系列方向。
 */
export const SERIES_DIRECTIONS: SeriesDirection[] = [
  {
    id: "narrative",
    label: "叙事递进",
    hint: "基准 → 情绪 → 造型 → 环境，适合完整交代一段连续内容",
    plan: makePlan(["series_base", "close_emotion", "full_body", "environment_interaction"]),
  },
  {
    id: "emotion",
    label: "情绪递进",
    hint: "先建立人物情绪，再用细节与空间收束整组镜头",
    plan: makePlan(["series_base", "close_emotion", "detail_closeup", "environment_interaction"]),
  },
  {
    id: "action",
    label: "动作递进",
    hint: "从基准快速进入动作峰值，再用关系与全景交代结果",
    plan: makePlan(["series_base", "action_moment", "over_shoulder", "wide_scene"]),
  },
  {
    id: "space",
    label: "空间递进",
    hint: "从人物造型逐步走向环境全景，适合建立空间关系",
    plan: makePlan(["series_base", "full_body", "wide_scene", "environment_interaction"]),
  },
];

const baseDirective = (item: CreativeCandidatePlanItem) =>
  SERIES_VARIATION_LIBRARY.find((variation) => variation.id === item.id)?.directive ?? item.directive;

const adjustmentOption = (kind: SeriesShotAdjustmentKind, optionId?: string) =>
  optionId && optionId !== "inherit"
    ? SERIES_SHOT_ADJUSTMENTS[kind].find((option) => option.id === optionId)
    : undefined;

/** 逐镜细项附加到基础镜头指令后面；未选择时保持方向原指令。 */
export const composeSeriesShotDirective = (item: CreativeCandidatePlanItem) => {
  const additions = SHOT_ADJUSTMENT_KINDS
    .map((kind) => adjustmentOption(kind, item[kind])?.directive)
    .filter(Boolean);
  return [baseDirective(item), ...additions].filter(Boolean).join("；");
};

export const describeSeriesShotAdjustments = (item: CreativeCandidatePlanItem) =>
  SHOT_ADJUSTMENT_KINDS.flatMap((kind) => {
    const option = adjustmentOption(kind, item[kind]);
    return option ? [`${SERIES_SHOT_ADJUSTMENT_LABELS[kind]}：${option.label}`] : [];
  });

export const setSeriesShotAdjustment = (
  plan: CandidateVariation[],
  index: number,
  kind: SeriesShotAdjustmentKind,
  optionId: string,
) => plan.map((item, itemIndex) => {
  if (itemIndex !== index) return item;
  const next = { ...item };
  if (optionId === "inherit") delete next[kind];
  else next[kind] = optionId;
  return { ...next, directive: composeSeriesShotDirective(next) };
});

const adjustmentSignature = (item: CreativeCandidatePlanItem) =>
  `${item.id}:${item.scene ?? ""}:${item.wardrobe ?? ""}:${item.mood ?? ""}`;

export const seriesPlanSignature = (plan?: CreativeCandidatePlanItem[]) =>
  (plan ?? []).map(adjustmentSignature).join("|");

export const findSeriesDirectionId = (plan?: CreativeCandidatePlanItem[]) => {
  const signature = seriesPlanSignature(plan);
  return SERIES_DIRECTIONS.find((direction) => seriesPlanSignature(direction.plan) === signature)?.id
    ?? "current";
};

/**
 * 返回 4 个整组方向。用户在分镜阶段改过顺序时，把“当前序列”作为第一个候选，
 * 避免选择方向时把用户已经排好的顺序丢掉。
 */
export const buildSeriesDirections = (plan?: CreativeCandidatePlanItem[]): SeriesDirection[] => {
  const current = (plan ?? []).map(cloneVariation);
  if (!current.length) return SERIES_DIRECTIONS.map(cloneDirection);

  const currentSignature = seriesPlanSignature(current);
  const matchingPreset = SERIES_DIRECTIONS.find(
    (direction) => seriesPlanSignature(direction.plan) === currentSignature,
  );
  if (matchingPreset) return SERIES_DIRECTIONS.map(cloneDirection);

  const currentDirection: SeriesDirection = {
    id: "current",
    label: "当前序列",
    hint: "保留你在分镜阶段排好的顺序，再与其他整组方向比较",
    plan: current,
  };
  const alternatives = SERIES_DIRECTIONS.filter(
    (direction) => seriesPlanSignature(direction.plan) !== currentSignature,
  );
  return [currentDirection, ...alternatives].slice(0, 4).map(cloneDirection);
};

export const applySeriesDirection = (direction: SeriesDirection) =>
  direction.plan.map(cloneVariation);

export const replaceSeriesShot = (
  plan: CandidateVariation[],
  index: number,
  variationId: string,
) => {
  const replaced = replaceCandidateVariation(plan, index, variationId);
  return replaced.map((item, itemIndex) => {
    if (itemIndex !== index) return item;
    // 换镜头类型时保留该镜已选的场景/造型/情绪细项。
    const merged = { ...item, scene: plan[index]?.scene, wardrobe: plan[index]?.wardrobe, mood: plan[index]?.mood };
    return { ...merged, directive: composeSeriesShotDirective(merged) };
  });
};

export const SERIES_SHOT_MIN = 2;
export const SERIES_SHOT_MAX = 6;

const clampShotIndex = (index: number, length: number) =>
  Math.max(0, Math.min(index, Math.max(0, length - 1)));

const makeNewShot = () => cloneVariation(SERIES_VARIATION_LIBRARY[1]);

/** 在目标镜头之后插入一个可继续编辑的新镜头；达到 6 镜时保持原计划。 */
export const addSeriesShot = (plan: CandidateVariation[], afterIndex = plan.length - 1) => {
  if (plan.length >= SERIES_SHOT_MAX) return plan;
  const next = plan.map(cloneVariation);
  next.splice(clampShotIndex(afterIndex, plan.length) + 1, 0, makeNewShot());
  return next;
};

/** 复制当前镜头，保留镜头类型与场景/造型/情绪细项。 */
export const duplicateSeriesShot = (plan: CandidateVariation[], index: number) => {
  if (plan.length >= SERIES_SHOT_MAX || !plan[index]) return plan;
  const original = plan[index];
  const copy = { ...original, label: `${original.label}（副本）` };
  copy.directive = composeSeriesShotDirective(copy);
  const next = plan.map(cloneVariation);
  next.splice(index + 1, 0, copy);
  return next;
};

/** 删除目标镜头；至少保留 2 镜，避免把序列变成单图。 */
export const removeSeriesShot = (plan: CandidateVariation[], index: number) => {
  if (plan.length <= SERIES_SHOT_MIN || !plan[index]) return plan;
  return plan.filter((_, itemIndex) => itemIndex !== index);
};

export const summarizeSeriesDirectionChanges = (
  current: CandidateVariation[],
  next: CandidateVariation[],
) => {
  const length = Math.max(current.length, next.length);
  return Array.from({ length }, (_, index) => ({
    index,
    before: current[index]?.label ?? "空",
    after: next[index]?.label ?? "空",
    changed: current[index]?.id !== next[index]?.id
      || current[index]?.directive !== next[index]?.directive,
  }));
};
