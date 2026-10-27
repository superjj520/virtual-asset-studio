import type { GenerationSize } from "../../../src/shared/generation-requests";

type LocalResponse = { data?: Array<{ b64_json?: string; url?: string }> };

/** 设置页没有填写模型名时，本地服务默认使用的模型标识。 */
export const LOCAL_IMAGE_DEFAULT_MODEL = "moss-image";

/**
 * 本地图像服务适配器。约定服务实现 OpenAI 兼容的 POST /v1/images/generations，
 * 返回 b64_json 或 url；MOSS、ComfyUI 网关、LocalAI 等都可在此契约后接入。
 * 地址与模型名来自设置页，地址为空即视为未配置，不会产生任何网络请求。
 */
export class LocalImageProvider {
  readonly id = "local" as const;
  constructor(private readonly options: { baseUrl: () => string | undefined; model?: () => string | undefined }) {}

  /** 去掉末尾斜杠后的服务地址；未配置时返回 undefined。 */
  baseUrl(): string | undefined {
    return this.options.baseUrl()?.trim().replace(/\/+$/, "") || undefined;
  }

  modelName(): string {
    return this.options.model?.()?.trim() || LOCAL_IMAGE_DEFAULT_MODEL;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl());
  }

  async generateImage(input: {
    prompt: string;
    negative?: string;
    size: GenerationSize;
    seed?: number;
    quality?: "medium" | "high";
  }): Promise<Buffer> {
    const baseUrl = this.baseUrl();
    if (!baseUrl) throw new Error("尚未配置本地图像服务地址。");
    const response = await fetch(`${baseUrl}/v1/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.modelName(),
        prompt: input.negative ? `${input.prompt}\n\n避免：${input.negative}` : input.prompt,
        // 画幅直接沿用创作页当前选择的 WxH，避免本地服务猜错比例。
        size: input.size,
        n: 1,
        response_format: "b64_json",
        ...(input.quality === undefined ? {} : { quality: input.quality }),
        ...(input.seed === undefined ? {} : { seed: input.seed }),
      }),
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    if (!response.ok) throw new Error(`本地图像服务失败（${response.status}）：${(await response.text()).slice(0, 300)}`);
    const result = (await response.json()) as LocalResponse;
    const image = result.data?.[0];
    if (image?.b64_json) return Buffer.from(image.b64_json, "base64");
    if (image?.url) {
      // 有些本地网关返回相对路径，按服务地址补全后再下载。
      const fileUrl = new URL(image.url, `${baseUrl}/`).toString();
      const file = await fetch(fileUrl, { signal: AbortSignal.timeout(120_000) });
      if (!file.ok) throw new Error(`本地图像下载失败（${file.status}）。`);
      return Buffer.from(await file.arrayBuffer());
    }
    throw new Error("本地图像服务没有返回图片数据。");
  }
}
