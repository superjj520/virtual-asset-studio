/**
 * Magpie 免费池 provider
 *
 * 把本机 Magpie 网关（默认 http://127.0.0.1:3425/v1）接成项目里的一个 provider：
 * 出图走 `freeimg/flux`（本机 3436 端点 → Pollinations，零 key），
 * 文本走 `group/free-token-pool`（AMD Radeon Cloud 免费档，由 manage.sh 每天重建）。
 *
 * 设计要点：
 * 1. 一律经 Magpie，不直连厂商：厂商 key 只存在 Magpie 与 keys.env，两处都不落项目库。
 * 2. 六档尺寸原样透传（freeimg 端点按 32 对齐、上限 1536），被拒才退回 1024x1024。
 * 3. 免费档不支持负向提示词与参考图改写，所以 `negative` 收下但不外发、也不注册 imageEdit。
 */
import type {
  CreativeCard,
  CreativeCardSuggestion,
  GenerationQualityTier,
  ImageGenerationSize,
  PromptTranslation,
} from "../../../src/shared/types";
import { fetchProvider } from "./request";

export type MagpieProviderOptions = {
  /** 网关凭据：存 http(s) 地址时当地址用（本机 loopback 对 key 不敏感），否则当 key。 */
  apiKey: () => string | undefined;
  /** 显式指定网关地址，优先于凭据里的地址。 */
  baseUrl?: () => string | undefined;
  imageModel?: () => string | undefined;
  textModel?: () => string | undefined;
  /** 单次网关请求的超时，默认 5 分钟；深推理模型可以调大。 */
  timeoutMs?: number;
};

const DEFAULT_BASE_URL = "http://127.0.0.1:3425/v1";
const DEFAULT_IMAGE_MODEL = "freeimg/flux";
const DEFAULT_TEXT_MODEL = "group/free-token-pool";

export class MagpieProvider {
  readonly id = "magpie" as const;

  constructor(private readonly options: MagpieProviderOptions) {}

  isConfigured(): boolean {
    return Boolean(this.options.apiKey());
  }

  private baseUrl(): string {
    return (this.options.baseUrl?.() ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  private imageModel(): string {
    return this.options.imageModel?.() ?? DEFAULT_IMAGE_MODEL;
  }

  private textModel(): string {
    return this.options.textModel?.() ?? DEFAULT_TEXT_MODEL;
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const apiKey = this.options.apiKey();
    if (!apiKey)
      throw new Error(
        "尚未配置 Magpie 网关。请在模型连接页保存网关地址（默认 http://127.0.0.1:3425/v1）。",
      );
    let response: Response;
    try {
      response = await fetchProvider(
        "Magpie",
        `${this.baseUrl()}${path}`,
        { ...init, headers: { Authorization: `Bearer ${apiKey}`, ...(init.headers ?? {}) } },
        this.options.timeoutMs ?? 300_000,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // fetchProvider 已经把底层错误统一成两句中文：超时 / 连不上，直接按它分流。
      if (/请求超时|响应内容读取超时|abort|timeout|timed out/i.test(message))
        throw new Error(
          `Magpie 网关 ${Math.max(1, Math.round((this.options.timeoutMs ?? 300_000) / 60_000))} 分钟没有回应：池里这条路由卡住了（推理模型常见）。稍等再试，或把客户端超时调大。`,
        );
      if (/网络请求失败|ECONNREFUSED|fetch failed|socket hang up|connect ETIMEDOUT/i.test(message))
        throw new Error(
          "连不上 Magpie 网关：确认 Magpie 正在运行（菜单栏图标），地址是 http://127.0.0.1:3425/v1。",
        );
      throw error instanceof Error ? error : new Error(message);
    }
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(this.explainGatewayError(response.status, detail));
    }
    return response;
  }

  /**
   * 把网关的 HTTP 状态翻成能照着做的一句话。401/403 最常见的原因是设置页里把
   * 「网关地址」和「API Key」填反了——本机网关其实不校验 key，填地址才算配置好。
   */
  private explainGatewayError(status: number, detail: string): string {
    const raw = String(detail ?? "").slice(0, 300);
    if (status === 401 || status === 403)
      return `Magpie 拒绝了这次请求（${status}）：检查设置页里「Magpie 免费池」填的是不是网关地址 http://127.0.0.1:3425/v1（本机网关不校验 key）。原始报文：${raw}`;
    if (status === 429)
      return "池里所有能用的模型此刻都在限流（并发被占满）。等几十秒，或把深推理模型留给长任务。";
    if (status === 404)
      return `网关没有这个端点或模型（404）：确认模型名是 group/free-token-pool 或 freeimg/flux。原始报文：${raw}`;
    if (status >= 500)
      return `上游平台或网关内部出错（${status}），通常是那家免费平台在抖动。重试一次，仍失败就换组里的下一条路由。原始报文：${raw}`;
    return `Magpie 请求失败（${status}）：${raw}`;
  }

  /**
   * 网关说「没有会出图的平台」时，换成可执行的下一步。
   * 原始报文是 `magpie knows no model "X" to draw with`，看着像模型名写错，实际是缺 provider。
   */
  private explainImageError(error: unknown): never {
    const message = error instanceof Error ? error.message : String(error);
    if (/to draw with|knows no model/i.test(message))
      throw new Error(
        "免费池里还没有会出图的平台：先确认本机出图端点在线（curl http://127.0.0.1:3436/healthz），再执行 magpie provider add \"Free Image\" url=http://127.0.0.1:3436/v1 key=local models=flux id=freeimg。",
      );
    throw error instanceof Error ? error : new Error(message);
  }

  private async toImageBuffer(payload: {
    data?: Array<{ b64_json?: string; url?: string }>;
  }): Promise<Buffer> {
    const first = payload.data?.[0];
    if (first?.b64_json) return Buffer.from(first.b64_json, "base64");
    if (first?.url) {
      const response = await fetchProvider("Magpie 图片", first.url, { method: "GET" }, 120_000);
      if (!response.ok) throw new Error(`取回生成图片失败：HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    }
    throw new Error("Magpie 返回里没有图片数据（既无 b64_json 也无 url）。");
  }

  async generateImage(input: {
    prompt: string;
    /** 免费档没有负向提示词通道，收下但不外发；质量分档同理。 */
    negative?: string;
    size: ImageGenerationSize;
    quality?: "medium" | "high";
    seed?: number;
  }): Promise<Buffer> {
    const model = this.imageModel();
    const call = async (size: string) =>
      this.toImageBuffer(
        (await (
          await this.request("/images/generations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              prompt: input.prompt,
              size,
              n: 1,
              ...(input.seed === undefined ? {} : { seed: input.seed }),
            }),
          })
        ).json()) as { data?: Array<{ b64_json?: string; url?: string }> },
      );

    try {
      return await call(input.size);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 缺 provider 时重试没有意义。
      if (/to draw with|knows no model/i.test(message)) this.explainImageError(error);
      if (input.size === "1024x1024") throw error;
      // 免费档对尺寸卡得死：失败一次就退回正方形，不把 400 直接抛给用户。
      return await call("1024x1024");
    }
  }

  private async chatJson(messages: Array<{ role: string; content: string }>): Promise<string> {
    const response = await this.request("/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.textModel(),
        messages,
        temperature: 0.4,
        max_tokens: 1200,
        response_format: { type: "json_object" },
      }),
    });
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("Magpie 文本路由返回了空内容。");
    return content;
  }

  private parseJson(content: string): unknown {
    try {
      return JSON.parse(content);
    } catch {
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start >= 0 && end > start) return JSON.parse(content.slice(start, end + 1));
      throw new Error("Magpie 返回的不是合法 JSON。");
    }
  }

  /** 给创作卡补字段；接口形状与 DeepSeekProvider 一致，可直接替换。 */
  async enrichCreativeCard(card: CreativeCard): Promise<CreativeCardSuggestion> {
    const content = await this.chatJson([
      {
        role: "system",
        content:
          "你是资深商业人像与产品摄影的创作顾问。只输出 JSON 对象，字段限定为 scene、lighting、camera、style、reasoning，每个字段不超过 40 个字，全部用简体中文。",
      },
      {
        role: "user",
        content: `现有创作卡：\n${JSON.stringify(card)}\n请补齐缺失的场景、光线、镜头与风格，并给一句取舍理由。`,
      },
    ]);
    return this.parseJson(content) as CreativeCardSuggestion;
  }

  /** 按目标绘图供应商改写提示词；免费池只有一套通用写法，所以三档质量差异靠描述精度体现。 */
  async translatePrompt(input: {
    prompt: string;
    negative?: string;
    providerId: PromptTranslation["providerId"];
    qualityTier: GenerationQualityTier;
  }): Promise<PromptTranslation> {
    const content = await this.chatJson([
      {
        role: "system",
        content:
          "你是文生图提示词工程师。把用户的中文描述改写成给扩散模型用的英文提示词，只输出 JSON：" +
          '{"positive": "...", "negative": "...", "notes": ["..."]}。' +
          "positive 用逗号分隔的短语，包含主体、材质、光线、镜头、构图、风格；negative 只列确实要避免的项；notes 最多 3 条，用简体中文。",
      },
      {
        role: "user",
        content:
          `目标模型：${input.providerId}\n质量档：${input.qualityTier}\n` +
          `原始描述：${input.prompt}\n需要避免：${input.negative?.trim() || "无"}`,
      },
    ]);
    const parsed = this.parseJson(content) as Partial<PromptTranslation>;
    if (!parsed.positive?.trim()) throw new Error("Magpie 没有返回可用的正向提示词。");
    return {
      providerId: input.providerId,
      qualityTier: input.qualityTier,
      positive: parsed.positive.trim(),
      negative: parsed.negative?.trim() ?? input.negative?.trim() ?? "",
      notes: Array.isArray(parsed.notes) ? parsed.notes.slice(0, 3) : [],
    };
  }
}
