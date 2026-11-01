import type { ImageGenerationSize } from "../../../src/shared/types";
import { fetchProvider } from "./request";

type CustomImageProviderOptions = {
  baseUrl: () => string | undefined;
  apiKey: () => string | undefined;
  model: () => string | undefined;
};

type ImageResponse = {
  data?: Array<{ b64_json?: string; url?: string }>;
};

const SUPPORTED_SIZES: ImageGenerationSize[] = ["1024x1024", "1024x1536", "1536x1024"];

/**
 * 任意 OpenAI 兼容的图像生成协议。
 * 千问、豆包等只要提供 /images/generations 兼容端点，就能在这里接入；
 * 地址、模型和密钥都由用户显式配置，不会偷偷替换协议。
 */
export class CustomImageProvider {
  readonly id = "custom" as const;

  constructor(private readonly options: CustomImageProviderOptions) {}

  baseUrl(): string | undefined {
    return this.options.baseUrl()?.trim().replace(/\/+$/, "") || undefined;
  }

  modelName(): string {
    return this.options.model()?.trim() || "qwen-image";
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl() && this.options.apiKey());
  }

  async generateImage(input: {
    prompt: string;
    negative?: string;
    size: ImageGenerationSize;
    seed?: number;
  }): Promise<Buffer> {
    const baseUrl = this.baseUrl();
    const apiKey = this.options.apiKey();
    if (!baseUrl) throw new Error("尚未配置自定义兼容协议的接口地址。");
    if (!apiKey) throw new Error("尚未配置自定义兼容协议的 API 密钥。");
    if (!SUPPORTED_SIZES.includes(input.size))
      throw new Error(`自定义兼容协议暂不支持 ${input.size} 画幅；请改用 1:1、2:3 或 3:2。`);

    const endpoint = /\/images\/generations$/.test(baseUrl)
      ? baseUrl
      : `${baseUrl}/images/generations`;
    const prompt = input.negative?.trim()
      ? `${input.prompt}\n\n避免：${input.negative.trim()}`
      : input.prompt;
    const response = await fetchProvider("自定义兼容协议", endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.modelName(),
        prompt,
        size: input.size,
        n: 1,
        response_format: "b64_json",
        ...(input.seed === undefined ? {} : { seed: input.seed }),
      }),
    });
    const payload = (await response.json()) as ImageResponse;
    const item = payload.data?.[0];
    if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
    if (item?.url) {
      const image = await fetchProvider("自定义兼容协议", item.url, { method: "GET" });
      return Buffer.from(await image.arrayBuffer());
    }
    throw new Error("自定义兼容协议没有返回图片数据。");
  }
}
