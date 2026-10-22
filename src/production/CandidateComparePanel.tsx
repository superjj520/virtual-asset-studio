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
};

export function CandidateComparePanel({ items, renderAsset, onClear, onOpen }: Props) {
  if (items.length < 2) return null;
  return (
    <section className="candidate-compare" aria-label="候选横向比较">
      <div className="candidate-compare-heading">
        <strong>横向比较 · {items.length} 张</strong>
        <button type="button" onClick={onClear}>清空比较</button>
      </div>
      <div className="candidate-compare-grid">
        {items.map(({ asset, label, prompt, job }) => (
          <article key={asset.id}>
            {renderAsset(asset)}
            <div className="candidate-compare-content">
              <strong>{label}</strong>
              {job ? (
                <div className="candidate-provenance" aria-label={`${label}的生成来源`}>
                  <span>{job.providerId}</span>
                  <span>画幅 {jobAspectSummary(job)}</span>
                  <span>{jobReferenceSummary(job)}</span>
                  <span>版本 {job.id.slice(0, 8)}</span>
                </div>
              ) : (
                <p className="candidate-provenance-missing">生成来源未记录</p>
              )}
              <details>
                <summary>查看本轮提示词</summary>
                <p>{prompt}</p>
              </details>
              <button type="button" onClick={() => onOpen(asset.id)}>查看并审片</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
