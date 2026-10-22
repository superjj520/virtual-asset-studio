import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CollectionAssetFilterBar, filterCollectionAssets, type CollectionAssetFilters } from "./CollectionAssetFilterBar";
import type { AssetCollectionMember } from "../shared/types";

const assets: AssetCollectionMember[] = [
  { id: "face", type: "reference_image", name: "正脸主参考", managedPath: "/face.png", sha256: "face", mediaType: "image/png", rightsStatus: "authorized", confirmation: "confirmed", metadata: {}, createdAt: "", updatedAt: "", membershipRole: "身份锚点", moduleKey: "face" },
  { id: "pose", type: "pose", name: "侧身站姿", managedPath: "/pose.png", sha256: "pose", mediaType: "image/png", rightsStatus: "unknown", confirmation: "draft", metadata: {}, createdAt: "", updatedAt: "", membershipRole: "姿势参考", moduleKey: "pose", notes: "仅看重心" },
];

const defaults: CollectionAssetFilters = { query: "", moduleKey: "all", confirmation: "all", rights: "all" };

describe("CollectionAssetFilterBar", () => {
  it("按模块、审片、权利和文字组合筛选", () => {
    expect(filterCollectionAssets(assets, { ...defaults, moduleKey: "face", confirmation: "confirmed", rights: "usable" })).toEqual([assets[0]]);
    expect(filterCollectionAssets(assets, { ...defaults, query: "重心", rights: "pending" })).toEqual([assets[1]]);
  });

  it("把筛选变化交给工作区并显示结果数", () => {
    const onChange = vi.fn();
    render(<CollectionAssetFilterBar filters={defaults} modules={[{ key: "face", label: "脸部", description: "", required: true, acceptedAssetTypes: ["image"] }]} resultCount={1} totalCount={2} onChange={onChange} />);
    expect(screen.getByText("1/2 项")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("搜索"), { target: { value: "正脸" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ query: "正脸" }));
  });
});
