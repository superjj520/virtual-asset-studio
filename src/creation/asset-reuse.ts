import type { Asset, CreativeAspectRatio } from "../shared/types";
import { findGenerationModel } from "../shared/generation-models";

const ASPECT_RATIOS: CreativeAspectRatio[] = ["1:1", "2:3", "3:2", "4:3", "9:16", "16:9"];

export type AssetReusePlan = {
  assetId: string;
  aspectRatio: CreativeAspectRatio;
  seed?: number;
  modelId?: string;
};

export function buildAssetReusePlan(asset: Pick<Asset, "id" | "mediaType" | "metadata">): AssetReusePlan | undefined {
  if (!asset.mediaType.startsWith("image/")) return undefined;
  const generation = asset.metadata.generation && typeof asset.metadata.generation === "object"
    ? asset.metadata.generation as Record<string, unknown>
    : undefined;
  const width = Number(asset.metadata.width);
  const height = Number(asset.metadata.height);
  const remembered = generation?.aspectRatio;
  const aspectRatio = ASPECT_RATIOS.includes(remembered as CreativeAspectRatio)
    ? remembered as CreativeAspectRatio
    : width && height
      ? width === height ? "1:1" : width > height ? "16:9" : "2:3"
      : "2:3";
  return {
    assetId: asset.id,
    aspectRatio,
    seed: typeof generation?.seed === "number" ? generation.seed : undefined,
    modelId: typeof generation?.modelId === "string" && findGenerationModel(generation.modelId) ? generation.modelId : undefined,
  };
}
