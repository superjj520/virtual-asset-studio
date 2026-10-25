import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreationStudioJourney } from "./CreationStudioJourney";

describe("CreationStudioJourney", () => {
  it("只允许进入已经具备条件的创作阶段", () => {
    const onChange = vi.fn();
    render(<CreationStudioJourney
      active="plan"
      available={["plan", "candidates"]}
      completed={["plan"]}
      onChange={onChange}
    />);

    expect(screen.getByRole("button", { name: /确认角色/ })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: /局部调整/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /选择方向/ }));
    expect(onChange).toHaveBeenCalledWith("candidates");
  });

  it("按创作类型显示对应的流程语义", () => {
    const onChange = vi.fn();
    render(<CreationStudioJourney
      kind="scene"
      active="plan"
      available={["plan", "candidates"]}
      completed={["plan"]}
      onChange={onChange}
    />);

    expect(screen.getByRole("button", { name: /确认剧情/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /场景资产/ })).toBeDisabled();
    expect(screen.queryByText("角色方案与复用")).not.toBeInTheDocument();
  });
});
