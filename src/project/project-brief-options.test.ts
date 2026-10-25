import { describe, expect, it } from "vitest";
import { isCustomBriefValue, toggleAcceptance } from "./project-brief-options";

describe("项目默认方案选项", () => {
  it("能识别标准选项与旧数据中的自定义内容", () => {
    expect(isCustomBriefValue("goal", "建立可复用角色")).toBe(false);
    expect(isCustomBriefValue("goal", "制作十集连续漫剧角色资产")).toBe(true);
  });

  it("验收重点支持多选与取消", () => {
    expect(toggleAcceptance("人物一致", "真人质感")).toBe("人物一致；真人质感");
    expect(toggleAcceptance("人物一致；真人质感", "人物一致")).toBe("真人质感");
  });
});
