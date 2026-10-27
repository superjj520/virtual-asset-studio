import type { GenerationPreflight } from "../shared/generation-models";

export type GenerationReadiness = {
  canGenerate: boolean;
  primaryIssue?: string;
  actionHint: string;
};

/** 主按钮、候选栏和生成入口共用的可生成判断，避免各自解释不同。 */
export function resolveGenerationReadiness(input: {
  preflight: Pick<GenerationPreflight, "ok" | "issues" | "model">;
  budgetExceeded?: boolean;
  isGenerating?: boolean;
}): GenerationReadiness {
  if (input.isGenerating) return { canGenerate: false, actionHint: "正在生成，请等待当前批次完成。" };
  if (input.budgetExceeded) return { canGenerate: false, primaryIssue: "本批预计费用超过月度预算。", actionHint: "调整候选数量或月度预算后再生成。" };
  if (input.preflight.ok) return { canGenerate: true, actionHint: "可以生成。" };
  const primaryIssue = input.preflight.issues[0] ?? "当前没有可用的图像模型。";
  return { canGenerate: false, primaryIssue, actionHint: "先在设置中配置模型，或换一个支持当前画幅/参考图的模型。" };
}
