import { readFile } from "node:fs/promises";
import { fetchProvider } from "./request";

type FalImage = { url?: string; content_type?: string; data?: string };
type FalResponse = { images?: FalImage[]; image?: FalImage };
type FalQueueResponse = {
  request_id?: string;
  status_url?: string;
  response_url?: string;
};
type FalQueueStatus = { status?: string; error?: string };

const generationModel = "fal-ai/flux/schnell";
const editModel = "fal-ai/flux-kontext/dev";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const dimensions = (size: "1024x1024" | "1024x1536" | "1536x1024") => {
  if (size === "1024x1536") return { width: 1024, height: 1536 };
  if (size === "1536x1024") return { width: 1536, height: 1024 };
  return { width: 1024, height: 1024 };
};

export class FalProvider {
  readonly id = "fal" as const;

  constructor(private readonly options: { apiKey: () => string | undefined }) {}

  isConfigured(): boolean {
    return Boolean(this.options.apiKey());
  }

  private async submit(model: string, input: Record<string, unknown>): Promise<Buffer> {
    const apiKey = this.options.apiKey();
    if (!apiKey) throw new Error("尚未配置 fal API 密钥。");
    const base = `https://queue.fal.run/${model}`;
    const createdResponse = await fetchProvider("fal", base, {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    if (!createdResponse.ok)
      throw new Error(`fal 请求失败（${createdResponse.status}）：${(await createdResponse.text()).slice(0, 500)}`);
    const created = (await createdResponse.json()) as FalQueueResponse;
    if (!created.request_id)
      throw new Error("fal 未返回可查询的生成任务。");
    const statusUrl = created.status_url ?? `${base}/requests/${created.request_id}/status`;
    const responseUrl = created.response_url ?? `${base}/requests/${created.request_id}`;
    for (let attempt = 0; attempt < 240; attempt += 1) {
      await sleep(500);
      const statusResponse = await fetchProvider("fal", statusUrl, {
        headers: { Authorization: `Key ${apiKey}` },
      }, 15_000);
      if (!statusResponse.ok)
        throw new Error(`fal 任务查询失败（${statusResponse.status}）。`);
      const status = (await statusResponse.json()) as FalQueueStatus;
      if (status.status === "FAILED" || status.status === "ERROR")
        throw new Error(status.error || "fal 图片生成失败。");
      if (status.status !== "COMPLETED") continue;
      const resultResponse = await fetchProvider("fal", responseUrl, {
        headers: { Authorization: `Key ${apiKey}` },
      });
      if (!resultResponse.ok)
        throw new Error(`fal 结果读取失败（${resultResponse.status}）。`);
      const result = (await resultResponse.json()) as FalResponse;
      const image = result.images?.[0] ?? result.image;
      if (!image) throw new Error("fal 未返回图片数据。");
      if (image.data?.startsWith("data:")) return decodeDataUri(image.data);
      if (!image.url) throw new Error("fal 返回的图片缺少下载地址。");
      const file = await fetchProvider("fal", image.url, {}, 60_000);
      if (!file.ok) throw new Error(`fal 成图下载失败（${file.status}）。`);
      return Buffer.from(await file.arrayBuffer());
    }
    throw new Error("fal 生成超时，请稍后在任务队列重试。");
  }

  async generateImage(input: {
    prompt: string;
    size: "1024x1024" | "1024x1536" | "1536x1024";
    quality?: "medium" | "high";
  }): Promise<Buffer> {
    return this.submit(generationModel, {
      prompt: input.prompt,
      image_size: dimensions(input.size),
      num_inference_steps: 4,
      num_images: 1,
      output_format: "png",
      enable_safety_checker: true,
    });
  }

  async refineImage(input: {
    prompt: string;
    size: "1024x1024" | "1024x1536" | "1536x1024";
    referencePath: string;
    referenceMediaType: string;
  }): Promise<Buffer> {
    const reference = await readFile(input.referencePath);
    const imageUrl = `data:${input.referenceMediaType};base64,${reference.toString("base64")}`;
    return this.submit(editModel, {
      prompt: input.prompt,
      image_url: imageUrl,
      resolution_mode: "match_input",
      num_images: 1,
      output_format: "png",
      enable_safety_checker: true,
    });
  }
}

const decodeDataUri = (value: string): Buffer => {
  const comma = value.indexOf(",");
  if (comma < 0) throw new Error("fal 返回了无效的图片数据。");
  return Buffer.from(value.slice(comma + 1), "base64");
};
