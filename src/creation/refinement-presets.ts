import type { CreativeCard } from "../shared/types";

export type CreationRefinementId =
  | "expression"
  | "pose"
  | "wardrobe"
  | "scene"
  | "camera"
  | "lighting";

export type CreationRefinementPreset = {
  id: CreationRefinementId;
  label: string;
  description: string;
  apply: (card: CreativeCard) => CreativeCard;
};

const append = (current: string, value: string) =>
  [...new Set([current.trim(), value.trim()].filter(Boolean))].join("；");

export const CREATION_REFINEMENTS: CreationRefinementPreset[] = [
  {
    id: "expression",
    label: "换表情",
    description: "身份、造型和场景不变",
    apply: (card) => ({
      ...card,
      expressionAndPose: append(card.expressionAndPose, "只改变面部表情，让情绪更自然可读；身体姿态保持不变"),
      mustKeep: append(card.mustKeep ?? "", "保持脸部结构、发型、服装、身体比例与场景不变"),
    }),
  },
  {
    id: "pose",
    label: "换动作",
    description: "人物身份和造型不变",
    apply: (card) => ({
      ...card,
      expressionAndPose: append(card.expressionAndPose, "只改变人物动作与肢体姿态，动作自然且符合人体结构"),
      mustKeep: append(card.mustKeep ?? "", "保持人物身份、脸部、发型、服装和场景不变"),
    }),
  },
  {
    id: "wardrobe",
    label: "换造型",
    description: "角色身份和身形不变",
    apply: (card) => ({
      ...card,
      bodyAndWardrobe: append(card.bodyAndWardrobe, "只重新设计服装、鞋履与配饰，穿着方式和材质真实"),
      mustKeep: append(card.mustKeep ?? "", "保持人物身份、脸部、发型、身体比例和场景不变"),
    }),
  },
  {
    id: "scene",
    label: "换场景",
    description: "人物与造型全部锁定",
    apply: (card) => ({
      ...card,
      scene: append(card.scene, "只替换为同一世界观下的新场景，人物与环境产生真实互动"),
      mustKeep: append(card.mustKeep ?? "", "保持人物身份、脸部、身形、发型、服装和动作不变"),
    }),
  },
  {
    id: "camera",
    label: "换镜头",
    description: "内容不变，只换景别机位",
    apply: (card) => ({
      ...card,
      camera: append(card.camera, "只改变景别、机位或构图关系，透视自然且主体结构不变"),
      mustKeep: append(card.mustKeep ?? "", "保持人物、服装、动作、场景与光线逻辑不变"),
    }),
  },
  {
    id: "lighting",
    label: "换光线",
    description: "构图与内容保持不变",
    apply: (card) => ({
      ...card,
      lighting: append(card.lighting, "只改变光线方向、软硬与色温，光源符合场景逻辑"),
      mustKeep: append(card.mustKeep ?? "", "保持人物、服装、动作、场景布局和镜头不变"),
    }),
  },
];

const STORY_SCENE_REFINEMENT_COPY: Partial<Record<CreationRefinementId, Pick<CreationRefinementPreset, "label" | "description">>> = {
  expression: { label: "情绪强度", description: "只调整面部与呼吸状态" },
  pose: { label: "剧情动作", description: "只调整动作与人物重心" },
  wardrobe: { label: "造型状态", description: "只调整剧情中的穿着状态" },
  scene: { label: "空间关系", description: "只调整人物与环境的关系" },
  camera: { label: "叙事镜头", description: "只调整景别、视角与视觉重点" },
  lighting: { label: "时间光线", description: "只调整时间感与光线气氛" },
};

/**
 * 同一套单变量约束在不同作品类型中使用不同的用户语言。
 * 底层仍保存稳定编号，避免 UI 文案变化破坏已经归档的创作任务。
 */
export const getCreationRefinements = (deliveryMode?: CreativeCard["deliveryMode"]) =>
  deliveryMode === "story_scene"
    ? CREATION_REFINEMENTS.map((preset) => ({ ...preset, ...STORY_SCENE_REFINEMENT_COPY[preset.id] }))
    : CREATION_REFINEMENTS;

export const applyCreationRefinement = (
  card: CreativeCard,
  refinementId: CreationRefinementId,
) => CREATION_REFINEMENTS.find((item) => item.id === refinementId)?.apply(card) ?? card;
