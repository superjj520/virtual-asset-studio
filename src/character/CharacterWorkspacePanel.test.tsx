import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { CharacterWorkspaceSnapshot, CreativeCard } from "../shared/types";
import { CharacterWorkspacePanel } from "./CharacterWorkspacePanel";

afterEach(() => cleanup());

const card: CreativeCard = {
  intent: "", subject: "成年角色", identityAnchor: "固定脸部", bodyAndWardrobe: "", expressionAndPose: "",
  scene: "", lighting: "", camera: "", style: "", avoid: "", aspectRatio: "1:1", referenceAssetIds: [],
};

const snapshot: CharacterWorkspaceSnapshot = {
  character: {
    id: "character-1", name: "蝶灵", card,
    specification: { identityLocks: [], wardrobeLocks: [], visualMotifs: [], forbiddenChanges: [], requiredAssetKinds: [] },
    group: "lead", lifecycle: "draft", createdAt: "2026-10-23T00:00:00.000Z", updatedAt: "2026-10-23T00:00:00.000Z",
    facts: [], variants: [], evidenceAssets: [],
  },
  versions: [{
    id: "version-1", profileId: "character-1", versionNumber: 1, label: "基础版本", status: "draft",
    changeSummary: "首次保存", snapshot: { name: "蝶灵", card, specification: { identityLocks: [], wardrobeLocks: [], visualMotifs: [], forbiddenChanges: [], requiredAssetKinds: [] }, facts: [], variants: [] },
    createdAt: "2026-10-23T00:00:00.000Z",
  }],
  states: [], sessions: [], media: [],
};

it("角色工作室同时呈现版本、状态、衍生资产和明确的图片创作入口", () => {
  const start = vi.fn();
  render(<CharacterWorkspacePanel snapshot={snapshot} onChanged={vi.fn()} onStartImage={start} />);
  expect(screen.getByRole("heading", { name: "蝶灵" })).toBeInTheDocument();
  expect(screen.getByText(/V1 · 基础版本/)).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "版本" })).toHaveAttribute("aria-selected", "true");
  fireEvent.click(screen.getByRole("button", { name: "用当前状态开始图片创作" }));
  expect(start).toHaveBeenCalledWith({ versionId: "version-1", stateId: undefined });
});

it("新建角色状态后重新读取工作区，不覆盖角色核心", async () => {
  const next = { ...snapshot, states: [{
    id: "state-1", profileId: "character-1", versionId: "version-1", name: "雨夜", kind: "scene" as const,
    status: "active" as const, wardrobe: "黑色外套", hair: "", expression: "", pose: "", scene: "雨夜街头",
    emotion: "", continuityNotes: "", createdAt: "now", updatedAt: "now",
  }] };
  const createState = vi.fn(async () => next.states[0]);
  const get = vi.fn(async () => next);
  Object.defineProperty(window, "studio", { configurable: true, value: {
    characterWorkspace: { createState, get },
  } });
  const changed = vi.fn();
  render(<CharacterWorkspacePanel snapshot={snapshot} onChanged={changed} onStartImage={vi.fn()} />);
  fireEvent.click(screen.getByRole("tab", { name: "状态" }));
  fireEvent.change(screen.getByLabelText("状态名称"), { target: { value: "雨夜" } });
  fireEvent.change(screen.getByLabelText("服装"), { target: { value: "黑色外套" } });
  fireEvent.change(screen.getByLabelText("场景"), { target: { value: "雨夜街头" } });
  fireEvent.click(screen.getByRole("button", { name: "保存并设为当前状态" }));
  await waitFor(() => expect(createState).toHaveBeenCalledWith("character-1", expect.objectContaining({
    name: "雨夜", versionId: "version-1", status: "active", wardrobe: "黑色外套", scene: "雨夜街头",
  })));
  expect(changed).toHaveBeenCalledWith(next);
  expect(snapshot.character.card.identityAnchor).toBe("固定脸部");
});
