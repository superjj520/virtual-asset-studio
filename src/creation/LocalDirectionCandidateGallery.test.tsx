import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocalDirectionCandidateGallery } from "./LocalDirectionCandidateGallery";

const variations = [
  { id: "primary", label: "主方案", directive: "保持当前方向" },
  { id: "composition", label: "构图备选", directive: "只调整构图" },
];

describe("LocalDirectionCandidateGallery", () => {
  it("用视觉候选完成本地方向选择", () => {
    const onSelect = vi.fn();
    render(<LocalDirectionCandidateGallery
      previewSrc="/preview.webp"
      variations={variations}
      selectedId="primary"
      onSelect={onSelect}
    />);

    expect(screen.getByRole("button", { name: /主方案/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("先选方向，再进入局部调整")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /构图备选/ }));
    expect(onSelect).toHaveBeenCalledWith("composition");
  });

  it("没有角色视觉基线时显示可用的文字方向，不伪造编号缩略图", () => {
    const { container } = render(<LocalDirectionCandidateGallery
      variations={variations}
      selectedId=""
      onSelect={() => undefined}
    />);

    const view = within(container);
    expect(view.queryByText("01")).not.toBeInTheDocument();
    expect(view.getByRole("button", { name: /主方案/ })).toHaveClass("without-preview");
  });
});
