import { describe, expect, it } from "vitest";
import { resolveGenerationReadiness } from "./generation-readiness";

const preflight = (ok: boolean, issues: string[] = []) => ({ ok, issues, model: undefined });

describe("generation readiness", () => {
  it("预检通过时可以生成", () => {
    expect(resolveGenerationReadiness({ preflight: preflight(true) }).canGenerate).toBe(true);
  });
  it("未配置模型时首位问题就是主原因", () => {
    const result = resolveGenerationReadiness({ preflight: preflight(false, ["fal 未配置 API 密钥。"]) });
    expect(result.canGenerate).toBe(false);
    expect(result.primaryIssue).toBe("fal 未配置 API 密钥。");
  });
  it("预算超限优先于模型问题", () => {
    const result = resolveGenerationReadiness({ preflight: preflight(false, ["模型不可用"]), budgetExceeded: true });
    expect(result.primaryIssue).toContain("月度预算");
  });
  it("生成中不重复触发生成", () => {
    expect(resolveGenerationReadiness({ preflight: preflight(true), isGenerating: true }).canGenerate).toBe(false);
  });
});
