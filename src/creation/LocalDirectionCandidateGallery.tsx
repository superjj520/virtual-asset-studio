import type { CandidateVariation } from "./candidate-variations";

type LocalDirectionCandidateGalleryProps = {
  previewSrc?: string;
  variations: CandidateVariation[];
  selectedId?: string;
  onSelect: (variationId: string) => void;
};

const VISUAL_TREATMENTS = ["balanced", "closer", "spatial", "luminous"] as const;

export function LocalDirectionCandidateGallery({
  previewSrc,
  variations,
  selectedId,
  onSelect,
}: LocalDirectionCandidateGalleryProps) {
  return <section className="local-direction-panel" aria-label="方案方向候选">
    <header className="creation-candidate-heading">
      <div>
        <p className="eyebrow">方向候选</p>
        <h3>先选择画面重点</h3>
      </div>
      <span>先选方向，再进入局部调整</span>
    </header>
    <div className="local-direction-grid">
      {variations.map((variation, index) => {
        const selected = selectedId === variation.id;
        return <button
          type="button"
          key={variation.id}
          className={`${selected ? "local-direction-card selected" : "local-direction-card"}${previewSrc ? "" : " without-preview"}`}
          aria-pressed={selected}
          onClick={() => onSelect(variation.id)}
        >
          {previewSrc && <span className={`local-direction-visual treatment-${VISUAL_TREATMENTS[index % VISUAL_TREATMENTS.length]}`}>
            <img src={previewSrc} alt="" />
            <i>方向 {String(index + 1).padStart(2, "0")}</i>
          </span>}
          <span className="local-direction-copy">
            <strong>{variation.label}</strong>
            <small>{variation.directive}</small>
            {previewSrc && <em>基于当前角色视觉基线预演</em>}
          </span>
          <span className="local-direction-check" aria-hidden="true">{selected ? "✓" : ""}</span>
        </button>;
      })}
    </div>
  </section>;
}
