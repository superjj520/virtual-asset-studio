import { describe, expect, it } from "vitest";
import { identityAnchorWarning } from "./identity-anchor";

describe("身份锚点提示", () => {
  it("没有锚点时说清后果", () => {
    expect(identityAnchorWarning("   ")).toContain("会自由发挥");
  });

  it("锚点里没有发色发型时提醒", () => {
    expect(identityAnchorWarning("圆脸、单眼皮、二十岁")).toContain("没提发色或发型");
  });

  it("写了发色或发型就不再打扰", () => {
    expect(identityAnchorWarning("圆脸、单眼皮、黑发齐肩")).toBeUndefined();
    expect(identityAnchorWarning("高鼻梁、短卷发")).toBeUndefined();
    expect(identityAnchorWarning("瓜子脸、扎马尾")).toBeUndefined();
  });
});
