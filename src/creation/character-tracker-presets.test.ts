import { describe, expect, it } from "vitest";
import {
  buildCharacterStateTrackers,
  buildCharacterStateTrackersFromValues,
  DEFAULT_CHARACTER_TRACKER_IDS,
} from "./character-tracker-presets";

describe("角色持续状态模板", () => {
  it("把角色创建选择转换为可持久化状态与更新规则", () => {
    const trackers = buildCharacterStateTrackers(DEFAULT_CHARACTER_TRACKER_IDS, {
      mood: "cool",
      scene: "ancient_east",
      wardrobe: "oriental",
    });
    expect(trackers).toHaveLength(4);
    expect(trackers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "mood", label: "心情", value: "清冷克制", valueKind: "choice" }),
      expect.objectContaining({ id: "location", label: "地点", value: "东方古风", visibility: "visible" }),
      expect.objectContaining({ id: "affinity", label: "关系温度", value: "20", min: 0, max: 100, visibility: "internal" }),
    ]));
    expect(trackers.every((item) => item.updateRule.length > 0)).toBe(true);
  });

  it("按用户多选结果生成状态，不强制全部启用", () => {
    expect(buildCharacterStateTrackersFromValues(["mood", "wardrobe"], {
      mood: "神秘",
      location: "夜景街头",
      wardrobe: "高定礼服",
    })).toMatchObject([
      { id: "mood", value: "神秘" },
      { id: "wardrobe", value: "高定礼服" },
    ]);
  });
});
