import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { SceneWorkspaceSnapshot } from "../shared/types";
import { SceneWorkspacePanel } from "./SceneWorkspacePanel";

afterEach(() => cleanup());

const snapshot: SceneWorkspaceSnapshot = {
  scene: {
    id: "scene-1", name: "雨夜玻璃温室", kind: "interior", lifecycle: "confirmed",
    anchor: "狭长中轴温室", layout: "中央石板路", materials: "旧铁框与潮湿玻璃", colorSystem: "墨绿与冷蓝",
    requiredElements: "拱形门", forbiddenChanges: "不改变中轴结构", createdAt: "now", updatedAt: "now",
  },
  versions: [{
    id: "version-1", profileId: "scene-1", versionNumber: 1, label: "正式空间 V1", status: "locked",
    changeSummary: "首次锁定", snapshot: {
      name: "雨夜玻璃温室", kind: "interior", lifecycle: "confirmed", anchor: "狭长中轴温室",
      layout: "中央石板路", materials: "旧铁框与潮湿玻璃", colorSystem: "墨绿与冷蓝",
      requiredElements: "拱形门", forbiddenChanges: "不改变中轴结构",
    }, createdAt: "now",
  }],
  states: [{
    id: "state-1", profileId: "scene-1", versionId: "version-1", name: "雨夜", status: "active",
    timeOfDay: "深夜", weather: "小雨", season: "夏季", lighting: "冷月光", atmosphere: "玻璃水汽",
    setDressing: "少量暖灯", continuityNotes: "地面保持潮湿", createdAt: "now", updatedAt: "now",
  }],
  sessions: [], media: [],
};
snapshot.activeVersion = snapshot.versions[0];
snapshot.activeState = snapshot.states[0];

it("场景工作室清楚分离空间基线、环境状态和图片创作入口", () => {
  const start = vi.fn();
  render(<SceneWorkspacePanel snapshot={snapshot} onChanged={vi.fn()} onStartImage={start} />);
  expect(screen.getByRole("heading", { name: "雨夜玻璃温室" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "版本" }));
  expect(screen.getByText(/V1 · 正式空间 V1/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "环境状态" }));
  expect(screen.getAllByText("雨夜").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "用当前场景开始图片创作" }));
  expect(start).toHaveBeenCalledWith({ versionId: "version-1", stateId: "state-1" });
});

it("保存场景核心后重新读取工作区", async () => {
  const next = { ...snapshot, scene: { ...snapshot.scene, layout: "中央石板路与两侧种植池" } };
  const update = vi.fn(async () => next.scene);
  const get = vi.fn(async () => next);
  Object.defineProperty(window, "studio", { configurable: true, value: { sceneWorkspace: { update, get } } });
  const changed = vi.fn();
  render(<SceneWorkspacePanel snapshot={snapshot} onChanged={changed} onStartImage={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("空间结构"), { target: { value: "中央石板路与两侧种植池" } });
  fireEvent.click(screen.getByRole("button", { name: "保存场景基线" }));
  await waitFor(() => expect(update).toHaveBeenCalledWith("scene-1", expect.objectContaining({ layout: "中央石板路与两侧种植池" })));
  expect(changed).toHaveBeenCalledWith(next);
});
