import type {
  CharacterExtensionKind,
  CharacterState,
  CreativeCandidatePlanItem,
  CreativeCard,
  CreativeDeliveryMode,
} from "../shared/types";

export type CharacterExtensionOption = {
  id: CharacterExtensionKind;
  label: string;
  description: string;
  result: string;
  marker: string;
  deliveryMode: CreativeDeliveryMode;
};

export const CHARACTER_EXTENSION_OPTIONS: CharacterExtensionOption[] = [
  { id: "portrait", label: "定妆肖像", description: "固定脸、发型与主造型", result: "单张主视觉", marker: "肖", deliveryMode: "portrait" },
  { id: "expression_set", label: "表情组", description: "同一机位测试情绪变化", result: "4 张表情资产", marker: "情", deliveryMode: "character_sheet" },
  { id: "pose_set", label: "动作组", description: "保持身份与服装，只换动作", result: "4 张动作资产", marker: "动", deliveryMode: "series_pack" },
  { id: "wardrobe_set", label: "服装变体", description: "保留角色结构，切换造型", result: "4 套造型方案", marker: "装", deliveryMode: "series_pack" },
  { id: "story_scene", label: "剧情场景", description: "把角色放进叙事瞬间", result: "场景关键画面", marker: "景", deliveryMode: "story_scene" },
  { id: "series_pack", label: "连续镜头", description: "规划同一角色的镜头序列", result: "4 个连续镜头", marker: "序", deliveryMode: "series_pack" },
  { id: "dialogue_scene", label: "对话演出", description: "围绕关系与台词组织表演", result: "对话场景方案", marker: "话", deliveryMode: "story_scene" },
  { id: "dynamic_keyframe", label: "动态关键帧", description: "为漫剧与视频准备动作节点", result: "4 个关键帧", marker: "帧", deliveryMode: "dynamic_keyframe" },
];

const EXPRESSION_PLAN: CreativeCandidatePlanItem[] = [
  { id: "expression_neutral", label: "平静", directive: "保持角色、服装、机位和光线不变，只呈现平静自然表情" },
  { id: "expression_smile", label: "放松", directive: "保持角色、服装、机位和光线不变，只呈现轻微放松与自然微笑" },
  { id: "expression_tense", label: "紧张", directive: "保持角色、服装、机位和光线不变，只呈现克制的紧张与呼吸变化" },
  { id: "expression_resolve", label: "坚定", directive: "保持角色、服装、机位和光线不变，只呈现坚定视线与轻微面部用力" },
];

const POSE_PLAN: CreativeCandidatePlanItem[] = [
  { id: "pose_front", label: "标准站姿", directive: "保持身份、服装与场景不变，使用自然标准站姿，身体结构清楚" },
  { id: "pose_turn", label: "回身", directive: "保持身份、服装与场景不变，只切换为自然回身动作" },
  { id: "pose_lean", label: "倚靠", directive: "保持身份、服装与场景不变，只切换为有真实重心支撑的倚靠姿态" },
  { id: "pose_action", label: "动作瞬间", directive: "保持身份、服装与场景不变，只切换为重心明确的动作峰值" },
];

const WARDROBE_PLAN: CreativeCandidatePlanItem[] = [
  { id: "wardrobe_base", label: "主造型", directive: "沿用角色正式主造型，完整呈现材质、层次和鞋履" },
  { id: "wardrobe_daily", label: "日常造型", directive: "保持人物身份和身体比例，只切换为符合角色身份的日常造型" },
  { id: "wardrobe_work", label: "工作造型", directive: "保持人物身份和身体比例，只切换为符合角色职业的工作造型" },
  { id: "wardrobe_event", label: "重要场合", directive: "保持人物身份和身体比例，只切换为重要场合的完整造型" },
];

const PORTRAIT_PLAN: CreativeCandidatePlanItem[] = [
  { id: "portrait_identity", label: "身份基准", directive: "用正面或轻微三分之四角度建立角色主视觉，优先锁定脸部、发型、年龄感与主造型" },
  { id: "portrait_presence", label: "气质强化", directive: "保持身份、服装与镜头距离不变，只加强角色气质、视线与身体语言" },
  { id: "portrait_detail", label: "细节近景", directive: "保持角色身份与造型不变，靠近观察脸部、发型、材质和配饰细节" },
  { id: "portrait_environment", label: "环境关系", directive: "保持角色身份与主造型不变，让人物与当前场景建立清楚但克制的空间关系" },
];

const STORY_SCENE_PLAN: CreativeCandidatePlanItem[] = [
  { id: "story_opening", label: "开场建立", directive: "先交代人物、地点与关系位置；角色身份、服装和场景基线保持一致" },
  { id: "story_drive", label: "目标推进", directive: "沿用开场连续性，让人物通过动作、视线或空间移动主动推进当前目标" },
  { id: "story_conflict", label: "冲突爆发", directive: "保持身份与时空连续，只把内在冲突转化为清楚的动作、关系压力与情绪峰值" },
  { id: "story_afterglow", label: "情绪余波", directive: "保持角色、服装与场景连续，用克制的近景或静止动作收束冲突后的情绪" },
];

const DIALOGUE_PLAN: CreativeCandidatePlanItem[] = [
  { id: "dialogue_probe", label: "试探", directive: "保持双方身份与站位连续，用克制视线和微表情建立对话关系" },
  { id: "dialogue_pressure", label: "施压", directive: "沿用同一空间轴线，只加强距离、姿态与视线带来的关系压力" },
  { id: "dialogue_turn", label: "关系转折", directive: "保持角色和场景连续，用一个明确反应或动作表现关系发生变化" },
  { id: "dialogue_silence", label: "沉默余韵", directive: "保持对话后的身份、服装与空间连续，用停顿、呼吸和视线收束情绪" },
];

const SERIES_PLAN: CreativeCandidatePlanItem[] = [
  { id: "series_establish", label: "建立场景", directive: "用环境全景交代角色、地点与空间关系，角色仍然清楚可识别" },
  { id: "series_relation", label: "关系镜头", directive: "保持身份、服装与场景连续，使用中景建立人物与环境或对象的关系" },
  { id: "series_action", label: "动作镜头", directive: "保持身份、服装与场景连续，呈现明确动作和真实重心" },
  { id: "series_emotion", label: "情绪特写", directive: "保持身份、服装与场景连续，用近景收束情绪与视线" },
];

const KEYFRAME_PLAN: CreativeCandidatePlanItem[] = [
  { id: "keyframe_start", label: "动作起点", directive: "动作开始前的稳定姿态，运动方向和重心清楚" },
  { id: "keyframe_prepare", label: "动作准备", directive: "保持角色与场景连续，呈现蓄力与即将移动的状态" },
  { id: "keyframe_peak", label: "动作峰值", directive: "保持角色与场景连续，捕捉动作幅度最大的可动画化姿态" },
  { id: "keyframe_end", label: "动作落点", directive: "保持角色与场景连续，呈现动作结束后的稳定落点" },
];

const merge = (...values: Array<string | undefined>) => [...new Set(values
  .flatMap((value) => value?.split("；") ?? [])
  .map((value) => value.trim())
  .filter(Boolean))].join("；");

const planFor = (kind: CharacterExtensionKind) => {
  if (kind === "portrait") return PORTRAIT_PLAN;
  if (kind === "expression_set") return EXPRESSION_PLAN;
  if (kind === "pose_set") return POSE_PLAN;
  if (kind === "wardrobe_set") return WARDROBE_PLAN;
  if (kind === "story_scene") return STORY_SCENE_PLAN;
  if (kind === "series_pack") return SERIES_PLAN;
  if (kind === "dialogue_scene") return DIALOGUE_PLAN;
  if (kind === "dynamic_keyframe") return KEYFRAME_PLAN;
  return undefined;
};

const directiveFor = (kind: CharacterExtensionKind) => ({
  portrait: "完成可作为角色主视觉的定妆肖像，身份、脸部、发型、身体比例和主造型必须稳定",
  expression_set: "建立同一角色的标准表情资产；所有画面使用统一机位、光线、发型与服装，只改变表情",
  pose_set: "建立同一角色的标准动作资产；身份、服装和身体比例固定，只改变姿态、重心与动作方向",
  wardrobe_set: "建立同一角色的服装变体；脸部、发型、身体比例和角色气质固定，只改变完整造型",
  story_scene: "让角色进入完整剧情场景，动作、情绪与环境关系必须可读，同时保持身份连续",
  series_pack: "建立同一角色的连续镜头组，身份、服装、场景、时间与光线保持连续",
  dialogue_scene: "建立双向对话演出画面，角色身份稳定，视线、站位、情绪和关系方向清楚",
  dynamic_keyframe: "建立可用于漫剧或视频的动作关键帧，角色身份、服装和场景结构持续一致",
} as const)[kind];

export const buildCharacterExtensionCard = ({
  base,
  characterId,
  versionId,
  stateId,
  kind,
  state,
}: {
  base: CreativeCard;
  characterId: string;
  versionId?: string;
  stateId?: string;
  kind: CharacterExtensionKind;
  state?: CharacterState;
}): CreativeCard => {
  const option = CHARACTER_EXTENSION_OPTIONS.find((item) => item.id === kind)!;
  const candidatePlan = planFor(kind)?.map((item) => ({ ...item }));
  return {
    ...base,
    deliveryMode: option.deliveryMode,
    characterExtension: {
      kind,
      sourceCharacterId: characterId,
      sourceVersionId: versionId,
      sourceStateId: stateId,
    },
    intent: option.label,
    bodyAndWardrobe: merge(base.bodyAndWardrobe, state?.wardrobe, state?.hair),
    expressionAndPose: merge(base.expressionAndPose, state?.expression, state?.pose, state?.emotion, directiveFor(kind)),
    scene: merge(base.scene, state?.scene),
    mustKeep: merge(base.mustKeep, state?.continuityNotes, "角色脸部结构、年龄感、发型基线和身体比例不得改变"),
    candidatePlan,
    aspectRatio: ["expression_set", "pose_set", "wardrobe_set"].includes(kind) ? "4:3" : base.aspectRatio,
  };
};
