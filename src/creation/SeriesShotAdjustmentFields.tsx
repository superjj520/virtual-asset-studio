import type { CreativeCandidatePlanItem } from "../shared/types";
import {
  SERIES_SHOT_ADJUSTMENTS,
  SERIES_SHOT_ADJUSTMENT_LABELS,
  type SeriesShotAdjustmentKind,
} from "./series-direction";

type SeriesShotAdjustmentFieldsProps = {
  index: number;
  shot: CreativeCandidatePlanItem;
  onChange: (index: number, kind: SeriesShotAdjustmentKind, optionId: string) => void;
};

const KINDS = Object.keys(SERIES_SHOT_ADJUSTMENTS) as SeriesShotAdjustmentKind[];

export function SeriesShotAdjustmentFields({ index, shot, onChange }: SeriesShotAdjustmentFieldsProps) {
  return <details className="series-shot-adjustments">
    <summary>本镜细项 · 场景 / 造型 / 情绪</summary>
    <div className="series-shot-adjustment-grid">
      {KINDS.map((kind) => <label key={kind}>
        <span>{SERIES_SHOT_ADJUSTMENT_LABELS[kind]}</span>
        <select
          aria-label={`第 ${index + 1} 镜头${SERIES_SHOT_ADJUSTMENT_LABELS[kind]}`}
          value={shot[kind] ?? "inherit"}
          onChange={(event) => onChange(index, kind, event.target.value)}
        >
          {SERIES_SHOT_ADJUSTMENTS[kind].map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>)}
    </div>
    <small>只改当前镜头；角色身份、服装连续性和整组顺序保持不变。</small>
  </details>;
}
