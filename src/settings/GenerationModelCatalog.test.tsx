import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ProviderStatus } from "../shared/types";
import { GenerationModelCatalog } from "./GenerationModelCatalog";

afterEach(() => cleanup());

const falProviders: ProviderStatus["providers"] = [{ id: "fal", configured: true, capabilities: ["image", "image_edit"] }];

it("展示模型、能力、成本和配置状态", () => {
  render(<GenerationModelCatalog providers={falProviders} onSelect={vi.fn()} />);
  expect(screen.getByRole("region", { name: "图像模型能力" })).toBeInTheDocument();
  expect(screen.getByText("MOSS-Image")).toBeInTheDocument();
  expect(screen.getAllByText(/文字版式/).length).toBeGreaterThan(0);
  expect(screen.getAllByText("纯文本生成").length).toBeGreaterThan(0);
  expect(screen.getByText(/约 \$0\.079\/张/)).toBeInTheDocument();
  expect(screen.getAllByText("未配置").length).toBeGreaterThan(0);
});

it("可选择可用模型并显示已设为默认", () => {
  const onSelect = vi.fn();
  render(<GenerationModelCatalog providers={falProviders} onSelect={onSelect} />);
  fireEvent.click(screen.getAllByRole("button", { name: "设为默认" })[0]);
  expect(onSelect).toHaveBeenCalledWith(expect.any(String));
});

it("选中模型时显示恢复自动选择", () => {
  const onSelect = vi.fn();
  render(<GenerationModelCatalog providers={falProviders} selectedModelId="fal-moss-image" onSelect={onSelect} />);
  expect(screen.getByRole("button", { name: "恢复自动选择" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "已设为默认" }));
  expect(onSelect).toHaveBeenCalledWith("fal-moss-image");
});
