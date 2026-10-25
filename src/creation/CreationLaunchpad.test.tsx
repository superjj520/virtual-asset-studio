import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreationLaunchpad } from "./CreationLaunchpad";

describe("CreationLaunchpad", () => {
  it("先选择结果类型，再进入对应创作流程", () => {
    const onSelect = vi.fn();
    render(<CreationLaunchpad characterCount={3} sceneCount={2} referenceCount={8} onSelect={onSelect} onExit={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "这次要做什么？" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "角色塑造" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "单张画面" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "剧情场景" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "系列镜头" })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "系列镜头" }));
    expect(onSelect).toHaveBeenCalledWith("series");
  });

  it("嵌入创作首页时不显示退出按钮，并可进入项目与历史", () => {
    const onExit = vi.fn();
    const { container } = render(<CreationLaunchpad embedded characterCount={0} sceneCount={0} referenceCount={0} onSelect={vi.fn()} onExit={onExit} />);

    expect(screen.getByRole("heading", { name: "现在想做什么？" })).toBeInTheDocument();
    expect(container.querySelector('[aria-label="退出新建创作"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "项目与历史" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
