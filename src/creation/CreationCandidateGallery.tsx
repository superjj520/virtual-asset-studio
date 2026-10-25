import { useEffect, useState } from "react";
import type { Asset } from "../shared/types";

type CreationCandidateGalleryProps = {
  candidates: Asset[];
  selectedId?: string;
  generating?: boolean;
  comparisonIds?: string[];
  detailsByAssetId?: Record<string, CandidateDisplayDetail>;
  emptyPreviewSrc?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  onSelect: (assetId: string) => void;
  onToggleComparison?: (assetId: string) => void;
};

export type CandidateDisplayDetail = {
  variationLabel?: string;
  providerLabel?: string;
  aspectLabel?: string;
  referenceLabel?: string;
  versionLabel?: string;
};

const statusLabel = (asset: Asset) => {
  if (asset.confirmation === "rejected") return "已淘汰";
  if (asset.confirmation === "confirmed")
    return ["authorized", "original"].includes(asset.rightsStatus) ? "可入库" : "待权利复核";
  return "待选择";
};

function CandidatePreview({ asset }: { asset: Asset }) {
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    let current = true;
    window.studio.assets.preview(asset.id)
      .then((value) => { if (current) setPreview(value); })
      .catch(() => { if (current) setPreview(undefined); });
    return () => { current = false; };
  }, [asset.id]);

  return preview
    ? <img src={preview} alt={`${asset.name} 候选预览`} />
    : <div className="creation-candidate-placeholder" aria-label="预览加载中">正在读取预览</div>;
}

export function CreationCandidateGallery({
  candidates,
  selectedId,
  generating = false,
  comparisonIds = [],
  detailsByAssetId = {},
  emptyPreviewSrc,
  emptyTitle = "当前方向预览",
  emptyDescription = "方案已经保存。需要成图时，再主动生成候选。",
  onSelect,
  onToggleComparison,
}: CreationCandidateGalleryProps) {
  return (
    <section className="creation-candidate-panel" aria-label="本次生成候选">
      <header className="creation-candidate-heading">
        <div>
          <p className="eyebrow">生成候选</p>
          <h3>{candidates.length ? `已生成 ${candidates.length} 张` : generating ? "正在生成候选" : "等待第一张结果"}</h3>
        </div>
        {candidates.length > 0 && <span>{candidates.length > 1 ? "选择主候选，或加入 2–4 张对比" : "选择一张继续"}</span>}
      </header>
      {candidates.length ? (
        <div className="creation-candidate-grid">
          {candidates.map((asset, index) => {
            const detail = detailsByAssetId[asset.id];
            const compared = comparisonIds.includes(asset.id);
            return <article key={asset.id} className={selectedId === asset.id ? "creation-candidate-card candidate-selected" : "creation-candidate-card"}>
              <button type="button" className="creation-candidate-main" aria-pressed={selectedId === asset.id} onClick={() => onSelect(asset.id)}>
                <span className="creation-candidate-index">候选 {index + 1}</span>
                <CandidatePreview asset={asset} />
                <span className="creation-candidate-meta">
                  <strong>{detail?.variationLabel || asset.name}</strong>
                  <small>{statusLabel(asset)}</small>
                  {detail && <span className="creation-candidate-provenance" aria-label={`${asset.name}的生成来源`}>
                    {detail.providerLabel && <span>{detail.providerLabel}</span>}
                    {detail.aspectLabel && <span>{detail.aspectLabel}</span>}
                    {detail.referenceLabel && <span>{detail.referenceLabel}</span>}
                    {detail.versionLabel && <span>{detail.versionLabel}</span>}
                  </span>}
                </span>
              </button>
              {onToggleComparison && candidates.length > 1 && <button type="button" className={compared ? "creation-compare-toggle selected" : "creation-compare-toggle"} aria-pressed={compared} onClick={() => onToggleComparison(asset.id)}>{compared ? "已加入对比" : "加入对比"}</button>}
            </article>;
          })}
        </div>
      ) : (
        <div className={`${generating ? "creation-candidate-empty is-loading" : "creation-candidate-empty"}${emptyPreviewSrc ? " has-direction-preview" : ""}`}>
          {emptyPreviewSrc && !generating && <img src={emptyPreviewSrc} alt="当前创作方向预览" />}
          <div>
            <span>{generating ? "生成中" : emptyTitle}</span>
            <p>{generating ? "结果完成后会直接出现在这里。" : emptyDescription}</p>
          </div>
        </div>
      )}
    </section>
  );
}
