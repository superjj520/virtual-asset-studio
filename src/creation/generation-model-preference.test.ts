import { describe, expect, it } from "vitest";
import { readGenerationModelPreference, writeGenerationModelPreference } from "./generation-model-preference";

const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
};

describe("generation model preference", () => {
  it("读取已保存的合法模型", () => {
    const target = storage();
    writeGenerationModelPreference("fal-moss-image", target);
    expect(readGenerationModelPreference(target)).toBe("fal-moss-image");
  });

  it("忽略未知模型与损坏存储", () => {
    const target = storage();
    target.setItem("studio.generation-model", "unknown-model");
    expect(readGenerationModelPreference(target)).toBeUndefined();
    expect(readGenerationModelPreference(undefined)).toBeUndefined();
  });

  it("清除选择时删除偏好", () => {
    const target = storage();
    writeGenerationModelPreference("fal-moss-image", target);
    writeGenerationModelPreference(undefined, target);
    expect(readGenerationModelPreference(target)).toBeUndefined();
  });
});
