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

export const seriesPlanSignature = (plan?: CreativeCandidatePlanItem[]) =>
  (plan ?? []).map((item) => item.id).join("|");

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
) => replaceCandidateVariation(plan, index, variationId);

export const summarizeSeriesDirectionChanges = (
  current: CandidateVariation[],
  next: CandidateVariation[],
) => {
  const length = Math.max(current.length, next.length);
  return Array.from({ length }, (_, index) => ({
    index,
    before: current[index]?.label ?? "空",
    after: next[index]?.label ?? "空",
    changed: current[index]?.id !== next[index]?.id,
  }));
};
