export type GenerationErrorKind =
  | "missing_configuration"
  | "auth_failed"
  | "quota_exhausted"
  | "rate_limited"
  | "safety_blocked"
  | "unsupported_request"
  | "network_unknown"
  | "provider_failed"
  | "unknown";

export type GenerationErrorInfo = {
  kind: GenerationErrorKind;
  title: string;
  detail: string;
  action: string;
  /** 请求是否值得直接重试；额度/配置/状态未知不应盲目重试。 */
  retryable: boolean;
  /** 重试是否会带来重复扣费风险。 */
  safeToRetry: boolean;
};

const RULES: Array<{ pattern: RegExp; info: GenerationErrorInfo }> = [
  {
    pattern: /未配置|api key 未配置|api 密钥未配置|not configured/i,
    info: {
      kind: "missing_configuration",
      title: "模型未配置",
      detail: "当前模型对应的服务还没有保存密钥。",
      action: "到设置 → 模型连接保存密钥后再试。",
      retryable: false,
      safeToRetry: true,
    },
  },
  {
    pattern: /401|unauthorized|forbidden|authentication required|invalid api key|permission|无权限|鉴权失败/i,
    info: {
      kind: "auth_failed",
      title: "密钥无效或无权限",
      detail: "服务拒绝了这次认证，通常不是模型未配置，而是密钥无效、被禁用或账号没有该模型权限。",
      action: "到设置 → 模型连接重新保存该服务的 Key，并确认账号已开通对应模型权限；不要连续重试。",
      retryable: false,
      safeToRetry: true,
    },
  },
  {
    pattern: /余额|额度|quota|exhausted|402|insufficient|欠费/i,
    info: {
      kind: "quota_exhausted",
      title: "额度不足",
      detail: "服务返回余额或配额不足。",
      action: "充值或切换模型；不要连续重试。",
      retryable: false,
      safeToRetry: true,
    },
  },
  {
    pattern: /429|rate limit|频率|过于频繁/i,
    info: {
      kind: "rate_limited",
      title: "请求过于频繁",
      detail: "服务暂时限流。",
      action: "等待一段时间后重试。",
      retryable: true,
      safeToRetry: true,
    },
  },
  {
    pattern: /safety|审核|拦截|blocked|nsfw|policy/i,
    info: {
      kind: "safety_blocked",
      title: "内容被安全策略拦截",
      detail: "提示词或参考图触发了服务的内容限制。",
      action: "调整画面描述或替换参考图后再试。",
      retryable: true,
      safeToRetry: true,
    },
  },
  {
    pattern: /invalid|unsupported|400|参数|画幅|尺寸|too many|reference/i,
    info: {
      kind: "unsupported_request",
      title: "请求参数不受支持",
      detail: "当前模型不接受该画幅、参考图或参数组合。",
      action: "检查画幅与参考图设置，或切换模型。",
      retryable: false,
      safeToRetry: true,
    },
  },
  {
    pattern: /timeout|超时|network|econn|enotfound|fetch failed|unknown|状态未知/i,
    info: {
      kind: "network_unknown",
      title: "结果状态未知",
      detail: "请求可能已经到达服务，但没有拿到确定结果。",
      action: "先到生成队列核对，不要盲目重试以免重复扣费。",
      retryable: false,
      safeToRetry: false,
    },
  },
  {
    pattern: /500|502|503|504|internal|server error|服务异常/i,
    info: {
      kind: "provider_failed",
      title: "模型服务失败",
      detail: "服务端返回错误，本次通常没有产生可用结果。",
      action: "查看追踪信息后可重试。",
      retryable: true,
      safeToRetry: true,
    },
  },
];

const UNKNOWN: GenerationErrorInfo = {
  kind: "unknown",
  title: "生成失败",
  detail: "没有识别出明确的失败原因。",
  action: "查看追踪信息后再决定是否重试。",
  retryable: false,
  safeToRetry: false,
};

export function classifyGenerationError(message?: string | null): GenerationErrorInfo {
  const text = message?.trim();
  if (!text) return UNKNOWN;
  return RULES.find((rule) => rule.pattern.test(text))?.info ?? UNKNOWN;
}
