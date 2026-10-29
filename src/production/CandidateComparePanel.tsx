import type { ReactNode } from "react";
import type { Asset, StudioJob } from "../shared/types";
import { jobAspectSummary, jobReferenceSummary } from "./job-presentation";

export type CandidateComparisonItem = {
  asset: Asset;
  label: string;
  prompt: string;
  job?: StudioJob;
};

type Props = {
  items: CandidateComparisonItem[];
  renderAsset: (asset: Asset) => ReactNode;
  onClear: () => void;
  onOpen: (assetId: string) => void;
  onSelect?: (assetId: string) => void;
  selectedId?: string;
};

export function CandidateComparePanel({ items, renderAsset, onClear, onOpen, onSelect, selectedId }: Props) {
  if (items.length < 2) return null;
  return (
    <section className="candidate-compare" aria-label="候选横向比较">
      <div className="candidate-compare-heading">
        <strong>横向比较 · {items.length} 张</strong>
        <button type="button" onClick={onClear}>清空比较</button>
      </div>
      <div className="candidate-compare-grid">
        {items.map(({ asset, label, prompt, job }) => (
          <article key={asset.id} className={asset.id === selectedId ? "selected" : ""}>
            {renderAsset(asset)}
            <div className="candidate-compare-content">
              <strong>{label}{asset.id === selectedId && <span className="candidate-current-badge">当前</span>}</strong>
              {job ? (
                <div className="candidate-provenance" aria-label={`${label}的生成来源`}>
                  <span>{job.providerId}</span>
                  <span>画幅 {jobAspectSummary(job)}</span>
                  <span>{jobReferenceSummary(job)}</span>
                  <span>版本 {job.id.slice(0, 8)}</span>
                  {typeof job.request.seed === "number" && <span>种子 {job.request.seed}</span>}
                  {typeof job.request.estimatedCostUsd === "number" && <span>约 ${job.request.estimatedCostUsd.toFixed(3)}</span>}
                </div>
              ) : (
                <p className="candidate-provenance-missing">生成来源未记录</p>
              )}
              <details>
                <summary>查看本轮提示词</summary>
                <p>{prompt}</p>
              </details>
              <div className="candidate-compare-actions">
                {onSelect && <button type="button" className="primary-button" onClick={() => onSelect(asset.id)}>选为当前</button>}
                <button type="button" onClick={() => onOpen(asset.id)}>查看并审片</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
