import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Asset } from "../shared/types";
import { CreationCandidateGallery } from "./CreationCandidateGallery";

const candidate: Asset = {
  id: "candidate-1",
  type: "image",
  name: "生成候选",
  managedPath: "/tmp/candidate.png",
  sha256: "hash",
  mediaType: "image/png",
  rightsStatus: "unknown",
  confirmation: "draft",
  metadata: {},
  createdAt: "2026-10-23T00:00:00.000Z",
  updatedAt: "2026-10-23T00:00:00.000Z",
};

describe("CreationCandidateGallery", () => {
  beforeEach(() => {
    window.studio = {
      assets: { preview: vi.fn().mockResolvedValue("data:image/png;base64,abc") },
    } as unknown as typeof window.studio;
  });

  it("选择候选后回传素材编号", async () => {
    const onSelect = vi.fn();
    render(<CreationCandidateGallery candidates={[candidate]} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /候选 1/ }));
    expect(onSelect).toHaveBeenCalledWith("candidate-1");
  });

  it("候选可在当前创作页加入横向对比并查看来源", () => {
    const onToggleComparison = vi.fn();
    render(<CreationCandidateGallery
      candidates={[candidate, { ...candidate, id: "candidate-2", name: "第二张候选", sha256: "hash-2" }]}
      comparisonIds={[candidate.id]}
      detailsByAssetId={{
        [candidate.id]: {
          variationLabel: "换场景",
          providerLabel: "Gemini",
          aspectLabel: "画幅 1:1",
          referenceLabel: "参考 1 · 送模 1",
          versionLabel: "版本 abc12345",
        },
      }}
      onSelect={vi.fn()}
      onToggleComparison={onToggleComparison}
    />);

    expect(screen.getByLabelText("生成候选的生成来源")).toHaveTextContent("Gemini");
    expect(screen.getByRole("button", { name: "已加入对比" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "加入对比" }));
    expect(onToggleComparison).toHaveBeenCalledWith("candidate-2");
  });

  it("没有结果时保留当前方案并等待用户主动生成", () => {
    render(<CreationCandidateGallery candidates={[]} onSelect={vi.fn()} />);
    expect(screen.getByText("当前方向预览")).toBeInTheDocument();
    expect(screen.getByText(/需要成图时/)).toBeInTheDocument();
  });
});
