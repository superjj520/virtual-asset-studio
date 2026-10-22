import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { StudioJob } from "../shared/types";
import { GenerationQueuePanel } from "./GenerationQueuePanel";

afterEach(() => cleanup());

const job = (patch: Partial<StudioJob> = {}): StudioJob => ({
  id: "job-1", projectId: "project", kind: "image_generation", providerId: "gemini",
  status: "failed", request: { requestedAspectRatio: "16:9", actualAspectRatio: "3:2", referenceAssetIds: ["face", "wardrobe"], appliedReferenceAssetIds: ["face"] },
  error: "网络请求超时", retryCount: 0, createdAt: "2026-10-23T00:00:00.000Z", updatedAt: "2026-10-23T00:00:00.000Z",
  ...patch,
});

it("展示模型、画幅映射、参考图送模数量与故障类别", () => {
  render(<GenerationQueuePanel jobs={[job()]} retryingJobIds={new Set()} onRefresh={vi.fn()} onRetry={vi.fn()} />);
  expect(screen.getByText(/gemini/)).toBeInTheDocument();
  expect(screen.getByText("画幅 16:9 → 3:2")).toBeInTheDocument();
  expect(screen.getByText("参考 2 · 送模 1")).toBeInTheDocument();
  expect(screen.getByText("网络中断")).toBeInTheDocument();
});

it("同一父任务已有重试时不再显示重复重试入口", () => {
  const original = job();
  const retried = job({ id: "job-2", status: "unknown", request: { ...original.request, retryOfJobId: original.id }, retryCount: 1 });
  render(<GenerationQueuePanel jobs={[original, retried]} retryingJobIds={new Set()} onRefresh={vi.fn()} onRetry={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "按原请求重试" })).not.toBeInTheDocument();
  expect(screen.getByText("第 1 次重试")).toBeInTheDocument();
});

it("远程状态未知时只查询原任务，不创建新请求", () => {
  const refresh = vi.fn();
  render(<GenerationQueuePanel jobs={[job({ status: "unknown", result: { remoteTask: { requestId: "remote-1", model: "fal-model" } }, error: "网络中断" })]} retryingJobIds={new Set()} onRefresh={refresh} onRetry={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "查询原任务" }));
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "按原请求重试" })).not.toBeInTheDocument();
});
