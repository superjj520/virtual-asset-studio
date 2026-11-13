/**
 * Magpie 免费池 provider 适配器
 *
 * 放到：virtual-asset-studio-dsh-c4/electron/services/providers/magpie-provider.ts
 *
 * 作用：把本机 Magpie 网关（默认 http://127.0.0.1:3425/v1）接成项目里的一个 provider，
 * 让「生图 / 改图 / 生视频 / 文本」都走免费模型，不花一分钱。
 *
 * 免费模型建议（都需要到对应平台领 key，写进 keys.env 后由 Magpie 管）：
 *   生图：zhipu/cogview-3-flash（智谱，完全免费）
 *   视频：zhipu/cogvideox-flash（智谱，免费；单段 5–10 秒，会排队）
 *   文本：group/free-token-pool（现在跑的是 AMD Radeon Cloud 的免费档）
 *
 * 设计要点：
 * 1. 请求一律经 Magpie，不直连厂商：key 只存在 Magpie 一处，项目里不落厂商密钥。
 * 2. 图片尺寸要做映射：项目的三档尺寸（1024x1024 / 1024x1536 / 1536x1024）不是所有免费模型都收，
 *    先映射到目标模型支持的档，失败再退回 1024x1024，避免用户看到生硬的 400。
 * 3. 返回体两种都要吃：b64_json（智谱）和 url（部分聚合网关）。
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type {
  CreativeCard,
  CreativeCardSuggestion,
  GenerationQualityTier,
  PromptTranslation,
} from "../../../src/shared/types";
import { fetchProvider } from "./request";

export type MagpieProviderOptions = {
  /** Magpie 网关 key。本机 loopback 可以直接用固定串，仍建议在设置页存一份。 */
  apiKey: () => string | undefined;
  /** 网关地址，默认本机 3425。 */
  baseUrl?: () => string | undefined;
  /** 生图模型（provider/model 形式，或 group/<id>）。 */
  imageModel?: () => string | undefined;
  /** 生视频模型。 */
  videoModel?: () => string | undefined;
  /** 文本模型，用于创作建议与提示词适配。 */
  textModel?: () => string | undefined;
};

type ProjectImageSize = "1024x1024" | "1024x1536" | "1536x1024";

type RemoteVideo = {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  progress?: number;
  error?: { message?: string };
  /** 部分免费档会直接回视频地址，而不是只给 id。 */
  url?: string;
};

const DEFAULT_BASE_URL = "http://127.0.0.1:3425/v1";
const DEFAULT_IMAGE_MODEL = "freeimg/flux";
const DEFAULT_VIDEO_MODEL = "zhipu/cogvideox-flash";
const DEFAULT_TEXT_MODEL = "group/free-token-pool";

/** 项目三档尺寸 → 免费模型实际支持的尺寸。竖 8:11、横 11:8，尽量贴近原比例。 */
const IMAGE_SIZE_MAP: Record<ProjectImageSize, string> = {
  "1024x1024": "1024x1024",
  "1024x1536": "864x1152",
  "1536x1024": "1152x864",
};

const VIDEO_SECONDS = 5;

export class MagpieProvider {
  readonly id = "magpie" as const;

  constructor(private readonly options: MagpieProviderOptions) {}

  isConfigured(): boolean {
    return Boolean(this.options.apiKey());
  }

  private baseUrl(): string {
    return (this.options.baseUrl?.() ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const apiKey = this.options.apiKey();
    if (!apiKey)
      throw new Error(
        "尚未配置 Magpie 网关地址。请先在本机启动 Magpie，并在模型连接页保存网关地址与 key。",
      );
    const response = await fetchProvider(
      "Magpie",
      `${this.baseUrl()}${path}`,
      { ...init, headers: { Authorization: `Bearer ${apiKey}`, ...(init.headers ?? {}) } },
      300_000,
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Magpie 请求失败（${response.status}）：${detail.slice(0, 500)}`);
    }
    return response;
  }

  /** 兼容 b64_json 与 url 两种返回，统一交回 Buffer。 */
  /**
   * 把网关的原始报错翻译成用户能照着做的下一步：
   * Magpie 会返回 `magpie knows no model "X" to draw with`，这是「没有会出图的平台」，
   * 而不是模型名写错，所以必须给出去领免费 key 的指引。
   */
  private explain(kind: "image" | "video", error: unknown): never {
    const message = error instanceof Error ? error.message : String(error);
    if (/to draw with|knows no model|no model/i.test(message)) {
      throw new Error(
        kind === "image"
          ? "免费池里还没有会出图的平台：确认 freeimg 出图端点在线（curl http://127.0.0.1:3436/healthz），或在 Magpie 里加智谱 CogView-3-Flash 后把模型换成 zhipu/cogview-3-flash。"
          : "免费池里还没有会出视频的平台：去智谱开放平台领一把免费 key（CogVideoX-Flash 免费），在 manage.sh 里填 KEY_ZHIPU 后重跑 sync 即可。",
      );
    }
    throw error instanceof Error ? error : new Error(message);
  }

  private async toImageBuffer(payload: {
    data?: Array<{ b64_json?: string; url?: string }>;
  }): Promise<Buffer> {
    const first = payload.data?.[0];
    if (first?.b64_json) return Buffer.from(first.b64_json, "base64");
    if (first?.url) {
      const response = await fetchProvider("Magpie", first.url, { method: "GET" }, 120_000);
      if (!response.ok)
        throw new Error(`图片地址下载失败（${response.status}），请重试或改用 b64 返回的模型。`);
      return Buffer.from(await response.arrayBuffer());
    }
    throw new Error("图像生成接口未返回图片数据。");
  }

  async generateImage(input: {
    prompt: string;
    size: ProjectImageSize;
    /** 与 runtime 的 imageProviders 注册表保持一致；免费档无法按质量分档，参数仅作占位。 */
    quality?: "medium" | "high";
  }): Promise<Buffer> {
    const model = this.options.imageModel?.() ?? DEFAULT_IMAGE_MODEL;
    const body = (size: string) =>
      JSON.stringify({ model, prompt: input.prompt, size, n: 1 });
    const call = async (size: string) =>
      this.toImageBuffer(
        (await (
          await this.request("/images/generations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: body(size),
          })
        ).json()) as { data?: Array<{ b64_json?: string; url?: string }> },
      );
    const mapped = IMAGE_SIZE_MAP[input.size] ?? "1024x1024";
    try {
      return await call(mapped);
    } catch (error) {
      // 没有会出图的平台时，重试正方形也没有意义，直接给出可执行的下一步。
      const message = error instanceof Error ? error.message : String(error);
      if (/to draw with|knows no model/i.test(message)) this.explain("image", error);
      // 免费档对尺寸卡得死，失败一次就退回正方形，不把 400 直接抛给用户。
      if (mapped === "1024x1024") throw error;
      return await call("1024x1024");
    }
  }

  async refineImage(input: {
    prompt: string;
    size: ProjectImageSize;
    referencePath: string;
    referenceMediaType: string;
  }): Promise<Buffer> {
    const form = new FormData();
    form.set("model", this.options.imageModel?.() ?? DEFAULT_IMAGE_MODEL);
    form.set("prompt", input.prompt);
    form.set("size", IMAGE_SIZE_MAP[input.size] ?? "1024x1024");
    form.set(
      "image",
      new Blob([readFileSync(input.referencePath)], { type: input.referenceMediaType }),
      basename(input.referencePath),
    );
    const payload = (await (
      await this.request("/images/edits", { method: "POST", body: form })
    ).json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    return this.toImageBuffer(payload);
  }

  async createVideo(input: {
    prompt: string;
    /** 调用方会传 "sora-2"/"sora-2-pro"；免费档用固定模型，这里接收但不使用，保证接口结构一致。 */
    model?: string;
    size: "1280x720" | "720x1280";
    seconds?: number;
    referencePath?: string;
    referenceMediaType?: string;
  }): Promise<RemoteVideo> {
    const form = new FormData();
    form.set("model", this.options.videoModel?.() ?? DEFAULT_VIDEO_MODEL);
    form.set("prompt", input.prompt);
    form.set("size", input.size);
    // 免费视频档普遍只给 5 秒，seconds 只作为「要不要时长」的信号，不放大预算。
    form.set("seconds", String(Math.max(VIDEO_SECONDS, Math.min(input.seconds ?? VIDEO_SECONDS, 10))));
    if (input.referencePath && input.referenceMediaType)
      form.set(
        "input_reference",
        new Blob([readFileSync(input.referencePath)], {
          type: input.referenceMediaType,
        }),
        basename(input.referencePath),
      );
    try {
      return (await this.request("/videos", { method: "POST", body: form }))
        .json() as Promise<RemoteVideo>;
    } catch (error) {
      this.explain("video", error);
    }
  }

  async getVideo(id: string): Promise<RemoteVideo> {
    return (await this.request(`/videos/${encodeURIComponent(id)}`, { method: "GET" }))
      .json() as Promise<RemoteVideo>;
  }

  async downloadVideo(id: string): Promise<Buffer> {
    const response = await this.request(`/videos/${encodeURIComponent(id)}/content`, {
      method: "GET",
    });
    return Buffer.from(await response.arrayBuffer());
  }

  /** 文本能力：给创作建议补字段。接口形状与 DeepSeekProvider 保持一致，可直接替换。 */
  async enrichCreativeCard(card: CreativeCard): Promise<CreativeCardSuggestion> {
    const content = await this.chatJson([
      {
        role: "system",
        content:
          "你是影视人物资产策划师。只返回 JSON，不新增真实人物身份、不猜测敏感属性。仅补足用户已给出创作方向中缺失的视觉字段，避免堆砌形容词。",
      },
      { role: "user", content: JSON.stringify(card) },
    ]);
    try {
      return JSON.parse(content) as CreativeCardSuggestion;
    } catch {
      throw new Error("免费模型返回内容不是可用的结构化建议。");
    }
  }

  /** 文本能力：提示词适配。 */
  async translatePrompt(input: {
    prompt: string;
    negative?: string;
    providerId: "openai" | "flux" | "fal" | "gemini" | "magpie";
    qualityTier: GenerationQualityTier;
  }): Promise<PromptTranslation> {
    const content = await this.chatJson([
      {
        role: "system",
        content:
          "你是图像生成提示词适配器。只返回 JSON，字段为 positive、negative、notes。保留原始创作意图与身份锚点，不新增真实人物身份或敏感属性；删除互相矛盾、模型无效的参数。positive 使用中文清晰描述；negative 只保留必要避免项；notes 是不超过三条的中文说明。",
      },
      { role: "user", content: JSON.stringify(input) },
    ]);
    let value: Pick<PromptTranslation, "positive" | "negative" | "notes">;
    try {
      value = JSON.parse(content) as Pick<
        PromptTranslation,
        "positive" | "negative" | "notes"
      >;
    } catch {
      throw new Error("免费模型返回内容不是可用的提示词适配结果。");
    }
    if (!value.positive?.trim()) throw new Error("免费模型未返回可用提示词。");
    return {
      providerId: input.providerId,
      qualityTier: input.qualityTier,
      positive: value.positive.trim(),
      negative: value.negative?.trim() ?? "",
      notes: Array.isArray(value.notes)
        ? value.notes.filter((item): item is string => typeof item === "string").slice(0, 3)
        : [],
    };
  }

  private async chatJson(messages: Array<{ role: string; content: string }>): Promise<string> {
    const payload = (await (
      await this.request("/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.options.textModel?.() ?? DEFAULT_TEXT_MODEL,
          response_format: { type: "json_object" },
          messages,
          max_tokens: 900,
        }),
      })
    ).json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content?.trim()) throw new Error("免费模型未返回内容（可能被限流，请稍后重试）。");
    return content;
  }
}
