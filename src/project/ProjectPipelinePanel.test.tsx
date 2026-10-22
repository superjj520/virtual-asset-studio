import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProjectWorkspace } from "../shared/types";
import { ProjectPipelinePanel } from "./ProjectPipelinePanel";

const snapshot = {
  project: { id: "project", name: "角色企划", medium: "image", createdAt: "", updatedAt: "" },
  health: { assetCount: 2, confirmedAssetCount: 1, candidateAssetCount: 1, masterAssetCount: 0, generationCount: 1 },
  masterAssets: [],
  pipeline: [
    { key: "creation", label: "创作", status: "ready", summary: "5/5 简报 · 1 个任务", nextAction: "继续当前创作", target: "creation", primaryCount: 1 },
    { key: "assets", label: "资产", status: "needs_attention", summary: "1 角色 · 0 场景 · 1 可用素材", nextAction: "补齐可用素材", target: "assets", primaryCount: 1 },
    { key: "production", label: "生产", status: "needs_attention", summary: "0 个镜头 · 1 次生成 · 0 张通过", nextAction: "审片并锁定母版", target: "review", primaryCount: 1 },
    { key: "templates", label: "模板", status: "not_started", summary: "0 个配方 · 0 个已验证", nextAction: "沉淀第一条配方", target: "recipes", primaryCount: 0 },
  ],
  blockers: [{ code: "review", label: "候选待审片", detail: "1 张候选等待判断", count: 1, target: "review" }],
  recommendedNextAction: "候选待审片",
} satisfies ProjectWorkspace;

describe("ProjectPipelinePanel", () => {
  it("用四域状态和阻塞项提供可执行导航", () => {
    const onNavigate = vi.fn();
    render(<ProjectPipelinePanel snapshot={snapshot} onNavigate={onNavigate} />);
    expect(screen.getByText("0/4 已闭环")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /生产.*0 个镜头.*审片并锁定母版/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /候选待审片.*1 张候选等待判断/ }));
    expect(onNavigate).toHaveBeenCalledWith("review");
  });

  it("读取期间显示明确状态而不是空白区域", () => {
    render(<ProjectPipelinePanel onNavigate={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("正在汇总项目状态");
  });
});
