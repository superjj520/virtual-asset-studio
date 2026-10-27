import { dimensionsForImageSize, type ImageGenerationSize } from "./types";

export type GenerationSize = ImageGenerationSize;

export const FAL_FLUX_SCHNELL_MODEL = "fal-ai/flux/schnell";
export const FAL_MOSS_IMAGE_MODEL = "fal-ai/moss-image";

const dimensions = (size: GenerationSize) => dimensionsForImageSize(size);

export type FalImageRequestInput = {
  prompt: string;
  negative?: string;
  size: GenerationSize;
  model?: string;
  seed?: number;
};

/**
 * fal 不同模型输入差异很大。把请求体收敛成纯函数，既方便单测，
 * 也避免把 MOSS 的文字版式参数误发给 FLUX。
 */
export const buildFalImageRequest = (
  input: FalImageRequestInput,
): Record<string, unknown> => {
  if (input.model === FAL_MOSS_IMAGE_MODEL) {
    return {
      prompt: input.prompt,
      ...(input.negative?.trim() ? { negative_prompt: input.negative.trim() } : {}),
      image_size: dimensions(input.size),
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      num_inference_steps: 50,
      guidance_scale: 3,
      num_images: 1,
      output_format: "png",
      enable_prompt_expansion: true,
      enable_safety_checker: true,
    };
  }
  return {
    prompt: input.prompt,
    image_size: dimensions(input.size),
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
    num_inference_steps: 4,
    num_images: 1,
    output_format: "png",
    enable_safety_checker: true,
  };
};
