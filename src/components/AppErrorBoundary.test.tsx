import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";

function Broken() {
  throw new Error("渲染失败测试");
  return null;
}

describe("AppErrorBoundary", () => {
  it("显示兜底界面并保留草稿提示", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<AppErrorBoundary><Broken /></AppErrorBoundary>);
    expect(screen.getByRole("alert")).toHaveTextContent("当前界面遇到问题");
    expect(screen.getByText(/未保存草稿仍在磁盘中/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新加载界面" })).toBeInTheDocument();
  });
});
