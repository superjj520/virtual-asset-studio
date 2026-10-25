import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_GUIDED_APPEARANCE } from "./creative-plan";
import {
  clearCharacterCreationDraft,
  loadCharacterCreationDraft,
  loadCharacterCreatorProgress,
  saveCharacterCreationDraft,
  saveCharacterCreatorProgress,
} from "./character-creation-draft";

afterEach(() => clearCharacterCreationDraft());

describe("角色创作草稿", () => {
  it("保存并恢复完整角色选择，不依赖远程服务", () => {
    saveCharacterCreationDraft({
      sourceMode: "new",
      presetId: "oriental_moon",
      direction: "character_sheet",
      characterId: "",
      referenceAssetId: "",
      sceneProfileId: "",
      subject: "adult_woman",
      customSubject: "",
      appearance: { ...DEFAULT_GUIDED_APPEARANCE, wardrobe: "couture" },
      scene: "ancient_east",
      customScene: "",
      mood: "cool",
      shot: "character_sheet",
      visualStyle: "photoreal",
      aspectRatio: "2:3",
      constraints: ["identity", "skin"],
      trackerIds: ["mood", "location"],
      customTrackers: [{
        id: "custom-energy",
        label: "体力",
        valueKind: "text",
        value: "充沛",
        options: [],
        visibility: "visible",
        updateRule: "发生动作后更新。",
      }],
      purpose: "portrait",
      qualityTier: "premium",
    });

    expect(loadCharacterCreationDraft()).toEqual(expect.objectContaining({
      sourceMode: "new",
      direction: "character_sheet",
      appearance: expect.objectContaining({ wardrobe: "couture" }),
      trackerIds: ["mood", "location"],
      customTrackers: [expect.objectContaining({ label: "体力", value: "充沛" })],
    }));
  });

  it("恢复所在步骤，并在完成后同时清空内容和进度", () => {
    saveCharacterCreatorProgress({
      mode: "quick",
      section: "details",
      quickStage: "character",
      corePanel: "narrative",
    });
    expect(loadCharacterCreatorProgress()).toEqual({
      version: 1,
      mode: "quick",
      section: "details",
      quickStage: "character",
      corePanel: "narrative",
    });
    clearCharacterCreationDraft();
    expect(loadCharacterCreatorProgress()).toBeUndefined();
    expect(loadCharacterCreationDraft()).toBeUndefined();
  });
});
