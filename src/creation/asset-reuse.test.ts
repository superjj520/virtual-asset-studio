import { describe, expect, it } from "vitest";
import { buildAssetReusePlan, canReuseAsset } from "./asset-reuse";

const base = { id: "asset-1", mediaType: "image/png", metadata: {} };

describe("asset reuse", () => {
  it("继承生成画幅、种子与合法模型", () => {
    const plan = buildAssetReusePlan({
      ...base,
      metadata: { generation: { aspectRatio: "9:16", seed: 42, modelId: "fal-flux-schnell" } },
    });
    expect(plan).toEqual({ assetId: "asset-1", aspectRatio: "9:16", seed: 42, modelId: "fal-flux-schnell" });
  });

  it("无生成元数据时按宽高推断", () => {
    expect(buildAssetReusePlan({ ...base, metadata: { width: 1920, height: 1080 } })?.aspectRatio).toBe("16:9");
    expect(buildAssetReusePlan({ ...base, metadata: { width: 900, height: 1200 } })?.aspectRatio).toBe("2:3");
  });

  it("未完成审片或权利核实的资产不能开始新创作", () => {
    expect(canReuseAsset({ mediaType: "image/png", confirmation: "draft", rightsStatus: "unknown" })).toBe(false);
    expect(canReuseAsset({ mediaType: "image/png", confirmation: "confirmed", rightsStatus: "unknown" })).toBe(false);
    expect(canReuseAsset({ mediaType: "image/png", confirmation: "confirmed", rightsStatus: "authorized" })).toBe(true);
    expect(canReuseAsset({ mediaType: "video/mp4", confirmation: "confirmed", rightsStatus: "authorized" })).toBe(false);
  });

  it("忽略未知模型并拒绝非图片资产", () => {
    expect(buildAssetReusePlan({ ...base, metadata: { generation: { modelId: "missing" } } })?.modelId).toBeUndefined();
    expect(buildAssetReusePlan({ ...base, mediaType: "video/mp4" })).toBeUndefined();
  });
});
