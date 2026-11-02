import type { CreativeAspectRatio, ImageGenerationSize, ProviderId, ProviderStatus } from "./types";

/**
 * 生成任务只描述“要什么结果”，不绑定具体供应商。
 * 这样编排层可以按画幅、参考图、文字版式和成本选择模型。
 */
export type GenerationTaskKind =
  | "portrait"
  | "scene"
  | "series"
  | "text_layout"
  | "edit";

export type GenerationModel = {
  id: string;
  providerId: Extract<ProviderId, "openai" | "flux" | "fal" | "gemini" | "local" | "custom" | "comfyui" | "magpie">;
  model: string;
  label: string;
  description: string;
  tasks: GenerationTaskKind[];
  supportsReference: boolean;
  maxReferences: number;
  /** 单张 1024×1536 的估算价；未知时不填，界面显示“按量计费”。 */
  estimatedCostUsd?: number;
  /** MOSS 这类按百万像素计价的模型。 */
  costPerMegapixelUsd?: number;
  costNote?: string;
  /** 画质档位是否真正改变请求；fixed 表示按画幅固定输出。 */
  qualityMode: "fixed" | "tiered";
  /** 当前适配器能真实产出的画幅；不能支持的画幅必须在前端与后端同时拒绝。 */
  supportedAspectRatios: CreativeAspectRatio[];
};

export type GenerationModelOption = GenerationModel & {
  available: boolean;
  unavailableReason?: string;
};

const ALL_RATIOS: CreativeAspectRatio[] = ["1:1", "2:3", "3:2", "4:3", "9:16", "16:9"];
const OPENAI_RATIOS: CreativeAspectRatio[] = ["1:1", "2:3", "3:2"];

const MODEL_LIST: GenerationModel[] = [
  {
    id: "fal-flux-schnell",
    providerId: "fal",
    model: "fal-ai/flux/schnell",
    label: "FLUX Schnell",
    description: "快速写实与概念图，适合草稿和批量探索。",
    tasks: ["portrait", "scene", "series"],
    supportsReference: false,
    maxReferences: 0,
    estimatedCostUsd: 0.003,
    costNote: "约 $0.003/张，按 fal 实际计费",
    qualityMode: "fixed",
    supportedAspectRatios: ALL_RATIOS,
  },
  {
    id: "custom-openai-image",
    providerId: "custom",
    model: "custom",
    label: "自定义兼容图像",
    description: "接入千问、豆包等 OpenAI 兼容图像协议，地址与模型由你决定。",
    tasks: ["portrait", "scene", "series"],
    supportsReference: false,
    maxReferences: 0,
    estimatedCostUsd: 0.03,
    costNote: "按所选协议实际计费",
    qualityMode: "fixed",
    supportedAspectRatios: OPENAI_RATIOS,
  },
  {
    id: "fal-flux-kontext",
    providerId: "fal",
    model: "fal-ai/flux-kontext/dev",
    label: "FLUX Kontext",
    description: "带参考图的身份与造型连续性，适合精修和系列。",
    tasks: ["portrait", "scene", "series", "edit"],
    supportsReference: true,
    maxReferences: 1,
    estimatedCostUsd: 0.006,
    costNote: "按 fal 实际计费",
    qualityMode: "fixed",
    supportedAspectRatios: ALL_RATIOS,
  },
  {
    id: "fal-moss-image",
    providerId: "fal",
    model: "fal-ai/moss-image",
    label: "MOSS-Image",
    description: "中文/英文字形与版式表现强，适合海报、封面和文字画面。",
    tasks: ["portrait", "text_layout", "scene"],
    supportsReference: false,
    maxReferences: 0,
    costPerMegapixelUsd: 0.05,
    costNote: "$0.05/百万像素，按当前画幅结算",
    qualityMode: "fixed",
    supportedAspectRatios: ALL_RATIOS,
  },
  {
    id: "gemini-image",
    providerId: "gemini",
    model: "gemini-3.1-flash-image",
    label: "Gemini 图像",
    description: "通用写实与多参考图编辑，受 Gemini 配额影响。",
    tasks: ["portrait", "scene", "series", "text_layout", "edit"],
    supportsReference: true,
    maxReferences: 4,
    costNote: "按 Gemini 配额与计价",
    qualityMode: "tiered",
    supportedAspectRatios: ALL_RATIOS,
  },
  {
    id: "fal-nano-banana-2-edit",
    providerId: "fal",
    model: "fal-ai/nano-banana-2/edit",
    label: "Nano Banana 2 多图",
    description: "按顺序读取最多 4 张参考图，适合身份、服装、姿态和场景组合。",
    tasks: ["portrait", "scene", "series", "edit"],
    supportsReference: true,
    maxReferences: 4,
    costNote: "按 fal 实际计费",
    qualityMode: "fixed",
    supportedAspectRatios: ALL_RATIOS,
  },
  {
    id: "flux-direct",
    providerId: "flux",
    model: "flux-1.1-pro",
    label: "FLUX 1.1 Pro",
    description: "高保真写实人像与商业画面。",
    tasks: ["portrait", "scene"],
    supportsReference: false,
    maxReferences: 0,
    estimatedCostUsd: 0.04,
    costNote: "约 $0.04/张，按服务商实际计费",
    qualityMode: "fixed",
    supportedAspectRatios: ALL_RATIOS,
  },
  {
    id: "openai-image",
    providerId: "openai",
    model: "gpt-image-2",
    label: "GPT Image",
    description: "通用图像生成与编辑，适合混合任务。",
    tasks: ["portrait", "scene", "text_layout", "edit"],
    supportsReference: true,
    maxReferences: 1,
    costNote: "按 OpenAI 实际计费",
    qualityMode: "tiered",
    supportedAspectRatios: OPENAI_RATIOS,
  },
  {
    id: "local-moss-image",
    providerId: "local",
    model: "moss-image",
    label: "本地 MOSS-Image",
    description: "调用本机 OpenAI 兼容图像服务，不需要云端密钥；实际模型名可在模型连接页覆盖。",
    tasks: ["portrait", "scene", "series", "text_layout"],
    supportsReference: false,
    maxReferences: 0,
    estimatedCostUsd: 0,
    costNote: "本机服务，不计费",
    qualityMode: "tiered",
    supportedAspectRatios: ALL_RATIOS,
  },
  {
    id: "comfyui-local",
    providerId: "comfyui",
    model: "comfyui",
    label: "本机 ComfyUI",
    description: "直接驱动 ComfyUI 工作流，可接 LoRA、ControlNet 和自定义节点；不需要云端密钥。",
    tasks: ["portrait", "scene", "series", "edit"],
    supportsReference: false,
    maxReferences: 0,
    estimatedCostUsd: 0,
    costNote: "本机显卡，不计费",
    qualityMode: "tiered",
    supportedAspectRatios: ALL_RATIOS,
  },
  {
    id: "magpie-sana",
    providerId: "magpie",
    model: "freeimg/flux",
    label: "Pollinations Sana（云端兜底）",
    description: "经本机 Magpie 网关调云端免费出图，不占本机显卡；每 45 秒一张，适合临时补图。",
    tasks: ["portrait", "scene", "series"],
    supportsReference: false,
    maxReferences: 0,
    estimatedCostUsd: 0,
    costNote: "免费额度，每 IP 45 秒一张",
    qualityMode: "fixed",
    supportedAspectRatios: ALL_RATIOS,
  },
];

export const GENERATION_MODELS: readonly GenerationModel[] = MODEL_LIST;

export const generationTaskFor = (input: {
  hasReferences?: boolean;
  textLayout?: boolean;
  series?: boolean;
}): GenerationTaskKind => {
  if (input.hasReferences) return "edit";
  if (input.textLayout) return "text_layout";
  if (input.series) return "series";
  return "portrait";
};

export const findGenerationModel = (id: string | undefined) =>
  id ? MODEL_LIST.find((model) => model.id === id) : undefined;

const providerFor = (
  providers: ProviderStatus["providers"] | undefined,
  providerId: ProviderId,
) => providers?.find((provider) => provider.id === providerId);

export const generationModelAvailability = (
  model: GenerationModel,
  providers?: ProviderStatus["providers"],
): GenerationModelOption => {
  const provider = providerFor(providers, model.providerId);
  if (!provider) {
    return { ...model, available: false, unavailableReason: "未找到该模型提供方。" };
  }
  if (!provider.configured) {
    return {
      ...model,
      available: false,
      unavailableReason:
        model.providerId === "local"
          ? "尚未配置本地图像服务地址。"
          : model.providerId === "comfyui"
            ? "尚未配置 ComfyUI 地址。"
            : `尚未配置 ${model.providerId} 密钥。`,
    };
  }
  if (!provider.capabilities.includes(model.supportsReference ? "image_edit" : "image")) {
    return {
      ...model,
      available: false,
      unavailableReason: `当前 ${model.providerId} 连接未启用该图像能力。`,
    };
  }
  return { ...model, available: true };
};

/** ComfyUI 里可用的 checkpoint 会展开成独立的可选项：装一个模型就多一条通道。 */
const comfyCheckpointModel = (file: string): GenerationModel => ({
  id: `comfyui-${file
    .replace(/\.(safetensors|ckpt)$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`,
  providerId: "comfyui",
  model: file,
  label: file.replace(/\.(safetensors|ckpt)$/i, ""),
  description: `本机 ComfyUI 加载 ${file}，不经过任何云端服务。`,
  tasks: ["portrait", "scene", "series", "edit"],
  supportsReference: false,
  maxReferences: 0,
  estimatedCostUsd: 0,
  costNote: "本机显卡，不计费",
  qualityMode: "tiered",
  supportedAspectRatios: ALL_RATIOS,
});

/** 把 ComfyUI 探测到的 checkpoint 并进清单，替换掉默认的占位条目。 */
export const withComfyCheckpoints = (
  checkpoints?: readonly string[],
): readonly GenerationModel[] => {
  const files = (checkpoints ?? []).filter((file) => /\.(safetensors|ckpt)$/i.test(file));
  if (!files.length) return MODEL_LIST;
  const base = MODEL_LIST.filter((model) => model.id !== "comfyui-local");
  return [...base, ...files.map(comfyCheckpointModel)];
};

/** 本机 ComfyUI 探测到的 checkpoint 由设置页注入，避免四个组件层层传参。 */
let comfyCheckpointCache: readonly string[] = [];

export const setComfyCheckpoints = (checkpoints?: readonly string[]): void => {
  comfyCheckpointCache = checkpoints ?? [];
};

export const listGenerationModels = (
  providers?: ProviderStatus["providers"],
  comfyCheckpoints: readonly string[] = comfyCheckpointCache,
): GenerationModelOption[] =>
  withComfyCheckpoints(comfyCheckpoints).map((model) => {
    const availability = generationModelAvailability(model, providers);
    return {
      ...model,
      available: availability.available,
      unavailableReason: availability.unavailableReason,
    };
  });

export const estimateGenerationCostUsd = (
  model: GenerationModel,
  size: { width: number; height: number } = { width: 1024, height: 1536 },
): number | undefined => {
  if (model.costPerMegapixelUsd) {
    const megapixels = (size.width * size.height) / 1_000_000;
    return Number((megapixels * model.costPerMegapixelUsd).toFixed(3));
  }
  return model.estimatedCostUsd;
};

export type GenerationSelectionInput = {
  task: GenerationTaskKind;
  referenceCount?: number;
  preferredModelId?: string;
  providers?: ProviderStatus["providers"];
  quality?: "draft" | "standard" | "premium";
  aspectRatio?: CreativeAspectRatio;
};

const TASK_FALLBACK: Record<GenerationTaskKind, string[]> = {
  text_layout: ["fal-moss-image", "openai-image", "gemini-image"],
  edit: ["fal-flux-kontext", "gemini-image", "openai-image"],
  portrait: ["fal-flux-schnell", "gemini-image", "flux-direct", "openai-image"],
  scene: ["fal-flux-schnell", "gemini-image", "flux-direct", "openai-image"],
  series: ["fal-flux-kontext", "fal-flux-schnell", "gemini-image", "openai-image"],
};

export type GenerationSelection = {
  model?: GenerationModel;
  issues: string[];
  alternatives: GenerationModelOption[];
};

export const selectGenerationModel = (
  input: GenerationSelectionInput,
): GenerationSelection => {
  const referenceCount = Math.max(0, input.referenceCount ?? 0);
  const compatible = MODEL_LIST.filter(
    (model) =>
      model.tasks.includes(input.task) &&
      (referenceCount === 0 || (model.supportsReference && model.maxReferences >= referenceCount)) &&
      (!input.aspectRatio || model.supportedAspectRatios.includes(input.aspectRatio)),
  );
  const available = compatible
    .map((model) => generationModelAvailability(model, input.providers))
    .filter((model) => model.available);
  const preferred = input.preferredModelId
    ? available.find((model) => model.id === input.preferredModelId)
    : undefined;
  const ordered = [
    ...(preferred ? [preferred] : []),
    ...TASK_FALLBACK[input.task]
      .map((id) => available.find((model) => model.id === id))
      .filter((model): model is GenerationModelOption => Boolean(model)),
    ...available.filter((model) => model.id !== preferred?.id),
  ];
  const model = ordered[0];
  const issues: string[] = [];
  if (!model) {
    if (referenceCount > 0) {
      issues.push("当前没有已配置且支持参考图的模型；请先配置 FLUX Kontext、Gemini 或 OpenAI。");
    } else {
      issues.push("当前没有已配置的图像模型；请先在模型连接页保存密钥。");
    }
  }
  if (input.preferredModelId && !preferred) {
    const requested = MODEL_LIST.find((model) => model.id === input.preferredModelId);
    if (requested && input.aspectRatio && !requested.supportedAspectRatios.includes(input.aspectRatio))
      issues.push(`“${requested.label}”不支持 ${input.aspectRatio} 画幅。`);
    else
      issues.push("指定模型不可用，已改为当前可用模型。");
  }
  return {
    model,
    issues,
    alternatives: listGenerationModels(input.providers).filter((option) =>
      option.tasks.includes(input.task),
    ),
  };
};

export type GenerationPreflight = {
  ok: boolean;
  model?: GenerationModel;
  estimatedCostUsd?: number;
  issues: string[];
};

const normalizeDimensions = (
  size: ImageGenerationSize | { width: number; height: number } | undefined,
) => {
  if (!size) return undefined;
  if (typeof size === "string") {
    const [width, height] = size.split("x").map(Number);
    return { width, height };
  }
  return size;
};

export const preflightGeneration = (
  input: GenerationSelectionInput & {
    size?: ImageGenerationSize | { width: number; height: number };
  },
): GenerationPreflight => {
  const selection = selectGenerationModel(input);
  const issues = selection.issues.filter((issue) => !issue.startsWith("指定模型不可用"));
  if (input.aspectRatio && selection.model && !selection.model.supportedAspectRatios.includes(input.aspectRatio)) {
    issues.push(`该模型不支持 ${input.aspectRatio} 画幅。`);
  }
  if (selection.model) {
    const referenceCount = input.referenceCount ?? 0;
    if (referenceCount > selection.model.maxReferences) {
      issues.push(`该模型最多支持 ${selection.model.maxReferences} 张参考图。`);
    }
    if (referenceCount > 0 && !selection.model.supportsReference) {
      issues.push("该模型不支持参考图，请改用支持参考图的模型。");
    }
  }
  return {
    ok: Boolean(selection.model) && issues.length === 0,
    model: selection.model,
    estimatedCostUsd: selection.model
      ? estimateGenerationCostUsd(selection.model, normalizeDimensions(input.size))
      : undefined,
    issues,
  };
};
