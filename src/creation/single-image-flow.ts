import type { CreationQuickStage } from "./creation-flow";

export type SingleImageSourceMode = "new" | "saved" | "reference";

export type SingleImageChoiceId = "source" | "direction" | "look" | "scene" | "shot" | "constraints";

export type SingleImageChoice = {
  id: SingleImageChoiceId;
  stage: CreationQuickStage;
  label: string;
  value: string;
};

export type SingleImageReviewGroup = {
  title: string;
  items: Array<{ id: SingleImageChoiceId | "performance" | "ratio"; label: string; value: string }>;
};

export type SingleImageChoiceInput = {
  sourceMode: SingleImageSourceMode;
  /** 已确认的来源名称：角色名、参考图友好名称或样片名称。 */
  sourceName?: string;
  presetLabel: string;
  roleLabel?: string;
  wardrobeLabel?: string;
  poseLabel?: string;
  expressionLabel?: string;
  sceneLabel?: string;
  sceneIsCustom?: boolean;
  sceneText?: string;
  moodLabel?: string;
  shotLabel?: string;
  styleLabel?: string;
  aspectRatio?: string;
  constraintLabels: string[];
};

const joinLabels = (...values: Array<string | undefined>) =>
  values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)).join(" · ");

const fallback = (value: string | undefined, empty: string) => (value?.trim() ? value.trim() : empty);

/** 人物来源只回答“这个人从哪来”，不重复视觉方向。 */
export function describeSingleImageSource(input: Pick<SingleImageChoiceInput, "sourceMode" | "sourceName">) {
  const name = input.sourceName?.trim();
  if (input.sourceMode === "saved") return name ? `角色 · ${name}` : "角色资产";
  if (input.sourceMode === "reference") return name ? `参考图 · ${name}` : "参考图";
  return "原创角色";
}

function describeScene(input: SingleImageChoiceInput) {
  if (input.sceneIsCustom) return joinLabels(input.sceneText?.trim() || "自定义场景", input.moodLabel);
  return joinLabels(input.sceneLabel, input.moodLabel);
}

/**
 * 即时预览用的「已选约束」：固定六条，顺序与选择流水线一致，
 * 让用户在任意步骤都能确认“我已经选了什么”。
 */
export function buildSingleImageChoices(input: SingleImageChoiceInput): SingleImageChoice[] {
  return [
    { id: "source", stage: "direction", label: "人物来源", value: describeSingleImageSource(input) },
    { id: "direction", stage: "direction", label: "视觉方向", value: fallback(input.presetLabel, "待选择") },
    { id: "look", stage: "character", label: "造型", value: joinLabels(input.roleLabel, input.wardrobeLabel) || "待选择" },
    { id: "scene", stage: "story", label: "场景", value: fallback(describeScene(input), "待选择") },
    { id: "shot", stage: "output", label: "镜头", value: joinLabels(input.shotLabel, input.styleLabel) || "待选择" },
    {
      id: "constraints",
      stage: "output",
      label: "必须保持",
      value: input.constraintLabels.length ? input.constraintLabels.join(" · ") : "未锁定",
    },
  ];
}

/** 生成前确认按“人物 / 画面”两组复核，信息比约束条更完整。 */
export function buildSingleImageReview(input: SingleImageChoiceInput): SingleImageReviewGroup[] {
  return [
    {
      title: "人物",
      items: [
        { id: "source", label: "人物来源", value: describeSingleImageSource(input) },
        { id: "direction", label: "视觉方向", value: fallback(input.presetLabel, "待选择") },
        { id: "look", label: "角色造型", value: joinLabels(input.roleLabel, input.wardrobeLabel) || "待选择" },
        { id: "performance", label: "动作表情", value: joinLabels(input.poseLabel, input.expressionLabel) || "待选择" },
      ],
    },
    {
      title: "画面",
      items: [
        { id: "scene", label: "场景气质", value: fallback(describeScene(input), "待选择") },
        { id: "shot", label: "镜头质感", value: joinLabels(input.shotLabel, input.styleLabel) || "待选择" },
        { id: "ratio", label: "画面比例", value: fallback(input.aspectRatio, "2:3") },
        {
          id: "constraints",
          label: "必须保持",
          value: input.constraintLabels.length ? input.constraintLabels.join(" · ") : "未锁定",
        },
      ],
    },
  ];
}

/** 确认面板标题上的完成度提示。 */
export function summarizeSingleImageChoices(choices: SingleImageChoice[]) {
  const pending = choices.filter((choice) => choice.value === "待选择");
  return { total: choices.length, pending: pending.length, locked: choices.length - pending.length };
}
