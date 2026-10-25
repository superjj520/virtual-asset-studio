import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SingleImageContractStrip } from "./SingleImageContractStrip";
import { buildSingleImageChoices } from "./single-image-flow";

afterEach(cleanup);

const choices = buildSingleImageChoices({
  sourceMode: "saved",
  sourceName: "蝶灵",
  presetLabel: "雨夜电影",
  roleLabel: "职业精英",
  wardrobeLabel: "都市职业",
  poseLabel: "倚靠互动",
  expressionLabel: "自然微笑",
  sceneLabel: "现代现实",
  moodLabel: "温柔松弛",
  shotLabel: "全身造型",
  styleLabel: "电影画面",
  aspectRatio: "9:16",
  constraintLabels: ["锁定脸部", "无文字水印"],
});

describe("SingleImageContractStrip", () => {
  it("显示已选约束名称与取值，并标记当前步骤", () => {
    render(<SingleImageContractStrip choices={choices} activeStage="character" onJump={vi.fn()} />);

    const strip = within(screen.getByRole("navigation", { name: "已选约束" }));
    expect(strip.getByText("已选约束")).toBeInTheDocument();
    expect(strip.getByRole("group", { name: "已选约束清单" })).toBeInTheDocument();
    expect(strip.getByRole("button", { name: /已选人物来源：角色 · 蝶灵/ })).toBeInTheDocument();
    expect(strip.getByRole("button", { name: /已选必须保持：锁定脸部 · 无文字水印/ })).toBeInTheDocument();
    expect(strip.getByRole("button", { name: /已选造型/ })).toHaveAttribute("aria-current", "step");
    expect(strip.getByRole("button", { name: /已选场景/ })).not.toHaveAttribute("aria-current");
  });

  it("每一项都能访问已选取值，点击回到对应步骤修改", () => {
    const onJump = vi.fn();
    render(<SingleImageContractStrip choices={choices} activeStage="direction" onJump={onJump} />);

    const strip = within(screen.getByRole("navigation", { name: "已选约束" }));
    expect(strip.getByRole("button", { name: /已选场景/ })).toHaveAttribute("title", "场景：现代现实 · 温柔松弛");
    fireEvent.click(strip.getByRole("button", { name: /已选场景/ }));
    expect(onJump).toHaveBeenCalledWith("story");
    fireEvent.click(strip.getByRole("button", { name: /已选必须保持/ }));
    expect(onJump).toHaveBeenLastCalledWith("output");
  });
});
