import type { CreativeCandidatePlanItem, CreativeDeliveryMode } from "../shared/types";

export type CandidateVariation = CreativeCandidatePlanItem;

const GENERAL_VARIATIONS: CandidateVariation[] = [
  { id: "primary", label: "主方案", directive: "严格执行当前方案，优先保证主体身份、场景和整体视觉方向的准确性" },
  { id: "composition", label: "构图备选", directive: "保持人物身份、服装、场景与风格不变，只优化机位、画面重心和空间层次" },
  { id: "emotion", label: "情绪备选", directive: "保持人物身份、服装、场景和镜头不变，只微调表情、视线与姿态张力" },
  { id: "lighting", label: "光影备选", directive: "保持人物身份、服装、动作、场景和构图不变，只优化主光、轮廓光与明暗层次" },
];

export const SERIES_VARIATION_LIBRARY: CandidateVariation[] = [
  { id: "series_base", label: "系列基准", directive: "建立整组内容的角色、服装、色彩、光线与镜头基线" },
  { id: "close_emotion", label: "近景情绪", directive: "沿用系列基准，只切换为近景情绪镜头，保持人物身份和世界观一致" },
  { id: "full_body", label: "全身造型", directive: "沿用系列基准，只切换为完整全身造型镜头，保持服装和比例一致" },
  { id: "environment_interaction", label: "环境互动", directive: "沿用系列基准，只增加人物与场景关键元素的自然互动" },
  { id: "action_moment", label: "动作瞬间", directive: "沿用系列基准，捕捉动作峰值与明确重心，保持角色结构和服装连续" },
  { id: "over_shoulder", label: "越肩关系", directive: "沿用系列基准，使用越肩或关系视角建立人物与对手、物件或空间的联系" },
  { id: "detail_closeup", label: "细节特写", directive: "沿用系列基准，聚焦手部、配饰或关键道具，材质与角色设定保持一致" },
  { id: "wide_scene", label: "环境全景", directive: "沿用系列基准，扩大景别呈现人物与环境关系，保持角色仍然可识别" },
];

const MODE_VARIATIONS: Partial<Record<CreativeDeliveryMode, CandidateVariation[]>> = {
  character_sheet: [
    { id: "sheet_complete", label: "完整设定", directive: "完整呈现同一角色多角度、表情、服装和结构信息，主视图最大" },
    { id: "sheet_structure", label: "结构优先", directive: "保持同一角色，只加强正侧背比例、头部结构和身体结构的清晰度" },
    { id: "sheet_expression", label: "表情优先", directive: "保持同一角色和服装，只加强表情系统、微表情和头部多角度的可读性" },
    { id: "sheet_detail", label: "细节优先", directive: "保持同一角色和比例，只加强发型、材质、配饰、鞋履与手部细节" },
  ],
  story_scene: [
    GENERAL_VARIATIONS[0],
    { id: "action", label: "动作备选", directive: "保持人物身份、服装和场景不变，只加强动作方向、重心和人物与环境的互动" },
    GENERAL_VARIATIONS[2],
    GENERAL_VARIATIONS[3],
  ],
  series_pack: SERIES_VARIATION_LIBRARY.slice(0, 4),
  dynamic_keyframe: [
    { id: "motion_start", label: "动作起点", directive: "生成动作开始前的稳定关键帧，运动方向清楚，角色身份和场景结构锁定" },
    { id: "motion_bridge", label: "动作承接", directive: "生成可从起点自然过渡的动作承接关键帧，重心和视线方向连续" },
    { id: "emotion_peak", label: "情绪峰值", directive: "保持身份与场景，生成情绪达到峰值前的可动画化关键姿态" },
    { id: "frame_safe", label: "镜头安全", directive: "保持动作与身份，优化视频裁切安全区、肢体完整度和前后景运动空间" },
  ],
};

export const createDefaultSeriesPlan = () => SERIES_VARIATION_LIBRARY
  .slice(0, 4)
  .map((item) => ({ ...item }));

export const replaceCandidateVariation = (
  plan: CandidateVariation[],
  index: number,
  variationId: string,
) => {
  const replacement = SERIES_VARIATION_LIBRARY.find((item) => item.id === variationId);
  if (!replacement || index < 0 || index >= plan.length) return plan.map((item) => ({ ...item }));
  return plan.map((item, itemIndex) => itemIndex === index ? { ...replacement } : { ...item });
};

export const moveCandidateVariation = (
  plan: CandidateVariation[],
  index: number,
  offset: -1 | 1,
) => {
  const nextIndex = index + offset;
  const next = plan.map((item) => ({ ...item }));
  if (index < 0 || index >= next.length || nextIndex < 0 || nextIndex >= next.length) return next;
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
};

export const buildCandidateVariations = (
  count: 1 | 2 | 4,
  mode: CreativeDeliveryMode = "portrait",
  candidatePlan?: CreativeCandidatePlanItem[],
) => {
  const defaults = MODE_VARIATIONS[mode] ?? GENERAL_VARIATIONS;
  const source = candidatePlan?.length
    ? [...candidatePlan, ...defaults.filter((fallback) => !candidatePlan.some((item) => item.id === fallback.id))]
    : defaults;
  return source.slice(0, count).map((item) => ({ ...item }));
};
