import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultSeriesPlan } from "./candidate-variations";
import { SeriesDirectionComparison } from "./SeriesDirectionComparison";
import { SeriesPlanOverview } from "./SeriesPlanOverview";
import { buildSeriesDirections } from "./series-direction";

const currentPlan = createDefaultSeriesPlan();
const directions = buildSeriesDirections(currentPlan);

afterEach(cleanup);

describe("系列方向比较", () => {
  it("并排显示当前序列与整组候选，并只标出真正变化的镜头", () => {
    render(<SeriesDirectionComparison
      currentPlan={currentPlan}
      directions={directions}
      selectedId="emotion"
      onSelect={() => undefined}
    />);

    const panel = screen.getByRole("region", { name: "系列方向比较" });
    expect(within(panel).getByRole("heading", { name: "先比较整组镜头顺序" })).toBeInTheDocument();
    expect(within(panel).getByRole("group", { name: "系列方向候选" })).toBeInTheDocument();

    const current = within(panel).getByRole("region", { name: "当前序列" });
    expect(within(current).getByLabelText("当前第 3 镜头：全身造型")).toBeInTheDocument();

    const selected = within(panel).getByRole("region", { name: "所选方向" });
    expect(within(selected).getByText("所选方向 · 情绪递进")).toBeInTheDocument();
    expect(within(selected).getByText("变化 1 镜")).toBeInTheDocument();
    expect(within(selected).getByLabelText("所选第 3 镜头：细节特写（变化）")).toBeInTheDocument();
    expect(within(selected).getByLabelText("所选第 2 镜头：近景情绪")).toBeInTheDocument();
  });

  it("点击整组方向卡片只切换选择，不把单个镜头当成方向", () => {
    const onSelect = vi.fn();
    render(<SeriesDirectionComparison
      currentPlan={currentPlan}
      directions={directions}
      selectedId="narrative"
      onSelect={onSelect}
    />);

    fireEvent.click(screen.getByRole("button", {
      name: "动作递进方向：系列基准、动作瞬间、越肩关系、环境全景",
    }));

    expect(onSelect).toHaveBeenCalledWith("action");
    expect(screen.getByRole("button", { name: /叙事递进方向/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("进入逐镜调整后只显示已锁定的整组顺序，不再重复方向卡片", () => {
    render(<SeriesPlanOverview plan={directions[2].plan} directionLabel={directions[2].label} />);

    const panel = screen.getByRole("region", { name: "系列整组计划" });
    expect(within(panel).getByRole("heading", { name: "4 个镜头已按顺序锁定" })).toBeInTheDocument();
    expect(within(panel).getByText("基于“动作递进”方向")).toBeInTheDocument();
    expect(within(panel).getByLabelText("系列第 2 镜头：动作瞬间")).toBeInTheDocument();
    expect(within(panel).queryByRole("group", { name: "系列方向候选" })).not.toBeInTheDocument();
  });
});
