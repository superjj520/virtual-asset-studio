import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReviewWorkspacePanel } from "./ReviewWorkspacePanel";
import type { ImageReviewRecord, ReviewWorkspaceSnapshot } from "../shared/types";

const asset = {
  id: "asset-1", type: "image", name: "候选一", managedPath: "/tmp/one.png", sha256: "one",
  mediaType: "image/png", rightsStatus: "authorized", confirmation: "confirmed", metadata: {},
  createdAt: "2026-10-23T00:00:00.000Z", updatedAt: "2026-10-23T00:00:00.000Z",
} as const;

const approved: ImageReviewRecord = {
  id: "review-1", projectId: "project-1", assetId: asset.id, decision: "approved",
  scores: { identity: 5, scene: 4, realism: 4, composition: 5, technical: 4 }, note: "通过", nextAction: "",
  provenance: { providerId: "gemini", prompt: "写实角色", aspectRatio: "2:3", referenceAssetIds: [] },
  createdAt: "2026-10-23T00:00:00.000Z",
};

const snapshot: ReviewWorkspaceSnapshot = {
  projectId: "project-1",
  candidates: [{ asset, latestReview: approved, reviewCount: 1, projectMaster: false }],
  reviews: [approved],
  promotions: [],
};

beforeEach(() => {
  window.studio = {
    assets: { preview: vi.fn().mockResolvedValue("data:image/png;base64,AA==") },
    imageReviews: {
      workspace: vi.fn().mockResolvedValue(snapshot),
      create: vi.fn().mockResolvedValue(approved),
      promote: vi.fn().mockResolvedValue({ id: "promotion-1" }),
    },
  } as never;
});

afterEach(() => cleanup());

it("展示候选来源、图片评分和母版晋级入口", async () => {
  render(<ReviewWorkspacePanel snapshot={snapshot} characters={[]} scenes={[]} onChanged={vi.fn()} onOpenAsset={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "候选一" })).toBeInTheDocument();
  expect(screen.getByText(/模型：gemini/)).toBeInTheDocument();
  expect(screen.getByLabelText("真实质感")).toHaveValue("4");
  expect(await screen.findByAltText("候选一 审片预览")).toBeInTheDocument();
});

it("保存审片时追加记录，晋级时引用当前通过记录", async () => {
  const onChanged = vi.fn();
  render(<ReviewWorkspacePanel snapshot={snapshot} characters={[]} scenes={[]} onChanged={onChanged} onOpenAsset={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "保存审片记录" }));
  await waitFor(() => expect(window.studio.imageReviews.create).toHaveBeenCalledWith(expect.objectContaining({
    projectId: "project-1", assetId: "asset-1", decision: "approved",
  })));
  fireEvent.click(screen.getByRole("button", { name: "晋级母版" }));
  await waitFor(() => expect(window.studio.imageReviews.promote).toHaveBeenCalledWith({
    reviewId: "review-1", targetType: "project", targetId: undefined, versionId: undefined, stateId: undefined,
  }));
});

it("角色母版必须选择角色后才能晋级", () => {
  render(<ReviewWorkspacePanel snapshot={snapshot} characters={[{
    id: "character-1", projectId: "project-1", name: "林澜", card: {} as never, specification: { identityLocks: [], wardrobeLocks: [], visualMotifs: [], forbiddenChanges: [], requiredAssetKinds: [] },
    group: "lead", lifecycle: "draft", createdAt: "", updatedAt: "",
  }]} scenes={[]} onChanged={vi.fn()} onOpenAsset={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("母版类型"), { target: { value: "character" } });
  expect(screen.getByRole("button", { name: "晋级母版" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("母版角色"), { target: { value: "character-1" } });
  expect(screen.getByRole("button", { name: "晋级母版" })).toBeEnabled();
});
