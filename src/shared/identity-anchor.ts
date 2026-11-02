/**
 * 身份锚点是出图唯一能约束「这张脸」的文本。
 * 它为空或者没提发色/发型时，换一组参考图模型就会自由发挥——
 * 而卡面上看不出这件事，所以要在写的时候提醒。
 */
const HAIR_HINTS = ["发", "刘海", "马尾", "辫", "卷", "直发", "光头"];

export const identityAnchorWarning = (anchor: string): string | undefined => {
  const text = anchor.trim();
  if (!text) {
    return "身份锚点还没写：不写这段，出图会自由发挥脸型和发色。至少写「圆脸、黑发齐肩」。";
  }
  if (!HAIR_HINTS.some((hint) => text.includes(hint))) {
    return "身份锚点没提发色或发型，换一组参考图就容易漂移。补一句「黑发齐肩直发」这类具体描述。";
  }
  return undefined;
};
