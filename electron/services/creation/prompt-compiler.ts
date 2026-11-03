import type {
  CreativeCard,
  PromptBuild,
  ShotContract,
} from "../../../src/shared/types";
import { normalizeCreativeAspectRatio } from "../../../src/shared/types";

const clean = (value: string) => value.trim().replace(/\s+/g, " ");

const module = (label: string, value: string) => ({
  label,
  value: clean(value),
});

/**
 * 把创作卡编译成提示词。
 *
 * 两个刻意的改动（依据见 docs/R55-PROMPT-COMPETITOR-TRUEJPEG.md）：
 *
 * 1. **分段输出**，不再用分号连成一行。对吃长文本的模型（Qwen-Image-Edit、Seedream）
 *    换行是明确的分段信号，分号只是标点。
 * 2. **`avoid` 同时进 `positive` 末尾的「避免」段**。`negative` 字段照旧给它，
 *    但 cfg=1 的工作流里反向词根本不起作用（Qwen-Image-Edit 官方那条就是
 *    cfg 1 + Lightning 4 步），只靠 negative 等于没写。竞品 truejpeg 的 144 条作品
 *    negative 全空、71% 把「不要/避免」写进正向段落，是同一个结论。
 */
export const compilePrompt = (card: CreativeCard): PromptBuild => {
  const modules = [
    module("创作意图", card.intent),
    module("视觉生产范式", card.paradigmModule ?? ""),
    module("人物主体", card.subject),
    module("身份锚点", card.identityAnchor),
    module("必须贴合", card.mustKeep ?? ""),
    module("身材与衣着", card.bodyAndWardrobe),
    module("神态与姿势", card.expressionAndPose),
    module("场景", card.scene),
    module("光线", card.lighting),
    module("镜头", card.camera),
    module("具体视觉风格", card.style),
    module("画面质感", card.texture ?? ""),
    module("已验证学习策略", card.learningModule ?? ""),
    module("画幅", normalizeCreativeAspectRatio(card.aspectRatio)),
    module("避免", card.avoid),
  ].filter((item) => item.value);
  return {
    positive: modules.map((item) => `${item.label}：${item.value}`).join("\n"),
    negative: clean(card.avoid),
    modules,
  };
};

export const compileShotContract = (input: ShotContract): string => {
  const isImage = input.deliveryType === "image";
  const safetyAvoids = ["身份漂移", "肢体畸形", "画面闪烁", "镜头跳变"];
  const avoids = [
    ...new Set([...input.avoid.map(clean).filter(Boolean), ...safetyAvoids]),
  ];
  const lines = [
    `主体锚点：${clean(input.subjectAnchor)}`,
    `${isImage ? "画面构图" : "起始画面"}：${clean(input.startFrame)}`,
    `${isImage ? "姿态与动作" : "唯一动作"}：${clean(input.action)}`,
    `${isImage ? "镜头与机位" : "镜头运动"}：${clean(input.cameraMotion)}`,
    ...(isImage ? [] : [`时长与帧率：${input.durationSeconds} 秒，${input.frameRate}fps`]),
    `必须保持：${input.keep.map(clean).filter(Boolean).join("；") || "人物身份、服装、场景连续性"}`,
    `避免：${avoids.join("；")}`,
    `输出：${input.output.aspectRatio}${isImage ? "，高质量静态图片" : `，${input.output.resolution}`}`,
  ];
  return lines.join("\n");
};
