import { describe, expect, it } from "vitest";
import {
  addReferenceBinding,
  normalizeReferenceBindings,
  removeReferenceBinding,
  updateReferenceBinding,
} from "./reference-bindings";

describe("参考图语义绑定", () => {
  it("兼容旧卡片并把第一张设为实际送模的主参考", () => {
    expect(normalizeReferenceBindings(["face", "wardrobe", "face"])).toEqual({
      referenceAssetIds: ["face", "wardrobe"],
      referenceBindings: [
        { assetId: "face", role: "identity", priority: "primary" },
        { assetId: "wardrobe", role: "identity", priority: "support" },
      ],
    });
  });

  it("切换主参考时同步排序并保证只有一个主参考", () => {
    const next = updateReferenceBinding(
      ["face", "wardrobe"],
      [
        { assetId: "face", role: "face", priority: "primary" },
        { assetId: "wardrobe", role: "wardrobe", priority: "support" },
      ],
      "wardrobe",
      { priority: "primary" },
    );
    expect(next.referenceAssetIds).toEqual(["wardrobe", "face"]);
    expect(next.referenceBindings).toEqual([
      { assetId: "wardrobe", role: "wardrobe", priority: "primary" },
      { assetId: "face", role: "face", priority: "support" },
    ]);
  });

  it("新增与移除后自动修复主参考", () => {
    const added = addReferenceBinding([], [], "scene", "scene");
    expect(added.referenceBindings[0]).toEqual({ assetId: "scene", role: "scene", priority: "primary" });
    const expanded = addReferenceBinding(added.referenceAssetIds, added.referenceBindings, "pose", "pose");
    const removed = removeReferenceBinding(expanded.referenceAssetIds, expanded.referenceBindings, "scene");
    expect(removed).toEqual({
      referenceAssetIds: ["pose"],
      referenceBindings: [{ assetId: "pose", role: "pose", priority: "primary" }],
    });
  });

  it("忽略不在当前参考列表中的脏绑定", () => {
    const normalized = normalizeReferenceBindings(["face"], [
      { assetId: "missing", role: "scene", priority: "primary" },
      { assetId: "face", role: "face", priority: "support" },
    ]);
    expect(normalized.referenceBindings).toEqual([
      { assetId: "face", role: "face", priority: "primary" },
    ]);
  });
});
