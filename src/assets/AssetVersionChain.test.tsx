import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssetVersionChain } from "./AssetVersionChain";

const items = [
  { direction: "source" as const, asset: { id: "a1", name: "初版" } },
  { direction: "derived" as const, asset: { id: "a2", name: "深化版" } },
] as never;

describe("AssetVersionChain", () => {
  it("显示版本链并回传选中资产", () => {
    const onSelect = vi.fn();
    render(<AssetVersionChain current={{ id: "a0", name: "当前图" }} items={items} onSelect={onSelect} />);
    expect(screen.getByLabelText("资产版本链")).toBeInTheDocument();
    expect(screen.getByText("版本链 · 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /来源 · 初版/ }));
    expect(onSelect).toHaveBeenCalledWith("a1");
  });
  it("没有上下游时不渲染", () => {
    const { container } = render(<AssetVersionChain current={{ id: "a0", name: "当前图" }} items={[]} onSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
