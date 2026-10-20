import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { ImageUnderstandingReport } from "../../../src/shared/types";
import { parseImageUnderstanding } from "../understanding/image-understanding";
import { fetchProvider } from "./request";

export type OpenAIProviderOptions = { apiKey: () => string | undefined };

type RemoteVideo = {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  progress?: number;
  error?: { message?: string };
};

const toDataUrl = (filePath: string, mediaType: string) =>
  `data:${mediaType};base64,${readFileSync(filePath).toString("base64")}`;

export class OpenAIProvider {
  readonly id = "openai";
  constructor(private readonly options: OpenAIProviderOptions) {}

  isConfigured(): boolean {
    return Boolean(this.options.apiKey());
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const apiKey = this.options.apiKey();
    if (!apiKey)
      throw new Error("尚未配置 OpenAI API 密钥。请在设置中完成本机连接。");
    const response = await fetchProvider("OpenAI", `https://api.openai.com/v1${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}`, ...(init.headers ?? {}) },
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `OpenAI 请求失败（${response.status}）：${detail.slice(0, 500)}`,
      );
    }
    return response;
  }

  async analyzeImage(input: {
    filePath: string;
    mediaType: string;
  }): Promise<ImageUnderstandingReport> {
    const response = await this.request("/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "这是一次视觉反推，用于把用户授权的参考图转化为原创创作的结构化设计说明。不要猜测真实身份、品牌、地点或敏感属性；不要承诺复刻原图或人物。只输出一个 JSON 对象，禁止 Markdown。字段必须是：subject、identityAnchor、bodyAndWardrobe、expressionAndPose、scene、lighting、camera、style、continuityLocks（字符串数组）、risks（字符串数组）、editablePrompt。用中文；只描述画面中可见且可复用的事实。editablePrompt 需按人物、外观、服装、姿势、场景、光线、镜头、媒介、保持、避免的顺序写成可编辑提示词。continuityLocks 专注于后续创作中要保留的外观、服装、环境与镜头基线；risks 写不可直接复刻、可识别标志或未确认要素。",
              },
              {
                type: "input_image",
                image_url: toDataUrl(input.filePath, input.mediaType),
                detail: "high",
              },
            ],
          },
        ],
      }),
    });
    const payload = (await response.json()) as { output_text?: string };
    return parseImageUnderstanding(
      payload.output_text || "模型未返回可读取的视觉理解结果。",
    );
  }

  async generateImage(input: {
    prompt: string;
    size: "1024x1024" | "1024x1536" | "1536x1024";
    quality?: "medium" | "high";
  }): Promise<Buffer> {
    const response = await this.request("/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-2",
        prompt: input.prompt,
        size: input.size,
        quality: input.quality ?? "high",
      }),
    });
    const payload = (await response.json()) as {
      data?: Array<{ b64_json?: string }>;
    };
    const encoded = payload.data?.[0]?.b64_json;
    if (!encoded) throw new Error("图像生成接口未返回图片数据。");
    return Buffer.from(encoded, "base64");
  }

  async refineImage(input: {
    prompt: string;
    size: "1024x1024" | "1024x1536" | "1536x1024";
    referencePath: string;
    referenceMediaType: string;
  }): Promise<Buffer> {
    const form = new FormData();
    form.set("model", "gpt-image-2");
    form.set("prompt", input.prompt);
    form.set("size", input.size);
    form.set("quality", "high");
    form.set(
      "image",
      new Blob([readFileSync(input.referencePath)], {
        type: input.referenceMediaType,
      }),
      basename(input.referencePath),
    );
    const response = await this.request("/images/edits", {
      method: "POST",
      body: form,
    });
    const payload = (await response.json()) as {
      data?: Array<{ b64_json?: string }>;
    };
    const encoded = payload.data?.[0]?.b64_json;
    if (!encoded) throw new Error("图片修订接口未返回图片数据。");
    return Buffer.from(encoded, "base64");
  }

  async createVideo(input: {
    prompt: string;
    model: "sora-2" | "sora-2-pro";
    size: "1280x720" | "720x1280";
    seconds: 4 | 8 | 12;
    referencePath?: string;
    referenceMediaType?: string;
  }): Promise<RemoteVideo> {
    const form = new FormData();
    form.set("model", input.model);
    form.set("prompt", input.prompt);
    form.set("size", input.size);
    form.set("seconds", String(input.seconds));
    if (input.referencePath && input.referenceMediaType)
      form.set(
        "input_reference",
        new Blob([readFileSync(input.referencePath)], {
          type: input.referenceMediaType,
        }),
        basename(input.referencePath),
      );
    const response = await this.request("/videos", {
      method: "POST",
      body: form,
    });
    return response.json() as Promise<RemoteVideo>;
  }

  async getVideo(id: string): Promise<RemoteVideo> {
    const response = await this.request(`/videos/${encodeURIComponent(id)}`, {
      method: "GET",
    });
    return response.json() as Promise<RemoteVideo>;
  }

  async downloadVideo(id: string): Promise<Buffer> {
    const response = await this.request(
      `/videos/${encodeURIComponent(id)}/content`,
      { method: "GET" },
    );
    return Buffer.from(await response.arrayBuffer());
  }
}
