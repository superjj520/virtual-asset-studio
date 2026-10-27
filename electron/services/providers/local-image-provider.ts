import type { GenerationSize } from "../../../src/shared/generation-requests";

type LocalResponse = { data?: Array<{ b64_json?: string; url?: string }> };

/**
 * 本地图像服务适配器。约定服务实现 OpenAI 兼容的 POST /v1/images/generations，
 * 返回 b64_json 或 url；MOSS、ComfyUI 网关、LocalAI 等都可在此契约后接入。
 */
export class LocalImageProvider {
  readonly id = "local" as const;
  constructor(private readonly options: { baseUrl: () => string | undefined; model?: () => string | undefined }) {}
  isConfigured(): boolean { return Boolean(this.options.baseUrl()?.trim()); }

  async generateImage(input: { prompt: string; negative?: string; size: GenerationSize; seed?: number; quality?: "medium" | "high" }): Promise<Buffer> {
    const baseUrl = this.options.baseUrl()?.trim().replace(/\/$/, "");
    if (!baseUrl) throw new Error("尚未配置本地图像服务地址。");
    const response = await fetch(`${baseUrl}/v1/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.options.model?.()?.trim() || "moss-image",
        prompt: input.negative ? `${input.prompt}\n\n避免：${input.negative}` : input.prompt,
        size: input.size,
        n: 1,
        response_format: "b64_json",
        ...(input.seed === undefined ? {} : { seed: input.seed }),
      }),
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    if (!response.ok) throw new Error(`本地图像服务失败（${response.status}）：${(await response.text()).slice(0, 300)}`);
    const result = (await response.json()) as LocalResponse;
    const image = result.data?.[0];
    if (image?.b64_json) return Buffer.from(image.b64_json, "base64");
    if (image?.url) {
      const file = await fetch(image.url, { signal: AbortSignal.timeout(120_000) });
      if (!file.ok) throw new Error(`本地图像下载失败（${file.status}）。`);
      return Buffer.from(await file.arrayBuffer());
    }
    throw new Error("本地图像服务没有返回图片数据。");
  }
}
