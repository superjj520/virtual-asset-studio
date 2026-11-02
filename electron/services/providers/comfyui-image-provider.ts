import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { GenerationSize } from "../../../src/shared/generation-requests";
import { dimensionsForImageSize } from "../../../src/shared/types";

export const COMFYUI_DEFAULT_BASE_URL = "http://127.0.0.1:8188";

type WorkflowNode = { class_type: string; inputs: Record<string, unknown> };
export type ComfyWorkflow = Record<string, WorkflowNode>;

/** 参考图占位符：第一张是 {{reference_image}}，之后 {{reference_image_1}}…{{reference_image_n}}。 */
const USES_REFERENCE_PLACEHOLDER = /\{\{reference_image(_\d+)?\}\}/;

const referenceVariables = (names?: string[]): Record<string, string> => {
  if (!names?.length) return {};
  const variables: Record<string, string> = { reference_image: names[0] };
  names.forEach((name, index) => {
    variables[`reference_image_${index + 1}`] = name;
  });
  return variables;
};

/**
 * 内置工作流：Checkpoint → 双 CLIPTextEncode → KSampler → VAEDecode → SaveImage。
 * 全部参数通过占位符注入，用户不需要懂 ComfyUI 的节点编号。
 */
export const COMFYUI_BUILTIN_WORKFLOW: ComfyWorkflow = {
  "3": {
    class_type: "KSampler",
    inputs: {
      seed: "{{seed}}",
      steps: "{{steps}}",
      cfg: 7,
      sampler_name: "euler",
      scheduler: "normal",
      denoise: 1,
      model: ["4", 0],
      positive: ["6", 0],
      negative: ["7", 0],
      latent_image: ["5", 0],
    },
  },
  "4": {
    class_type: "CheckpointLoaderSimple",
    inputs: { ckpt_name: "{{checkpoint}}" },
  },
  "5": {
    class_type: "EmptyLatentImage",
    inputs: { width: "{{width}}", height: "{{height}}", batch_size: 1 },
  },
  "6": {
    class_type: "CLIPTextEncode",
    inputs: { text: "{{prompt}}", clip: ["4", 1] },
  },
  "7": {
    class_type: "CLIPTextEncode",
    inputs: { text: "{{negative}}", clip: ["4", 1] },
  },
  "8": {
    class_type: "VAEDecode",
    inputs: { samples: ["3", 0], vae: ["4", 2] },
  },
  "9": {
    class_type: "SaveImage",
    inputs: { filename_prefix: "vas", images: ["8", 0] },
  },
};

const PLACEHOLDER = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
const WHOLE_PLACEHOLDER = /^\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}$/;

/**
 * 递归替换工作流里的 `{{名字}}`。整串就是一个占位符时保留原始类型
 * （宽度、种子必须仍是数字，否则 ComfyUI 会拒绝节点输入）。
 */
export const applyWorkflowPlaceholders = (
  value: unknown,
  variables: Record<string, string | number>,
): unknown => {
  if (typeof value === "string") {
    const whole = WHOLE_PLACEHOLDER.exec(value.trim());
    if (whole && whole[1] in variables) return variables[whole[1]];
    return value.replace(PLACEHOLDER, (match, name: string) =>
      name in variables ? String(variables[name]) : match,
    );
  }
  if (Array.isArray(value)) return value.map((item) => applyWorkflowPlaceholders(item, variables));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = applyWorkflowPlaceholders(item, variables);
    }
    return result;
  }
  return value;
};

type ComfyImage = { filename: string; subfolder?: string; type?: string };

const firstImage = (entry: unknown): ComfyImage | undefined => {
  if (!entry || typeof entry !== "object") return undefined;
  const outputs = (entry as { outputs?: unknown }).outputs;
  if (!outputs || typeof outputs !== "object") return undefined;
  for (const node of Object.values(outputs as Record<string, unknown>)) {
    const images = (node as { images?: unknown })?.images;
    if (Array.isArray(images) && images.length > 0) {
      const image = images[0] as ComfyImage;
      if (image?.filename) return image;
    }
  }
  return undefined;
};

const executionError = (entry: unknown): string | undefined => {
  const status = (entry as { status?: { status_str?: string; messages?: unknown } })?.status;
  if (!status || status.status_str === "success") return undefined;
  if (status.status_str !== "error") return undefined;
  const messages = Array.isArray(status.messages) ? status.messages : [];
  const detail = messages
    .map((message) => {
      if (!Array.isArray(message)) return "";
      const payload = message[1] as { exception_message?: string } | undefined;
      return payload?.exception_message ?? "";
    })
    .filter(Boolean)
    .join("；");
  return detail || "节点执行失败";
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * ComfyUI 适配器。走官方 HTTP 接口：`POST /prompt` 入队、`GET /history/{id}` 轮询、
 * `GET /view` 取图。地址为空即视为未配置，不产生任何网络请求。
 */
export class ComfyUiImageProvider {
  readonly id = "comfyui" as const;
  private readonly clientId = randomUUID();

  constructor(
    private readonly options: {
      baseUrl: () => string | undefined;
      checkpoint: () => string | undefined;
      workflow: () => string | undefined;
      /** 轮询间隔与总超时，测试时可缩短。 */
      pollIntervalMs?: number;
      timeoutMs?: number;
    },
  ) {}

  baseUrl(): string | undefined {
    return this.options.baseUrl()?.trim().replace(/\/+$/, "") || undefined;
  }

  checkpoint(): string | undefined {
    return this.options.checkpoint()?.trim() || undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl());
  }

  /** 用户自定义工作流优先；JSON 无效时直接报错，不静默回退。 */
  buildWorkflow(input: {
    prompt: string;
    negative?: string;
    size: GenerationSize;
    seed?: number;
    quality?: "medium" | "high";
    referenceNames?: string[];
  }): ComfyWorkflow {
    const { width, height } = dimensionsForImageSize(input.size);
    const variables = {
      prompt: input.prompt,
      negative: input.negative?.trim() || "低质量，错误解剖，模糊，水印",
      seed: input.seed ?? Math.floor(Math.random() * 1_000_000_000),
      width,
      height,
      steps: input.quality === "high" ? 28 : 20,
      checkpoint: this.checkpoint() ?? "",
      ...referenceVariables(input.referenceNames),
    };
    const custom = this.options.workflow?.()?.trim();
    let base: unknown = COMFYUI_BUILTIN_WORKFLOW;
    if (custom) {
      try {
        base = JSON.parse(custom);
      } catch {
        throw new Error("自定义 ComfyUI 工作流不是有效 JSON。");
      }
      if (!base || typeof base !== "object" || Array.isArray(base))
        throw new Error("自定义 ComfyUI 工作流需要是 API 格式的对象。");
    } else if (!variables.checkpoint) {
      throw new Error("请先填写 ComfyUI 的 checkpoint 文件名，或提供自定义工作流。");
    }
    // 有参考图但工作流里没有占位符时，图会被静默忽略——宁可报错也不能让用户以为身份锁定了。
    if (input.referenceNames?.length && !USES_REFERENCE_PLACEHOLDER.test(JSON.stringify(base)))
      throw new Error(
        "当前 ComfyUI 工作流没有 {{reference_image}} 占位符，参考图会被忽略。请加一个 LoadImage 节点，把它的 image 写成 {{reference_image}}。",
      );
    return applyWorkflowPlaceholders(base, variables) as ComfyWorkflow;
  }

  async generateImage(input: {
    prompt: string;
    negative?: string;
    size: GenerationSize;
    seed?: number;
    quality?: "medium" | "high";
    referenceNames?: string[];
  }): Promise<Buffer> {
    const baseUrl = this.baseUrl();
    if (!baseUrl) throw new Error("尚未配置 ComfyUI 地址。");
    const workflow = this.buildWorkflow(input);

    const queued = await fetch(`${baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: this.clientId }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!queued.ok) {
      const detail = (await queued.text().catch(() => "")).slice(0, 300);
      throw new Error(`ComfyUI 拒绝了工作流（${queued.status}）${detail ? `：${detail}` : ""}`);
    }
    const payload = (await queued.json()) as { prompt_id?: string; node_errors?: unknown };
    const promptId = payload.prompt_id;
    if (!promptId) {
      const detail = payload.node_errors ? JSON.stringify(payload.node_errors).slice(0, 300) : "";
      throw new Error(`ComfyUI 没有返回任务号${detail ? `：${detail}` : ""}`);
    }

    const interval = this.options.pollIntervalMs ?? 1000;
    const deadline = Date.now() + (this.options.timeoutMs ?? 10 * 60 * 1000);
    while (Date.now() < deadline) {
      await sleep(interval);
      const response = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) continue;
      const history = (await response.json()) as Record<string, unknown>;
      const entry = history?.[promptId];
      if (!entry) continue;
      const failure = executionError(entry);
      if (failure) throw new Error(`ComfyUI 执行失败：${failure}`);
      const image = firstImage(entry);
      if (!image) continue;
      const query = new URLSearchParams({
        filename: image.filename,
        subfolder: image.subfolder ?? "",
        type: image.type ?? "output",
      });
      const file = await fetch(`${baseUrl}/view?${query.toString()}`, {
        signal: AbortSignal.timeout(120_000),
      });
      if (!file.ok) throw new Error(`ComfyUI 图片下载失败（${file.status}）。`);
      return Buffer.from(await file.arrayBuffer());
    }
    throw new Error("ComfyUI 生成超时；请检查队列是否卡住。");
  }

  /** 把参考图传到 ComfyUI，返回文件名；占位符里填这个名字，工作流才读得到。 */
  async uploadImage(file: { path: string; mediaType: string }): Promise<string> {
    const baseUrl = this.baseUrl();
    if (!baseUrl) throw new Error("尚未配置 ComfyUI 地址。");
    const filename = basename(file.path) || "reference.png";
    const form = new FormData();
    form.append("image", new Blob([readFileSync(file.path)], { type: file.mediaType }), filename);
    form.append("overwrite", "true");
    const response = await fetch(`${baseUrl}/upload/image`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new Error(`ComfyUI 参考图上传失败（${response.status}）${detail ? `：${detail}` : ""}`);
    }
    const payload = (await response.json()) as { name?: string; subfolder?: string };
    if (!payload.name) throw new Error("ComfyUI 参考图上传没有返回文件名。");
    return payload.subfolder ? `${payload.subfolder}/${payload.name}` : payload.name;
  }

  /** 带参考图出图：先逐张上传，再把文件名注进 {{reference_image}} 系列占位符。 */
  async refineImage(input: {
    prompt: string;
    negative?: string;
    size: GenerationSize;
    seed?: number;
    quality?: "medium" | "high";
    referencePath: string;
    referenceMediaType: string;
    references?: Array<{ path: string; mediaType: string }>;
  }): Promise<Buffer> {
    const files = input.references?.length
      ? input.references
      : [{ path: input.referencePath, mediaType: input.referenceMediaType }];
    const referenceNames: string[] = [];
    for (const file of files) referenceNames.push(await this.uploadImage(file));
    return this.generateImage({ ...input, referenceNames });
  }
}
