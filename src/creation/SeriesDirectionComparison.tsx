import type { CandidateVariation } from "./candidate-variations";
import {
  summarizeSeriesDirectionChanges,
  type SeriesDirection,
} from "./series-direction";

type SeriesDirectionComparisonProps = {
  currentPlan: CandidateVariation[];
  directions: SeriesDirection[];
  selectedId: string;
  onSelect: (directionId: string) => void;
};

export function SeriesDirectionComparison({
  currentPlan,
  directions,
  selectedId,
  onSelect,
}: SeriesDirectionComparisonProps) {
  const selected = directions.find((direction) => direction.id === selectedId) ?? directions[0];
  const changes = selected ? summarizeSeriesDirectionChanges(currentPlan, selected.plan) : [];
  const changedCount = changes.filter((change) => change.changed).length;

  return <section className="series-direction-panel" aria-label="系列方向比较">
    <header className="creation-candidate-heading">
      <div>
        <p className="eyebrow">整组方向</p>
        <h3>先比较整组镜头顺序</h3>
      </div>
      <span>一次选择 4 个镜头的组合，不拆散系列</span>
    </header>

    <div className="series-direction-grid" role="group" aria-label="系列方向候选">
      {directions.map((direction, index) => {
        const isSelected = direction.id === selected?.id;
        const sequenceLabel = direction.plan.map((shot) => shot.label).join("、");
        return <button
          type="button"
          key={direction.id}
          className={`series-direction-card${isSelected ? " selected" : ""}`}
          aria-pressed={isSelected}
          aria-label={`${direction.label}方向：${sequenceLabel}`}
          onClick={() => onSelect(direction.id)}
        >
          <span className="series-direction-index">方向 {String(index + 1).padStart(2, "0")}</span>
          <strong>{direction.label}</strong>
          <small>{direction.hint}</small>
          <span className="series-direction-mini" aria-hidden="true">
            {direction.plan.map((shot, shotIndex) => <i key={`${direction.id}-${shotIndex}`}>{shotIndex + 1}. {shot.label}</i>)}
          </span>
        </button>;
      })}
    </div>

    {selected && <div className="series-direction-compare" role="group" aria-label="当前序列与所选方向对比">
      <section className="series-direction-column" aria-label="当前序列">
        <header>
          <span>当前序列</span>
          <small>{currentPlan.length} 镜头</small>
        </header>
        <ol>
          {currentPlan.map((shot, index) => <li key={`current-${index}-${shot.id}`} aria-label={`当前第 ${index + 1} 镜头：${shot.label}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{shot.label}</strong>
          </li>)}
        </ol>
      </section>
      <section className="series-direction-column selected" aria-label="所选方向">
        <header>
          <span>所选方向 · {selected.label}</span>
          <small>{changedCount ? `变化 ${changedCount} 镜` : "顺序一致"}</small>
        </header>
        <ol>
          {selected.plan.map((shot, index) => {
            const changed = Boolean(changes[index]?.changed);
            return <li
              key={`selected-${index}-${shot.id}`}
              className={changed ? "changed" : undefined}
              aria-label={`所选第 ${index + 1} 镜头：${shot.label}${changed ? "（变化）" : ""}`}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{shot.label}</strong>
              {changed && <small>变化</small>}
            </li>;
          })}
        </ol>
      </section>
    </div>}
  </section>;
}
