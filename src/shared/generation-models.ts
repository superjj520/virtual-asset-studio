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
  providerId: Extract<ProviderId, "openai" | "flux" | "fal" | "gemini">;
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
    description: "通用写实与参考图编辑，受 Gemini 配额影响。",
    tasks: ["portrait", "scene", "series", "text_layout", "edit"],
    supportsReference: true,
    maxReferences: 1,
    costNote: "按 Gemini 配额与计价",
    qualityMode: "tiered",
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
      unavailableReason: `尚未配置 ${model.providerId} 密钥。`,
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

export const listGenerationModels = (
  providers?: ProviderStatus["providers"],
): GenerationModelOption[] =>
  MODEL_LIST.map((model) => {
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
