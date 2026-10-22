import { useMemo, useState } from "react";
import type {
  Asset,
  CreativeCard,
  ReferenceAssetRole,
} from "../shared/types";
import {
  REFERENCE_ROLE_LABELS,
  addReferenceBinding,
  normalizeReferenceBindings,
  removeReferenceBinding,
  updateReferenceBinding,
} from "../shared/reference-bindings";

type Props = {
  card: CreativeCard;
  assets: Asset[];
  onChange: (card: CreativeCard) => void;
};

const eligibleReference = (asset: Asset) =>
  asset.mediaType.startsWith("image/") &&
  asset.confirmation === "confirmed" &&
  (asset.rightsStatus === "original" || asset.rightsStatus === "authorized");

export function ReferenceBindingsPanel({ card, assets, onChange }: Props) {
  const normalized = normalizeReferenceBindings(card.referenceAssetIds, card.referenceBindings);
  const [assetToAdd, setAssetToAdd] = useState("");
  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const available = assets.filter(
    (asset) => eligibleReference(asset) && !normalized.referenceAssetIds.includes(asset.id),
  );
  const commit = (next: ReturnType<typeof normalizeReferenceBindings>) =>
    onChange({ ...card, ...next });

  return (
    <section className="reference-bindings" aria-labelledby="reference-bindings-title">
      <div className="reference-bindings-header">
        <div>
          <p className="eyebrow">参考图控制</p>
          <h3 id="reference-bindings-title">明确每张图的用途</h3>
        </div>
        <span>{normalized.referenceBindings.length} 张</span>
      </div>

      {normalized.referenceBindings.length ? (
        <div className="reference-binding-list">
          {normalized.referenceBindings.map((binding) => {
            const asset = assetById.get(binding.assetId);
            return (
              <article key={binding.assetId} className="reference-binding-row">
                <div className="reference-binding-name">
                  <strong>{asset?.name ?? "参考图已移出当前素材库"}</strong>
                  <small>{binding.assetId.slice(0, 8)}</small>
                </div>
                <label>
                  用途
                  <select
                    aria-label={`${asset?.name ?? binding.assetId}的用途`}
                    value={binding.role}
                    onChange={(event) => commit(updateReferenceBinding(
                      normalized.referenceAssetIds,
                      normalized.referenceBindings,
                      binding.assetId,
                      { role: event.target.value as ReferenceAssetRole },
                    ))}
                  >
                    {Object.entries(REFERENCE_ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <span className={`reference-send-status ${binding.priority === "primary" ? "is-sent" : "is-recorded"}`}>
                  {binding.priority === "primary" ? "实际送模" : "仅记录"}
                </span>
                {binding.priority === "support" && (
                  <button
                    type="button"
                    onClick={() => commit(updateReferenceBinding(
                      normalized.referenceAssetIds,
                      normalized.referenceBindings,
                      binding.assetId,
                      { priority: "primary" },
                    ))}
                  >
                    设为主参考
                  </button>
                )}
                <button
                  type="button"
                  className="danger-link"
                  onClick={() => commit(removeReferenceBinding(
                    normalized.referenceAssetIds,
                    normalized.referenceBindings,
                    binding.assetId,
                  ))}
                >
                  移除
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="reference-bindings-empty">
          <strong>本轮尚未绑定参考图</strong>
          <p>没有参考图时会按文字生成；需要锁定角色时请添加已确认素材。</p>
        </div>
      )}

      <div className="reference-binding-add">
        <label>
          添加已确认素材
          <select
            aria-label="添加已确认素材"
            value={assetToAdd}
            onChange={(event) => setAssetToAdd(event.target.value)}
          >
            <option value="">选择图片</option>
            {available.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
        </label>
        <button
          type="button"
          disabled={!assetToAdd}
          onClick={() => {
            if (!assetToAdd) return;
            commit(addReferenceBinding(
              normalized.referenceAssetIds,
              normalized.referenceBindings,
              assetToAdd,
            ));
            setAssetToAdd("");
          }}
        >
          添加参考图
        </button>
      </div>
      {!available.length && (
        <p className="reference-binding-help">只有已确认且使用权为原创或已授权的图片可加入。</p>
      )}
    </section>
  );
}
