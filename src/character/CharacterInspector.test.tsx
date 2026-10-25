import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { CharacterDetail, CharacterFactInput } from "../shared/types";
import type { CharacterVariantSelection } from "../shared/character-slots";
import { CharacterInspector } from "./CharacterInspector";

afterEach(() => cleanup());

const profile = {
  id: "role-1", name: "角色甲", group: "lead", lifecycle: "draft", createdAt: "", updatedAt: "",
  card: { intent: "", subject: "成年女性", identityAnchor: "", bodyAndWardrobe: "", expressionAndPose: "", scene: "", lighting: "", camera: "", style: "", avoid: "", aspectRatio: "2:3", referenceAssetIds: [] },
  specification: { identityLocks: [], wardrobeLocks: [], visualMotifs: [], forbiddenChanges: [], requiredAssetKinds: [] },
};

function inspector(detail: CharacterDetail, onSaveFact = vi.fn(async (_input: CharacterFactInput) => {})) {
  function Harness() {
    const [selection, setSelection] = useState<CharacterVariantSelection>({ look: "look-a" });
    return <CharacterInspector detail={detail} selection={selection} onSelectionChange={setSelection} onSaveFact={onSaveFact} onCreateVariant={vi.fn()} onOpenAsset={vi.fn()} onOpenLibrary={vi.fn()} />;
  }
  render(<Harness />);
  return onSaveFact;
}

it("切换造型时不把上一变体未保存的输入带到下一变体", () => {
  const detail = {
    ...profile,
    variants: [
      { id: "look-a", profileId: "role-1", kind: "look", name: "礼服", createdAt: "", updatedAt: "" },
      { id: "look-b", profileId: "role-1", kind: "look", name: "便装", createdAt: "", updatedAt: "" },
    ],
    facts: [{ id: "fact-base", profileId: "role-1", slotKey: "wardrobe.top", group: "wardrobe", label: "上装", value: "基础上装", state: "confirmed", note: "", evidence: [], updatedAt: "" }],
    evidenceAssets: [],
  } as CharacterDetail;
  inspector(detail);
  fireEvent.click(screen.getByRole("button", { name: "服装与搭配" }));
  expect(screen.getByLabelText("上装描述")).toHaveValue("基础上装");
  fireEvent.change(screen.getByLabelText("上装描述"), { target: { value: "未保存的礼服" } });
  fireEvent.change(screen.getByLabelText("造型变体"), { target: { value: "look-b" } });
  expect(screen.getByLabelText("上装描述")).toHaveValue("基础上装");
}, 15_000);

it("选中的变体已有草稿时可继续编辑该草稿，不显示继承的基础配置", () => {
  const detail = {
    ...profile,
    variants: [{ id: "look-a", profileId: "role-1", kind: "look", name: "礼服", createdAt: "", updatedAt: "" }],
    facts: [
      { id: "fact-base", profileId: "role-1", slotKey: "wardrobe.top", group: "wardrobe", label: "上装", value: "基础上装", state: "confirmed", note: "", evidence: [], updatedAt: "" },
      { id: "fact-draft", profileId: "role-1", slotKey: "wardrobe.top", group: "wardrobe", label: "上装", variantId: "look-a", value: "礼服草稿", state: "draft", note: "", evidence: [], updatedAt: "" },
    ],
    evidenceAssets: [],
  } as CharacterDetail;
  inspector(detail);
  fireEvent.click(screen.getByRole("button", { name: "服装与搭配" }));
  expect(screen.getByRole("textbox", { name: "上装描述" })).toHaveValue("礼服草稿");
});

it("失效素材引用仍可在细项里移除并保存", () => {
  const detail = {
    ...profile,
    variants: [], evidenceAssets: [],
    facts: [{ id: "fact-1", profileId: "role-1", slotKey: "face.shape", group: "face", label: "脸型", value: "柔和鹅蛋脸", state: "confirmed", note: "", evidence: [{ assetId: "stale-ref", regionNote: "左侧脸型" }], updatedAt: "" }],
  } as CharacterDetail;
  const onSaveFact = inspector(detail);
  fireEvent.click(screen.getByRole("button", { name: "面部五官" }));
  const faceRow = screen.getByLabelText("脸型描述").closest("article");
  expect(faceRow).not.toBeNull();
  fireEvent.click(within(faceRow as HTMLElement).getByText("自定义或补充说明"));
  fireEvent.click(screen.getByRole("button", { name: "移除失效引用 stale-ref" }));
  fireEvent.click(screen.getByRole("button", { name: "确认脸型" }));
  expect(onSaveFact).toHaveBeenCalledWith(expect.objectContaining({ slotKey: "face.shape", evidence: [] }));
});

it("历史人物卡明确显示未核验来源，可一键搬入待确认细项而不冒充已确认设定", async () => {
  const detail = { ...profile, card: { ...profile.card, identityAnchor: '旧卡里的圆脸', bodyAndWardrobe: '旧卡里的粉色礼服' }, variants: [], facts: [], evidenceAssets: [] } as CharacterDetail;
  const onSaveFact = inspector(detail);
  expect(screen.getByText(/历史文字设定.*待核验/)).toBeInTheDocument();
  fireEvent.click(screen.getByText(/历史文字设定.*待核验/));
  fireEvent.click(screen.getByRole('button', { name: '导入为草稿' }));
  await screen.findByText(/已导入.*待确认/);
  expect(onSaveFact).toHaveBeenCalledWith(expect.objectContaining({ group: 'identity', value: '旧卡里的圆脸', state: 'draft' }));
  expect(onSaveFact).toHaveBeenCalledWith(expect.objectContaining({ group: 'wardrobe', value: '旧卡里的粉色礼服', state: 'draft' }));
});

it("核心人物细项默认用选择题完成，并把用户选择作为人工确认保存", () => {
  const detail = { ...profile, variants: [], facts: [], evidenceAssets: [] } as CharacterDetail;
  const onSaveFact = inspector(detail);

  expect(screen.getByRole("heading", { name: "角色完整度地图" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /身份与辨识/ })).toHaveAttribute("aria-pressed", "true");

  fireEvent.click(screen.getByRole("radio", { name: "年轻成人 25–34" }));
  fireEvent.click(screen.getByRole("button", { name: "确认成年年龄段" }));

  expect(onSaveFact).toHaveBeenCalledWith(expect.objectContaining({
    slotKey: "identity.age",
    value: "年轻成人（25–34岁）",
    state: "confirmed",
  }));
});

it("需要图片证据的细项直接展示素材卡选择，不要求先填写图片描述", () => {
  const detail = {
    ...profile,
    variants: [],
    facts: [],
    evidenceAssets: [{
      id: "asset-front", name: "角色正面全身", type: "character",
      mediaType: "image/png", managedPath: "/tmp/front.png", sha256: "front-hash", metadata: {},
      confirmation: "confirmed", rightsStatus: "original", createdAt: "", updatedAt: "",
    }],
  } as CharacterDetail;
  inspector(detail);

  fireEvent.click(screen.getByRole("button", { name: /角度与局部参考/ }));
  expect(screen.getAllByRole("button", { name: /角色正面全身/ }).length).toBeGreaterThan(0);
  expect(screen.getAllByText("看图选择素材证据").length).toBeGreaterThan(0);
});
