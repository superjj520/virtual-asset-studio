import { readFile } from "node:fs/promises";
import { fetchProvider } from "./request";
import { buildFalImageRequest, FAL_FLUX_SCHNELL_MODEL, type GenerationSize } from "../../../src/shared/generation-requests";
import { aspectRatioForImageSize } from "../../../src/shared/types";

type FalImage = { url?: string; content_type?: string; data?: string };
type FalResponse = { images?: FalImage[]; image?: FalImage };
type FalQueueResponse = { request_id?: string; status_url?: string; response_url?: string };
type FalQueueStatus = { status?: string; error?: string };

export type FalRemoteTask = { requestId: string; statusUrl: string; responseUrl: string; model: string };
export type FalImageResult = { image: Buffer; remoteTask: FalRemoteTask };

/** 远程任务已经提交但本次查询未完成；调用方必须保存 task，不能重新提交。 */
export class FalRemoteTaskError extends Error {
  constructor(message: string, readonly remoteTask: FalRemoteTask) { super(message); this.name = "FalRemoteTaskError"; }
}

const editModel = "fal-ai/flux-kontext/dev";
export const FAL_NANO_BANANA_2_EDIT_MODEL = "fal-ai/nano-banana-2/edit";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class FalProvider {
  readonly id = "fal" as const;
  constructor(private readonly options: { apiKey: () => string | undefined }) {}
  isConfigured(): boolean { return Boolean(this.options.apiKey()); }

  private async submit(model: string, input: Record<string, unknown>, onRemoteTask?: (task: FalRemoteTask) => void): Promise<FalImageResult> {
    const apiKey = this.options.apiKey();
    if (!apiKey) throw new Error("尚未配置 fal API 密钥。");
    const base = `https://queue.fal.run/${model}`;
    const createdResponse = await fetchProvider("fal", base, { method: "POST", headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(input) });
    if (!createdResponse.ok) throw new Error(`fal 请求失败（${createdResponse.status}）：${(await createdResponse.text()).slice(0, 500)}`);
    const created = (await createdResponse.json()) as FalQueueResponse;
    if (!created.request_id) throw new Error("fal 未返回可查询的生成任务。");
    const remoteTask: FalRemoteTask = { requestId: created.request_id, statusUrl: created.status_url ?? `${base}/requests/${created.request_id}/status`, responseUrl: created.response_url ?? `${base}/requests/${created.request_id}`, model };
    onRemoteTask?.(remoteTask);
    return { image: await this.pollTask(remoteTask), remoteTask };
  }

  private async pollTask(remoteTask: FalRemoteTask): Promise<Buffer> {
    const apiKey = this.options.apiKey();
    if (!apiKey) throw new FalRemoteTaskError("尚未配置 fal API 密钥，远程任务暂时无法查询。", remoteTask);
    for (let attempt = 0; attempt < 240; attempt += 1) {
      await sleep(500);
      let statusResponse: Response;
      try { statusResponse = await fetchProvider("fal", remoteTask.statusUrl, { headers: { Authorization: `Key ${apiKey}` } }, 15_000); }
      catch (error) { throw new FalRemoteTaskError(error instanceof Error ? error.message : "fal 任务查询失败。", remoteTask); }
      if (!statusResponse.ok) throw new FalRemoteTaskError(`fal 任务查询失败（${statusResponse.status}）。`, remoteTask);
      const status = (await statusResponse.json()) as FalQueueStatus;
      if (status.status === "FAILED" || status.status === "ERROR") throw new Error(status.error || "fal 图片生成失败。");
      if (status.status !== "COMPLETED") continue;
      let resultResponse: Response;
      try { resultResponse = await fetchProvider("fal", remoteTask.responseUrl, { headers: { Authorization: `Key ${apiKey}` } }); }
      catch (error) { throw new FalRemoteTaskError(error instanceof Error ? error.message : "fal 结果读取失败。", remoteTask); }
      if (!resultResponse.ok) throw new FalRemoteTaskError(`fal 结果读取失败（${resultResponse.status}）。`, remoteTask);
      const result = (await resultResponse.json()) as FalResponse;
      const image = result.images?.[0] ?? result.image;
      if (!image) throw new Error("fal 未返回图片数据。");
      if (image.data?.startsWith("data:")) return decodeDataUri(image.data);
      if (!image.url) throw new Error("fal 返回的图片缺少下载地址。");
      let file: Response;
      try { file = await fetchProvider("fal", image.url, {}, 60_000); }
      catch (error) { throw new FalRemoteTaskError(error instanceof Error ? error.message : "fal 成图下载失败。", remoteTask); }
      if (!file.ok) throw new FalRemoteTaskError(`fal 成图下载失败（${file.status}）。`, remoteTask);
      return Buffer.from(await file.arrayBuffer());
    }
    throw new FalRemoteTaskError("fal 生成超时，请稍后继续查询原任务。", remoteTask);
  }

  async pollImage(remoteTask: FalRemoteTask): Promise<Buffer> { return this.pollTask(remoteTask); }

  async generateImageWithTask(input: { prompt: string; negative?: string; size: GenerationSize; model?: string; seed?: number; quality?: "medium" | "high"; onRemoteTask?: (task: FalRemoteTask) => void }): Promise<FalImageResult> {
    const model = input.model ?? FAL_FLUX_SCHNELL_MODEL;
    return this.submit(model, buildFalImageRequest({ prompt: input.prompt, negative: input.negative, size: input.size, model, seed: input.seed }), input.onRemoteTask);
  }
  async generateImage(input: { prompt: string; negative?: string; size: GenerationSize; model?: string; seed?: number; quality?: "medium" | "high" }): Promise<Buffer> { return (await this.generateImageWithTask(input)).image; }

  async refineImageWithTask(input: {
    prompt: string;
    size: GenerationSize;
    referencePath: string;
    referenceMediaType: string;
    references?: Array<{ path: string; mediaType: string }>;
    model?: string;
    onRemoteTask?: (task: FalRemoteTask) => void;
  }): Promise<FalImageResult> {
    const references = input.references?.length
      ? input.references
      : [{ path: input.referencePath, mediaType: input.referenceMediaType }];
    if (input.model === FAL_NANO_BANANA_2_EDIT_MODEL && references.length > 1) {
      const imageUrls = await Promise.all(references.map(async (reference) => {
        const bytes = await readFile(reference.path);
        return `data:${reference.mediaType};base64,${bytes.toString("base64")}`;
      }));
      return this.submit(FAL_NANO_BANANA_2_EDIT_MODEL, {
        prompt: input.prompt,
        image_urls: imageUrls,
        num_images: 1,
        output_format: "png",
        aspect_ratio: aspectRatioForImageSize(input.size),
        resolution: "1K",
      }, input.onRemoteTask);
    }
    const reference = await readFile(references[0].path);
    return this.submit(input.model ?? editModel, { prompt: input.prompt, image_url: `data:${references[0].mediaType};base64,${reference.toString("base64")}`, resolution_mode: "match_input", num_images: 1, output_format: "png", enable_safety_checker: true }, input.onRemoteTask);
  }
  async refineImage(input: { prompt: string; size: GenerationSize; referencePath: string; referenceMediaType: string; references?: Array<{ path: string; mediaType: string }>; model?: string }): Promise<Buffer> { return (await this.refineImageWithTask(input)).image; }
}

const decodeDataUri = (value: string): Buffer => {
  const comma = value.indexOf(",");
  if (comma < 0) throw new Error("fal 返回了无效的图片数据。");
  return Buffer.from(value.slice(comma + 1), "base64");
};
