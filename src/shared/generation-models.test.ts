import { describe, expect, it } from "vitest";
import {
  estimateGenerationCostUsd,
  findGenerationModel,
  generationTaskFor,
  listGenerationModels,
  preflightGeneration,
  selectGenerationModel,
} from "./generation-models";
import type { ProviderStatus } from "./types";

const providers = (configured: Partial<Record<"fal" | "gemini" | "openai" | "flux", boolean>>) =>
  [
    { id: "fal", configured: configured.fal ?? false, capabilities: ["image", "image_edit"] },
    { id: "gemini", configured: configured.gemini ?? false, capabilities: ["image", "image_edit"] },
    { id: "openai", configured: configured.openai ?? false, capabilities: ["image", "image_edit"] },
    { id: "flux", configured: configured.flux ?? false, capabilities: ["image"] },
  ] as ProviderStatus["providers"];

describe("generation model registry", () => {
  it("按百万像素计算 MOSS 成本", () => {
    const moss = findGenerationModel("fal-moss-image");
    expect(moss).toBeDefined();
    expect(estimateGenerationCostUsd(moss!, { width: 1024, height: 1536 })).toBeCloseTo(0.079, 3);
    expect(estimateGenerationCostUsd(moss!, { width: 1024, height: 1024 })).toBeCloseTo(0.052, 3);
  });

  it("文字版式优先选择 MOSS", () => {
    const selection = selectGenerationModel({
      task: "text_layout",
      providers: providers({ fal: true, gemini: true }),
    });
    expect(selection.model?.id).toBe("fal-moss-image");
    expect(selection.issues).toEqual([]);
  });

  it("无参考人像选择便宜的 FLUX Schnell，有参考图选择 Kontext", () => {
    const plain = selectGenerationModel({
      task: "portrait",
      providers: providers({ fal: true, gemini: true }),
    });
    expect(plain.model?.id).toBe("fal-flux-schnell");

    const withReference = selectGenerationModel({
      task: "edit",
      referenceCount: 1,
      providers: providers({ fal: true, gemini: true }),
    });
    expect(withReference.model?.id).toBe("fal-flux-kontext");
  });

  it("未配置任何图像模型时给出可执行问题", () => {
    const selection = selectGenerationModel({
      task: "portrait",
      providers: providers({}),
    });
    expect(selection.model).toBeUndefined();
    expect(selection.issues.join("")).toContain("模型连接页");
  });

  it("指定不可用模型时回退并提示", () => {
    const selection = selectGenerationModel({
      task: "portrait",
      preferredModelId: "openai-image",
      providers: providers({ fal: true }),
    });
    expect(selection.model?.id).toBe("fal-flux-schnell");
    expect(selection.issues.join("")).toContain("指定模型不可用");
  });

  it("生成前检查把参考图数量作为阻断项", () => {
    const result = preflightGeneration({
      task: "edit",
      referenceCount: 2,
      providers: providers({ fal: true }),
    });
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("列表保留不可用模型及原因，便于界面解释", () => {
    const options = listGenerationModels(providers({ fal: true }));
    expect(options.find((model) => model.id === "fal-moss-image")?.available).toBe(true);
    expect(options.find((model) => model.id === "gemini-image")?.available).toBe(false);
    expect(options.find((model) => model.id === "gemini-image")?.unavailableReason).toContain("gemini");
  });

  it("任务映射覆盖参考图与系列", () => {
    expect(generationTaskFor({ hasReferences: true })).toBe("edit");
    expect(generationTaskFor({ series: true })).toBe("series");
    expect(generationTaskFor({ textLayout: true })).toBe("text_layout");
    expect(generationTaskFor({})).toBe("portrait");
  });
});

describe("真实画幅与模型能力", () => {
  it("MOSS 的 16:9 成本按 1536×864 计算，不再按 3:2 估", () => {
    const moss = findGenerationModel("fal-moss-image")!;
    expect(estimateGenerationCostUsd(moss, { width: 1536, height: 864 })).toBeCloseTo(0.066, 3);
  });

  it("为 9:16 选择模型时排除只支持 1:1/2:3/3:2 的 OpenAI", () => {
    const falOnly = selectGenerationModel({
      task: "portrait",
      aspectRatio: "9:16",
      providers: providers({ fal: true, openai: true }),
    });
    expect(falOnly.model?.id).toBe("fal-flux-schnell");

    const openAiPreflight = preflightGeneration({
      task: "portrait",
      aspectRatio: "16:9",
      preferredModelId: "openai-image",
      providers: providers({ openai: true }),
      size: "1536x864",
    });
    expect(openAiPreflight.ok).toBe(false);
    expect(openAiPreflight.issues.join(" ")).toContain("不支持 16:9");
  });
});
