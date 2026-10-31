import { useEffect, useMemo, useState } from "react";
import { canReuseAsset } from "../creation/asset-reuse";
import {
  REFERENCE_SHEET_ROLES,
  REFERENCE_SHEET_ROLE_LABELS,
  buildReferenceSheetPrompt,
  referenceSheetLayout,
  type ReferenceSheetRecipe,
  type ReferenceSheetRole,
  type ReferenceSheetSlotInput,
} from "../shared/reference-sheet";
import type { Asset } from "../shared/types";

type ReferenceSheetComposerProps = {
  assets: Asset[];
  projectId?: string;
  onClose: () => void;
  onUse: (asset: Asset) => void;
  onSaved?: (asset: Asset) => void;
};

type Slots = Partial<Record<ReferenceSheetRole, Asset>>;

const ROLE_HINT: Record<ReferenceSheetRole, string> = {
  identity: "脸型、五官、年龄感、发型",
  wardrobe: "款式、材质、颜色、配饰",
  pose: "站位、重心、手部与镜头",
  scene: "空间、光线、色调与气氛",
};

const ASSET_TYPE_LABELS: Record<string, string> = {
  character: "角色",
  reference_image: "参考图",
  scene: "场景",
  wardrobe: "衣装",
  pose: "姿态",
  image: "成图",
  video: "视频",
  prop: "道具",
  style: "风格",
};

const isImageAsset = (asset: Asset) => asset.mediaType.startsWith("image/");

const preferredType: Record<ReferenceSheetRole, string[]> = {
  identity: ["character", "reference_image", "image"],
  wardrobe: ["wardrobe", "reference_image", "image"],
  pose: ["pose", "reference_image", "image"],
  scene: ["scene", "reference_image", "image"],
};

export function ReferenceSheetComposer({
  assets,
  projectId,
  onClose,
  onUse,
  onSaved,
}: ReferenceSheetComposerProps) {
  const [slots, setSlots] = useState<Slots>({});
  const [activeRole, setActiveRole] = useState<ReferenceSheetRole>("identity");
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Asset>();
  const [recipe, setRecipe] = useState<ReferenceSheetRecipe>();
  const [sheetPreview, setSheetPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const eligible = useMemo(
    () => assets.filter((asset) => canReuseAsset(asset) && isImageAsset(asset) && !asset.metadata?.referenceSheet),
    [assets],
  );
  const eligibleKey = eligible.map((asset) => asset.id).join("|");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const entries = await Promise.all(
        eligible.slice(0, 80).map(async (asset) => {
          try {
            const preview = await window.studio.assets.preview(asset.id);
            return [asset.id, preview ?? ""] as const;
          } catch {
            return [asset.id, ""] as const;
          }
        }),
      );
      if (!cancelled)
        setPreviews(
          Object.fromEntries(entries.filter(([, preview]) => Boolean(preview))),
        );
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [eligibleKey]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const selectedCount = Object.values(slots).filter(Boolean).length;
  const canCompose = Boolean(slots.identity) && selectedCount >= 2 && !busy;
  const livePrompt = buildReferenceSheetPrompt(
    REFERENCE_SHEET_ROLES.filter((role) => slots[role]).map((role) => ({
      role,
      assetId: slots[role]?.id ?? "",
    })),
  );
  const selectedHint = REFERENCE_SHEET_ROLES.filter((role) => slots[role]).map(
    (role) => `${REFERENCE_SHEET_ROLE_LABELS[role]} · ${slots[role]?.name ?? ""}`,
  );
  const activeCandidates = useMemo(() => {
    const priority = preferredType[activeRole];
    return [...eligible].sort((left, right) => {
      const leftIndex = priority.indexOf(left.type);
      const rightIndex = priority.indexOf(right.type);
      return (
        (leftIndex === -1 ? 99 : leftIndex) -
        (rightIndex === -1 ? 99 : rightIndex)
      );
    });
  }, [eligible, activeRole]);

  const choose = (asset: Asset) => {
    const usedBy = REFERENCE_SHEET_ROLES.find(
      (role) => role !== activeRole && slots[role]?.id === asset.id,
    );
    if (usedBy) {
      setError(
        `「${asset.name}」已经用在「${REFERENCE_SHEET_ROLE_LABELS[usedBy]}」槽位；四个槽位必须是不同素材。`,
      );
      return;
    }
    setSlots((current) => ({ ...current, [activeRole]: asset }));
    setError("");
  };

  const clearRole = (role: ReferenceSheetRole) => {
    setSlots((current) => {
      const next = { ...current };
      delete next[role];
      return next;
    });
    setResult(undefined);
    setRecipe(undefined);
    setSheetPreview("");
  };

  const compose = async () => {
    if (!canCompose) {
      setError("参考卡至少需要身份 + 另一项；先选择身份参考。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload: ReferenceSheetSlotInput[] = REFERENCE_SHEET_ROLES.filter(
        (role) => slots[role],
      ).map((role) => ({ role, assetId: slots[role]!.id }));
      const composed = await window.studio.referenceSheets.compose({
        projectId,
        slots: payload,
      });
      setResult(composed.asset);
      setRecipe(composed.recipe);
      const preview = await window.studio.assets.preview(composed.asset.id);
      setSheetPreview(preview ?? "");
      onSaved?.(composed.asset);
    } catch (composeError) {
      setError(
        composeError instanceof Error
          ? composeError.message
          : "参考卡合成失败，请检查素材。",
      );
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setResult(undefined);
    setRecipe(undefined);
    setSheetPreview("");
    setError("");
  };

  const boardPanels = referenceSheetLayout(
    REFERENCE_SHEET_ROLES.map((role) => ({
      role,
      assetId: slots[role]?.id ?? role,
    })),
  ).panels;

  return (
    <div className="reference-sheet-overlay" role="dialog" aria-modal="true" aria-label="参考卡组合">
      <section className="reference-sheet-panel">
        <header className="reference-sheet-header">
          <div>
            <p className="eyebrow">参考卡工坊 · 一张图承载四层语义</p>
            <h2>把身份、服装、姿态、场景压成一张送模参考</h2>
            <p>素材只从已审片、已授权的本地资产里选。合成图保留来源和权利记录。</p>
          </div>
          <button type="button" className="reference-sheet-close" onClick={onClose} aria-label="关闭参考卡组合">
            ×
          </button>
        </header>
        <div className="reference-sheet-body">
          <aside className="reference-sheet-rail" aria-label="参考卡槽位">
            <ol className="reference-sheet-roles">
              {REFERENCE_SHEET_ROLES.map((role, index) => {
                const selected = slots[role];
                return (
                  <li key={role} className={activeRole === role ? "active" : ""}>
                    <button
                      type="button"
                      onClick={() => setActiveRole(role)}
                      className="reference-sheet-role"
                    >
                      <span>{String(index + 1).padStart(2, "0")} · {REFERENCE_SHEET_ROLE_LABELS[role]}</span>
                      <strong>{selected?.name ?? "未选择"}</strong>
                      <small>{ROLE_HINT[role]}</small>
                    </button>
                    {selected && (
                      <button
                        type="button"
                        className="reference-sheet-clear"
                        onClick={() => clearRole(role)}
                        aria-label={`清除${REFERENCE_SHEET_ROLE_LABELS[role]}参考`}
                      >
                        ×
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
            <div className="reference-sheet-summary">
              <strong>{selectedCount} / 4 槽位</strong>
              <span>{selectedHint.length ? selectedHint.join(" · ") : "仍可选择最多四项参考"}</span>
            </div>
            {error && <p className="reference-sheet-error" role="alert">{error}</p>}
            {!result ? (
              <button
                type="button"
                className="reference-sheet-compose"
                onClick={() => void compose()}
                disabled={!canCompose}
              >
                {busy ? "正在合成本地参考卡…" : "合成参考卡"}
              </button>
            ) : (
              <div className="reference-sheet-result-actions">
                <button type="button" className="reference-sheet-use" onClick={() => onUse(result)}>
                  用这张卡开始创作
                </button>
                <button type="button" className="reference-sheet-reset" onClick={reset}>
                  重新调整
                </button>
              </div>
            )}
            <details className="reference-sheet-prompt">
              <summary>查看送模提示词</summary>
              <pre>{recipe?.prompt.positive ?? livePrompt.positive}</pre>
            </details>
          </aside>
          <main className="reference-sheet-stage">
            <div className="reference-sheet-stage-head">
              <div>
                <span className="eyebrow">{result ? "已合成 · 可送入生成" : "本地排版预览"}</span>
                <h3>{result ? result.name : "四格参考板"}</h3>
              </div>
              {result && <span className="reference-sheet-badge">已授权 · 已确认</span>}
            </div>
            {result ? (
              <div className="reference-sheet-final">
                {sheetPreview ? <img src={sheetPreview} alt="已合成的参考卡" /> : <span>参考卡已合成，正在读取预览…</span>}
              </div>
            ) : (
              <div className={`reference-sheet-board board-${boardPanels.length > 2 ? "2x2" : "1x2"}`}>
                {boardPanels.map((panel) => {
                  const asset = slots[panel.role as ReferenceSheetRole];
                  const preview = asset ? previews[asset.id] : "";
                  return (
                    <figure key={panel.role} className={asset ? "filled" : "empty"}>
                      {preview ? <img src={preview} alt={`${REFERENCE_SHEET_ROLE_LABELS[panel.role as ReferenceSheetRole]}参考`} /> : <span className="reference-sheet-empty">{asset ? "读取预览…" : "未选择"}</span>}
                      <figcaption>{panel.label} · {REFERENCE_SHEET_ROLE_LABELS[panel.role as ReferenceSheetRole]}</figcaption>
                    </figure>
                  );
                })}
              </div>
            )}
            {result && (
              <div className="reference-sheet-result-meta">
                <span>合成尺寸 {recipe?.layout.width} × {recipe?.layout.height}</span>
                <span>{recipe?.slots.map((slot) => slot.name).join(" / ")}</span>
              </div>
            )}
            <section className="reference-sheet-picker" aria-label={`为${REFERENCE_SHEET_ROLE_LABELS[activeRole]}选择素材`}>
              <header>
                <div>
                  <strong>为「{REFERENCE_SHEET_ROLE_LABELS[activeRole]}」选素材</strong>
                  <small>只显示已审片、权利可用的本地图片</small>
                </div>
                <span>{activeCandidates.length} 张可用</span>
              </header>
              {activeCandidates.length ? (
                <div className="reference-sheet-assets">
                  {activeCandidates.map((asset) => {
                    const preview = previews[asset.id];
                    const selected = slots[activeRole]?.id === asset.id;
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        className={selected ? "reference-sheet-asset selected" : "reference-sheet-asset"}
                        onClick={() => choose(asset)}
                        title={`${asset.name} · ${ASSET_TYPE_LABELS[asset.type] ?? asset.type}`}
                      >
                        {preview ? <img src={preview} alt="" /> : <span>无预览</span>}
                        <strong>{asset.name}</strong>
                        <small>{ASSET_TYPE_LABELS[asset.type] ?? asset.type}</small>
                        {selected && <em>已选</em>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="reference-sheet-no-assets">还没有可用的图片素材。先到素材库完成审片和权利确认。</p>
              )}
            </section>
          </main>
        </div>
      </section>
    </div>
  );
}
