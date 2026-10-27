export type BatchVariable = { label: string; prompt: string };

export const buildBatchVariables = ({
  values,
  positive,
  negative,
  series,
}: {
  values: string[];
  positive: string;
  negative?: string;
  series: boolean;
}): BatchVariable[] => values.map((value, index) => {
  const separator = value.indexOf("：");
  const label = series && separator > 0 ? value.slice(0, separator) : `变体 ${index + 1}：${value}`;
  const directive = series && separator > 0 ? value.slice(separator + 1) : value;
  const negativeLine = negative ? `\n避免：${negative}` : "";
  const prompt = series
    ? `${positive}${negativeLine}\n镜头方向：${directive}。其余人物身份、服装、构图与限制保持不变。`
    : `${positive}${negativeLine}\n本轮唯一变化：场景为${directive}。其余人物身份、服装、构图与限制保持不变。`;
  return { label, prompt };
});
