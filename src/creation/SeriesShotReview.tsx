export type SeriesShotReviewRow = {
  index: number;
  label: string;
  assetId?: string;
  assetName?: string;
  confirmation?: "draft" | "confirmed" | "rejected";
  versions: number;
  selected: boolean;
};

const CONFIRMATION_LABEL: Record<string, string> = {
  draft: "待确认",
  confirmed: "已确认",
  rejected: "已淘汰",
};

type Props = {
  rows: SeriesShotReviewRow[];
  isGenerating: boolean;
  onSelect: (assetId: string) => void;
  onRegenerate: (index: number) => void;
  onReview: (assetId: string, decision: "confirmed" | "rejected") => void;
};

export function SeriesShotReview({ rows, isGenerating, onSelect, onRegenerate, onReview }: Props) {
  if (!rows.length) return null;
  const generated = rows.filter((row) => row.assetId).length;
  return <section className="series-shot-review" aria-label="逐镜审片">
    <header>
      <div>
        <p className="eyebrow">逐镜审片</p>
        <strong>{generated}/{rows.length} 镜已有结果</strong>
      </div>
      <span>只处理单镜，不改变其他镜头顺序</span>
    </header>
    <div className="series-shot-review-list">
      {rows.map((row) => <article
        key={`${row.index}-${row.label}`}
        className={`series-shot-review-row${row.selected ? " selected" : ""}${row.confirmation === "rejected" ? " rejected" : ""}`}
        aria-label={`第 ${row.index + 1} 镜 ${row.label}`}
      >
        <span className="series-shot-review-index">{String(row.index + 1).padStart(2, "0")}</span>
        <div>
          <strong>{row.label}</strong>
          <small>{row.assetId
            ? `${CONFIRMATION_LABEL[row.confirmation ?? "draft"]} · ${row.versions} 个版本`
            : "未生成"}</small>
        </div>
        <div className="series-shot-review-actions">
          {row.assetId && <button
            type="button"
            className="subtle-button"
            aria-pressed={row.selected}
            onClick={() => row.assetId && onSelect(row.assetId)}
          >{row.selected ? "已选中" : "查看"}</button>}
          {row.assetId && row.confirmation !== "confirmed" && <button
            type="button"
            className="subtle-button"
            onClick={() => row.assetId && onReview(row.assetId, "confirmed")}
          >{row.confirmation === "rejected" ? "恢复" : "采用"}</button>}
          {row.assetId && row.confirmation !== "rejected" && <button
            type="button"
            className="subtle-button"
            onClick={() => row.assetId && onReview(row.assetId, "rejected")}
          >淘汰</button>}
          <button
            type="button"
            className="subtle-button"
            disabled={isGenerating}
            onClick={() => onRegenerate(row.index)}
          >{isGenerating ? "生成中…" : row.assetId ? "重生成" : "生成"}</button>
        </div>
      </article>)}
    </div>
  </section>;
}

export const approvedSeriesShotLabels = (rows: SeriesShotReviewRow[]): string[] =>
  rows.filter((row) => Boolean(row.assetId) && row.confirmation === "confirmed").map((row) => row.label);
