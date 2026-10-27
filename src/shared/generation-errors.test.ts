import { describe, expect, it } from "vitest";
import { classifyGenerationError } from "./generation-errors";

describe("classifyGenerationError", () => {
  it("区分未配置、额度和限流", () => {
    expect(classifyGenerationError("尚未配置 fal API 密钥").kind).toBe("missing_configuration");
    expect(classifyGenerationError("fal 返回 403：余额耗尽").kind).toBe("quota_exhausted");
    expect(classifyGenerationError("429 rate limit").kind).toBe("rate_limited");
  });

  it("区分安全拦截、参数错误和网络未知", () => {
    expect(classifyGenerationError("safety checker blocked").kind).toBe("safety_blocked");
    expect(classifyGenerationError("unsupported image size").kind).toBe("unsupported_request");
    expect(classifyGenerationError("fetch failed: timeout").kind).toBe("network_unknown");
  });

  it("网络未知明确禁止盲目重试", () => {
    const info = classifyGenerationError("状态未知：连接中断");
    expect(info.kind).toBe("network_unknown");
    expect(info.safeToRetry).toBe(false);
    expect(info.retryable).toBe(false);
  });

  it("配置缺失可安全重试但不应自动重试", () => {
    const info = classifyGenerationError("401 unauthorized");
    expect(info.kind).toBe("missing_configuration");
    expect(info.retryable).toBe(false);
    expect(info.safeToRetry).toBe(true);
  });

  it("空消息回到未知而不是伪装成成功", () => {
    expect(classifyGenerationError("")).toMatchObject({ kind: "unknown", title: "生成失败" });
    expect(classifyGenerationError(null).safeToRetry).toBe(false);
  });
});
