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

it("角色工作室默认以选择题呈现标准衍生资产，并带入版本与状态", () => {
  const start = vi.fn();
  render(<CharacterWorkspacePanel snapshot={snapshot} onChanged={vi.fn()} onStartCreation={start} />);
  expect(screen.getByRole("heading", { name: "蝶灵" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "继续创作" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("radio", { name: /定妆肖像/ })).toHaveAttribute("aria-checked", "true");
  fireEvent.click(screen.getByRole("radio", { name: /表情组/ }));
  fireEvent.click(screen.getByRole("button", { name: "进入表情组工作台" }));
  expect(start).toHaveBeenCalledWith({ kind: "expression_set", versionId: "version-1", stateId: undefined });
});

it("角色资产中枢展示真实主参考图并按资产用途分组", async () => {
  const preview = vi.fn(async () => "data:image/png;base64,YQ==");
  Object.defineProperty(window, "studio", { configurable: true, value: {
    assets: { preview },
  } });
  render(<CharacterWorkspacePanel
    snapshot={{ ...snapshot, character: { ...snapshot.character, masterAssetId: "master-1" } }}
    onChanged={vi.fn()}
    onStartCreation={vi.fn()}
  />);
  expect(screen.getByText("角色资产中枢")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "角色资产" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "故事与演出" })).toBeInTheDocument();
  expect(await screen.findByAltText("蝶灵主参考图")).toHaveAttribute("src", "data:image/png;base64,YQ==");
  expect(preview).toHaveBeenCalledWith("master-1");
});

it("没有主参考图时海报只显示精简身份摘要，不把整段创作描述塞进预览区", () => {
  const longSubject = "明确成年的女性角色，身份与五官结构清晰；明确成年的22至29岁年轻成人，年龄感自然可信；东方主角身份，具有鲜明叙事感并适合连续剧情发展";
  const character = {
    ...snapshot.character,
    card: { ...snapshot.character.card, subject: longSubject },
    facts: [
      { id: "fact-1", profileId: "character-1", slotKey: "identity.persona", group: "identity", label: "辨识身份与气质", value: "东方主角", state: "confirmed", evidence: [], note: "", updatedAt: "" },
      { id: "fact-2", profileId: "character-1", slotKey: "identity.age", group: "identity", label: "成年年龄段", value: "22–29 岁", state: "confirmed", evidence: [], note: "", updatedAt: "" },
      { id: "fact-3", profileId: "character-1", slotKey: "identity.gender", group: "identity", label: "性别呈现", value: "女性呈现", state: "confirmed", evidence: [], note: "", updatedAt: "" },
    ],
  };
  render(<CharacterWorkspacePanel snapshot={{ ...snapshot, character } as never} onChanged={vi.fn()} onStartCreation={vi.fn()} />);
  const poster = screen.getByLabelText("尚未绑定主参考图").parentElement;
  expect(poster).toHaveTextContent("东方主角 · 22–29 岁 · 女性呈现");
  expect(poster).not.toHaveTextContent(longSubject);
});

it("通过选择题建立角色状态并自动命名，不要求填写文字", async () => {
  const next = { ...snapshot, states: [{
    id: "state-1", profileId: "character-1", versionId: "version-1", name: "剧情状态 · 夜景街头", kind: "scene" as const,
    status: "active" as const, wardrobe: "高定礼服", hair: "自然披发", expression: "清冷", pose: "回身", scene: "夜景街头",
    emotion: "神秘", continuityNotes: "锁定脸部；锁定身材；锁定服装；锁定光线", createdAt: "now", updatedAt: "now",
    trackers: [
      { id: "mood", label: "心情", valueKind: "choice" as const, value: "神秘", options: [], visibility: "visible" as const, updateRule: "剧情变化时更新" },
    ],
  }] };
  const createState = vi.fn(async () => next.states[0]);
  const get = vi.fn(async () => next);
  Object.defineProperty(window, "studio", { configurable: true, value: {
    characterWorkspace: { createState, get },
  } });
  const changed = vi.fn();
  render(<CharacterWorkspacePanel snapshot={snapshot} onChanged={changed} onStartCreation={vi.fn()} />);
  fireEvent.click(screen.getByRole("tab", { name: "状态" }));
  expect(screen.queryByRole("textbox", { name: "状态名称" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "剧情状态" }));
  fireEvent.click(screen.getByRole("radio", { name: "高定礼服" }));
  fireEvent.click(screen.getByRole("radio", { name: "自然披发" }));
  fireEvent.click(screen.getByRole("radio", { name: "清冷" }));
  fireEvent.click(screen.getByRole("radio", { name: "回身" }));
  fireEvent.click(screen.getByRole("radio", { name: "夜景街头" }));
  fireEvent.click(screen.getByRole("radio", { name: "神秘" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "锁定服装" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "锁定光线" }));
  expect(screen.getByRole("checkbox", { name: "心情" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByText("剧情状态 · 夜景街头")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "保存为当前状态" }));
  await waitFor(() => expect(createState).toHaveBeenCalledWith("character-1", expect.objectContaining({
    name: "剧情状态 · 夜景街头",
    versionId: "version-1",
    kind: "scene",
    status: "active",
    wardrobe: "高定礼服",
    hair: "自然披发",
    expression: "清冷",
    pose: "回身",
    scene: "夜景街头",
    emotion: "神秘",
    continuityNotes: "锁定脸部；锁定身材；锁定服装；锁定光线",
    trackers: expect.arrayContaining([
      expect.objectContaining({ id: "mood", label: "心情", value: "神秘" }),
      expect.objectContaining({ id: "location", label: "地点", value: "夜景街头" }),
      expect.objectContaining({ id: "affinity", label: "关系温度", valueKind: "scale" }),
    ]),
  })));
  expect(changed).toHaveBeenCalledWith(next);
  expect(snapshot.character.card.identityAnchor).toBe("固定脸部");
});

it("标准字段不足时可以添加自定义持续状态，并随角色状态保存", async () => {
  const createState = vi.fn(async () => ({ id: "state-custom" }));
  const get = vi.fn(async () => snapshot);
  Object.defineProperty(window, "studio", { configurable: true, value: {
    characterWorkspace: { createState, get },
  } });
  render(<CharacterWorkspacePanel snapshot={snapshot} onChanged={vi.fn()} onStartCreation={vi.fn()} />);
  fireEvent.click(screen.getByRole("tab", { name: "状态" }));
  fireEvent.click(screen.getByText("添加自定义状态"));
  fireEvent.change(screen.getByRole("textbox", { name: "新状态字段名称" }), { target: { value: "体力" } });
  fireEvent.change(screen.getByRole("textbox", { name: "新状态字段初始值" }), { target: { value: "充沛" } });
  fireEvent.click(screen.getByRole("button", { name: "添加状态字段" }));
  expect(screen.getByText("体力")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "保存为当前状态" }));
  await waitFor(() => expect(createState).toHaveBeenCalledWith("character-1", expect.objectContaining({
    trackers: expect.arrayContaining([expect.objectContaining({ label: "体力", value: "充沛", visibility: "visible" })]),
  })));
});

it("已保存状态可以修改当前值、可见性和更新规则", async () => {
  const existingState = {
    id: "state-1", profileId: "character-1", versionId: "version-1", name: "基础状态", kind: "baseline" as const,
    status: "active" as const, wardrobe: "主造型", hair: "主发型", expression: "平静", pose: "自然", scene: "东方庭院",
    emotion: "克制", continuityNotes: "锁定脸部", createdAt: "now", updatedAt: "now",
    trackers: [{ id: "mood", label: "心情", valueKind: "choice" as const, value: "克制", options: ["克制", "温柔"], visibility: "visible" as const, updateRule: "发生明确事件或结果变化时更新；没有新事件时保持不变。" }],
  };
  const next = { ...snapshot, states: [{ ...existingState, trackers: [{ ...existingState.trackers[0], value: "温柔", visibility: "internal" as const }] }] };
  const updateState = vi.fn(async () => next.states[0]);
  const get = vi.fn(async () => next);
  Object.defineProperty(window, "studio", { configurable: true, value: {
    characterWorkspace: { updateState, get },
  } });
  render(<CharacterWorkspacePanel snapshot={{ ...snapshot, states: [existingState] }} onChanged={vi.fn()} onStartCreation={vi.fn()} />);
  fireEvent.click(screen.getByRole("tab", { name: "状态" }));
  fireEvent.click(screen.getByRole("button", { name: "编辑状态字段" }));
  fireEvent.click(screen.getByText("编辑字段与更新规则"));
  fireEvent.change(screen.getByRole("textbox", { name: "心情当前值" }), { target: { value: "温柔" } });
  fireEvent.change(screen.getByRole("combobox", { name: "心情可见性" }), { target: { value: "internal" } });
  fireEvent.change(screen.getByRole("combobox", { name: "心情更新规则" }), { target: { value: "interaction" } });
  fireEvent.click(screen.getByRole("button", { name: "保存字段" }));
  await waitFor(() => expect(updateState).toHaveBeenCalledWith("state-1", {
    trackers: [expect.objectContaining({
      id: "mood",
      value: "温柔",
      visibility: "internal",
      updateRule: "根据人物互动、关系变化与共同经历更新。",
    })],
  }));
});

it("版本页可以一键保存当前设定，文字补充不是必填项", async () => {
  const next = { ...snapshot, versions: [...snapshot.versions, {
    ...snapshot.versions[0], id: "version-2", versionNumber: 2, label: "版本 V2", changeSummary: "",
  }] };
  const createVersion = vi.fn(async () => next.versions[1]);
  const get = vi.fn(async () => next);
  Object.defineProperty(window, "studio", { configurable: true, value: {
    characterWorkspace: { createVersion, get },
  } });
  render(<CharacterWorkspacePanel snapshot={snapshot} onChanged={vi.fn()} onStartCreation={vi.fn()} />);
  fireEvent.click(screen.getByRole("tab", { name: "版本" }));
  expect(screen.queryByRole("textbox", { name: "版本名称" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "保存当前版本" }));
  await waitFor(() => expect(createVersion).toHaveBeenCalledWith("character-1", {
    label: undefined,
    status: "draft",
    changeSummary: "",
  }));
});
