import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerationModelPicker } from "./GenerationModelPicker";
import type { ProviderStatus } from "../shared/types";

const providers: ProviderStatus["providers"] = [
  { id: "fal", configured: true, capabilities: ["image", "image_edit"] },
  { id: "gemini", configured: false, capabilities: ["image", "image_edit"] },
  { id: "openai", configured: false, capabilities: ["image", "image_edit"] },
];

afterEach(cleanup);

describe("GenerationModelPicker", () => {
  it("文字版式任务展示 MOSS 并显示按像素计价", () => {
    render(
      <GenerationModelPicker
        providers={providers}
        task="text_layout"
        referenceCount={0}
        value="fal-moss-image"
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveValue("fal-moss-image");
    expect(screen.getByText(/MOSS-Image/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.079/)).toBeInTheDocument();
  });

  it("未配置的模型保留在列表但不可选", () => {
    render(
      <GenerationModelPicker
        providers={providers}
        task="portrait"
        referenceCount={0}
        onChange={() => undefined}
      />,
    );
    const gemini = screen.getByRole("option", { name: /Gemini 图像（未配置）/ });
    expect(gemini).toBeDisabled();
  });

  it("固定输出模型明确说明画质档不改变请求像素", () => {
    render(
      <GenerationModelPicker
        providers={providers}
        task="portrait"
        referenceCount={0}
        value="fal-flux-schnell"
        onChange={() => undefined}
        qualityTier="premium"
      />,
    );
    expect(screen.getByText(/固定输出/)).toBeInTheDocument();
    expect(screen.getByText(/不会改变请求像素/)).toBeInTheDocument();
  });

  it("选择模型时回传 id，自动项回传 undefined", () => {
    const onChange = vi.fn();
    render(
      <GenerationModelPicker
        providers={providers}
        task="portrait"
        referenceCount={0}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "fal-flux-schnell" } });
    expect(onChange).toHaveBeenCalledWith("fal-flux-schnell");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

it("参考图任务不把 MOSS 当作已选模型，落到支持参考图的模型", () => {
  render(
    <GenerationModelPicker
      providers={providers}
      task="series"
      referenceCount={1}
      value="fal-moss-image"
      onChange={() => undefined}
    />,
  );
  expect(screen.getByRole("combobox")).toHaveValue("");
  expect(screen.getByRole("option", { name: /MOSS-Image（不支持参考图）/ })).toBeDisabled();
  expect(screen.getByText(/自动：FLUX Kontext/)).toBeInTheDocument();
});
