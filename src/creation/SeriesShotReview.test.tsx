import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SeriesShotReview, approvedSeriesShotLabels } from "./SeriesShotReview";

afterEach(() => cleanup());

const rows = [
  { index: 0, label: "系列基准", assetId: "asset-1", confirmation: "confirmed" as const, versions: 2, selected: true },
  { index: 1, label: "动作瞬间", versions: 0, selected: false },
];

it("逐镜显示结果、版本数与当前选中", () => {
  render(<SeriesShotReview rows={rows} isGenerating={false} onSelect={vi.fn()} onRegenerate={vi.fn()} onReview={vi.fn()} />);
  expect(screen.getByText("1/2 镜已有结果")).toBeInTheDocument();
  expect(screen.getByRole("article", { name: "第 1 镜 系列基准" })).toHaveTextContent("已确认 · 2 个版本");
  expect(screen.getByRole("article", { name: "第 2 镜 动作瞬间" })).toHaveTextContent("未生成");
  expect(screen.getByRole("button", { name: "已选中" })).toBeInTheDocument();
});

it("只对单镜触发重生成", () => {
  const regenerate = vi.fn();
  render(<SeriesShotReview rows={rows} isGenerating={false} onSelect={vi.fn()} onRegenerate={regenerate} onReview={vi.fn()} />);
  fireEvent.click(screen.getAllByRole("button", { name: "重生成" })[0]);
  expect(regenerate).toHaveBeenCalledWith(0);
});

it("单镜采用与淘汰直接回传资产与决定", () => {
  const review = vi.fn();
  const draftRows = [{ index: 0, label: "系列基准", assetId: "asset-1", confirmation: "draft" as const, versions: 1, selected: true }];
  render(<SeriesShotReview rows={draftRows} isGenerating={false} onSelect={vi.fn()} onRegenerate={vi.fn()} onReview={review} />);
  fireEvent.click(screen.getByRole("button", { name: "采用" }));
  expect(review).toHaveBeenCalledWith("asset-1", "confirmed");
  fireEvent.click(screen.getByRole("button", { name: "淘汰" }));
  expect(review).toHaveBeenCalledWith("asset-1", "rejected");
});

it("只汇总已采用且有结果的镜头标签", () => {
  expect(approvedSeriesShotLabels([
    { index: 0, label: "系列基准", assetId: "a", confirmation: "confirmed", versions: 1, selected: false },
    { index: 1, label: "动作瞬间", assetId: "b", confirmation: "draft", versions: 1, selected: false },
    { index: 2, label: "越肩关系", confirmation: "confirmed", versions: 0, selected: false },
  ])).toEqual(["系列基准"]);
});
