import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Asset, CreativeCard } from "../shared/types";
import { ReferenceBindingsPanel } from "./ReferenceBindingsPanel";

afterEach(() => cleanup());

const card: CreativeCard = {
  intent: "角色定妆", subject: "成年角色", identityAnchor: "固定脸部", bodyAndWardrobe: "",
  expressionAndPose: "", scene: "", lighting: "", camera: "", style: "", avoid: "",
  aspectRatio: "2:3", referenceAssetIds: ["face", "wardrobe"],
  referenceBindings: [
    { assetId: "face", role: "face", priority: "primary" },
    { assetId: "wardrobe", role: "wardrobe", priority: "support" },
  ],
};

const asset = (id: string, name: string, confirmation: Asset["confirmation"] = "confirmed"): Asset => ({
  id, name, type: "reference_image", managedPath: `/tmp/${id}.png`, sha256: id,
  mediaType: "image/png", rightsStatus: "authorized", confirmation, metadata: {}, createdAt: "", updatedAt: "",
});

it("明确区分实际送模与仅记录，并可切换主参考", () => {
  const onChange = vi.fn();
  render(<ReferenceBindingsPanel card={card} assets={[asset("face", "脸部"), asset("wardrobe", "服装")]} onChange={onChange} />);
  expect(screen.getByText("实际送模")).toBeInTheDocument();
  expect(screen.getByText("仅记录")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "设为主参考" }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
    referenceAssetIds: ["wardrobe", "face"],
    referenceBindings: expect.arrayContaining([
      { assetId: "wardrobe", role: "wardrobe", priority: "primary" },
    ]),
  }));
});

it("只能添加权利和审片均通过的图片", () => {
  const onChange = vi.fn();
  render(<ReferenceBindingsPanel card={{ ...card, referenceAssetIds: [], referenceBindings: [] }} assets={[
    asset("usable", "可用参考"),
    asset("draft", "待审参考", "draft"),
  ]} onChange={onChange} />);
  const selector = screen.getByRole("combobox", { name: "添加已确认素材" });
  expect(screen.getByRole("option", { name: "可用参考" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "待审参考" })).not.toBeInTheDocument();
  fireEvent.change(selector, { target: { value: "usable" } });
  fireEvent.click(screen.getByRole("button", { name: "添加参考图" }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
    referenceAssetIds: ["usable"],
    referenceBindings: [{ assetId: "usable", role: "identity", priority: "primary" }],
  }));
});
