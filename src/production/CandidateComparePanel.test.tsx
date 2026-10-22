import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Asset, StudioJob } from "../shared/types";
import { CandidateComparePanel } from "./CandidateComparePanel";

afterEach(() => cleanup());

const asset = (id: string): Asset => ({
  id, name: id, type: "image", managedPath: `/tmp/${id}.png`, sha256: id, mediaType: "image/png",
  rightsStatus: "original", confirmation: "draft", metadata: {}, createdAt: "", updatedAt: "",
});
const job = (id: string): StudioJob => ({
  id, projectId: "project", kind: "image_generation", providerId: "gemini", status: "completed",
  request: { requestedAspectRatio: "2:3", actualAspectRatio: "2:3", referenceAssetIds: ["face"], appliedReferenceAssetIds: ["face"] },
  result: { assetId: id }, retryCount: 0, createdAt: "", updatedAt: "",
});

it("比较候选时直接展示模型、画幅、参考图与提示词版本", () => {
  const open = vi.fn();
  render(<CandidateComparePanel
    items={[
      { asset: asset("a"), label: "候选 A", prompt: "暖光", job: job("job-a123456") },
      { asset: asset("b"), label: "候选 B", prompt: "冷光", job: job("job-b123456") },
    ]}
    renderAsset={(item) => <span>预览 {item.name}</span>}
    onClear={vi.fn()}
    onOpen={open}
  />);
  expect(screen.getAllByText("gemini")).toHaveLength(2);
  expect(screen.getAllByText("画幅 2:3")).toHaveLength(2);
  expect(screen.getAllByText("参考 1 · 送模 1")).toHaveLength(2);
  expect(screen.getByText("版本 job-a123")).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "查看并审片" })[0]);
  expect(open).toHaveBeenCalledWith("a");
});

it("缺少生成作业时明确标记来源缺失", () => {
  render(<CandidateComparePanel
    items={[
      { asset: asset("a"), label: "候选 A", prompt: "暖光" },
      { asset: asset("b"), label: "候选 B", prompt: "冷光" },
    ]}
    renderAsset={() => null}
    onClear={vi.fn()}
    onOpen={vi.fn()}
  />);
  expect(screen.getAllByText("生成来源未记录")).toHaveLength(2);
});
