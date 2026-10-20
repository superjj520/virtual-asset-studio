import { useState } from "react";
import {
  activeCharacterFacts, CHARACTER_GROUPS, CHARACTER_SLOTS,
  evaluateCharacterCoverage, type CharacterSlotGroup, type CharacterUseCase,
  type CharacterVariantSelection,
} from "../shared/character-slots";
import type {
  Asset, CharacterDetail, CharacterFact, CharacterFactEvidence,
  CharacterFactInput, CharacterVariantKind,
} from "../shared/types";

const PURPOSES: { id: CharacterUseCase; label: string }[] = [
  { id: "portrait", label: "肖像" }, { id: "full_body", label: "全身设定" }, { id: "series", label: "连续镜头" },
];
const VARIANT_LABELS: Record<CharacterVariantKind, string> = {
  look: "造型", expression: "表情", pose: "动作", scene: "情境",
};
const VARIANT_BY_GROUP: Partial<Record<CharacterSlotGroup, CharacterVariantKind>> = {
  wardrobe: "look", expression: "expression", pose: "pose", scene: "scene",
};

type FactRowProps = {
  slotKey: string;
  group: CharacterSlotGroup;
  label: string;
  visualEvidence: boolean;
  fact?: CharacterFact;
  variantId?: string;
  assets: Asset[];
  required: boolean;
  onSave: (input: CharacterFactInput) => Promise<void>;
  onOpenAsset: (id: string) => void;
};

function FactRow({ slotKey, group, label, visualEvidence, fact, variantId, assets, required, onSave, onOpenAsset }: FactRowProps) {
  const [value, setValue] = useState(fact?.value ?? "");
  const [state, setState] = useState<CharacterFact['state']>(fact?.state ?? "draft");
  const [note, setNote] = useState(fact?.note ?? "");
  const [evidence, setEvidence] = useState<CharacterFactEvidence[]>(fact?.evidence ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true); setError("");
    try {
      await onSave({ slotKey, group, label, variantId, value, state, note, evidence });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存细项失败。");
    } finally {
      setSaving(false);
    }
  };
  const toggleEvidence = (assetId: string) => setEvidence((current) =>
    current.some((item) => item.assetId === assetId)
      ? current.filter((item) => item.assetId !== assetId)
      : [...current, { assetId }]);
  const staleEvidence = evidence.filter((item) => !assets.some((asset) => asset.id === item.assetId));

  return (
    <article className="fact-row">
      <div className="fact-row-main">
        <div className="fact-row-title"><strong>{label}</strong>{required && <span>此用途必需</span>}{visualEvidence && <span>需图片证据</span>}</div>
        <label>{label}描述
          <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={visualEvidence ? "例如：正面全身" : `填写${label}的已知设定`} disabled={state === "not_applicable"} />
        </label>
        <label>{label}状态
          <select value={state} onChange={(event) => setState(event.target.value as CharacterFact['state'])}>
            <option value="draft">待确认</option><option value="confirmed">已确认</option><option value="not_applicable">不适用</option>
          </select>
        </label>
      </div>
      <details className="fact-evidence">
        <summary>引用素材 {evidence.length} 张{evidence.some((item) => !assets.some((asset) => asset.id === item.assetId)) ? " · 有失效引用" : ""}</summary>
        {assets.length ? assets.map((asset) => {
          const item = evidence.find((source) => source.assetId === asset.id);
          return <div className="fact-evidence-item" key={asset.id}>
            <label className="fact-evidence-choice"><input type="checkbox" checked={Boolean(item)} onChange={() => toggleEvidence(asset.id)} />{asset.name}<small>{asset.confirmation === "confirmed" && ["original", "authorized"].includes(asset.rightsStatus) ? "可用" : "待确认/授权"}</small></label>
            {item && <label>图片中的局部说明<input aria-label={`${asset.name}局部说明`} value={item.regionNote ?? ""} onChange={(event) => setEvidence((current) => current.map((source) => source.assetId === asset.id ? { ...source, regionNote: event.target.value } : source))} placeholder="例如：右上角面部、背面发髻" /></label>}
            <button type="button" onClick={() => onOpenAsset(asset.id)}>查看素材</button>
          </div>;
        }) : <p>暂无角色素材。先去素材库导入并归入对应角色资产包。</p>}
        {staleEvidence.map((item) => <div className="fact-evidence-item" key={item.assetId}>
          <span>失效引用：{item.assetId}{item.regionNote ? ` · ${item.regionNote}` : ""}</span>
          <button type="button" aria-label={`移除失效引用 ${item.assetId}`} onClick={() => toggleEvidence(item.assetId)}>移除引用</button>
        </div>)}
        <label>补充说明<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：仅适用于本套造型" /></label>
      </details>
      <div className="fact-row-actions"><span>{fact?.state === "confirmed" ? "已确认" : fact?.state === "not_applicable" ? "不适用" : fact ? "草稿" : "未填写"}</span><button type="button" disabled={saving} onClick={() => void save()}>保存{label}</button></div>
      {error && <p className="fact-error" role="alert">{error}</p>}
    </article>
  );
}

type Props = {
  detail: CharacterDetail;
  selection: CharacterVariantSelection;
  onSelectionChange: (selection: CharacterVariantSelection) => void;
  onSaveFact: (input: CharacterFactInput) => Promise<void>;
  onCreateVariant: (kind: CharacterVariantKind, name: string) => Promise<void>;
  onOpenAsset: (id: string) => void;
  onOpenLibrary: () => void;
};

export function CharacterInspector({ detail, selection, onSelectionChange, onSaveFact, onCreateVariant, onOpenAsset, onOpenLibrary }: Props) {
  const [purpose, setPurpose] = useState<CharacterUseCase>("portrait");
  const [group, setGroup] = useState<CharacterSlotGroup>("identity");
  const [newVariantName, setNewVariantName] = useState("");
  const [newFactName, setNewFactName] = useState("");
  const [error, setError] = useState("");
  const [legacyNotice, setLegacyNotice] = useState("");
  const [importingLegacy, setImportingLegacy] = useState(false);
  const kind = VARIANT_BY_GROUP[group];
  const selectedVariantId = kind ? selection[kind] : undefined;
  const active = activeCharacterFacts(detail, selection);
  const coverage = evaluateCharacterCoverage(detail, purpose, selection);
  const groupedSlots = CHARACTER_SLOTS.filter((slot) => slot.group === group);
  const customSlots = [...new Map([...active, ...detail.facts.filter((fact) => selectedVariantId && fact.variantId === selectedVariantId)]
    .filter((fact) => fact.group === group && !CHARACTER_SLOTS.some((slot) => slot.key === fact.slotKey))
    .map((fact) => [fact.slotKey, fact])).values()];
  const groupMissing = coverage.missingRequiredKeys.filter((key) => groupedSlots.some((slot) => slot.key === key));
  const groupedFacts = [...groupedSlots.map((slot) => ({ key: slot.key, label: slot.label, visualEvidence: Boolean(slot.visualEvidence), required: slot.requiredFor.includes(purpose) })),
    ...customSlots.map((fact) => ({ key: fact.slotKey, label: fact.label, visualEvidence: false, required: false }))];
  const legacyRows = ([
    { field: "identityAnchor", label: "旧身份与五官", group: "identity", value: detail.card.identityAnchor },
    { field: "bodyAndWardrobe", label: "旧形体与衣着", group: "wardrobe", value: detail.card.bodyAndWardrobe },
    { field: "expressionAndPose", label: "旧表情与动作", group: "pose", value: detail.card.expressionAndPose },
    { field: "scene", label: "旧场景", group: "scene", value: detail.card.scene },
    { field: "mustKeep", label: "旧固定要求", group: "identity", value: detail.card.mustKeep ?? "" },
  ] satisfies { field: string; label: string; group: CharacterSlotGroup; value: string }[]).filter((row) => row.value?.trim());
  const pendingLegacy = legacyRows.filter((row) => !detail.facts.some((fact) => fact.group === row.group && fact.label === row.label));
  const importLegacy = async () => {
    setError(""); setImportingLegacy(true);
    try {
      for (const row of pendingLegacy) await onSaveFact({
        slotKey: `custom:${crypto.randomUUID()}`, group: row.group, label: row.label,
        value: row.value, state: "draft", evidence: [], note: "从历史卡导入，待核验",
      });
      setLegacyNotice(`已导入 ${pendingLegacy.length} 条待确认细项；请逐项核实后再用于创作。`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "导入历史设定失败。"); }
    finally { setImportingLegacy(false); }
  };

  const createVariant = async () => {
    if (!kind || !newVariantName.trim()) return;
    setError("");
    try { await onCreateVariant(kind, newVariantName.trim()); setNewVariantName(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "建立变体失败。"); }
  };
  const createFact = async () => {
    if (!newFactName.trim()) return;
    setError("");
    try {
      await onSaveFact({ slotKey: `custom:${crypto.randomUUID()}`, group, label: newFactName.trim(), variantId: kind ? selection[kind] : undefined, value: "", state: "draft", evidence: [] });
      setNewFactName("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "添加细项失败。"); }
  };

  return <section className="character-inspector" aria-label={`${detail.name}细项管理`}>
    <div className="inspector-heading"><div><p className="eyebrow">角色细项与素材证据</p><h3>{detail.name} · 完整度管理</h3><p>设定可由你手动确认；图片证据必须已审核并具备使用授权。草稿与失效引用不会进入创作提示词。</p></div><button onClick={onOpenLibrary}>去素材库</button></div>
    {legacyRows.length > 0 && <div className="character-legacy-card"><strong>历史卡设定尚未核验</strong><p>旧档案文字保存在这里，但不会自动进入新创作。先导入草稿，再将具体的脸型、衣着等逐项核实。</p>
      <ul>{legacyRows.map((row) => <li key={row.field}><span>{row.label}</span><p>{row.value}</p></li>)}</ul>
      {pendingLegacy.length > 0 && <button type="button" disabled={importingLegacy} onClick={() => void importLegacy()}>导入历史设定为草稿</button>}
      {legacyNotice && <p role="status">{legacyNotice}</p>}
    </div>}
    <div className="character-coverage">
      <label>检查用途<select value={purpose} onChange={(event) => setPurpose(event.target.value as CharacterUseCase)}>{PURPOSES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <div><strong>{coverage.confirmedRequiredCount} / {coverage.requiredCount}</strong><span>已确认必需项</span></div>
      <div><strong>{coverage.evidenceLinkedCount}</strong><span>有效素材引用</span></div>
      <div><strong>{coverage.status === "ready" ? "可用" : "待补齐"}</strong><span>仅对当前用途与变体</span></div>
    </div>
    <p className="coverage-next" role="status">{coverage.missingRequiredKeys.length ? `还缺 ${coverage.missingRequiredKeys.length} 个必需项：${coverage.missingRequiredKeys.slice(0, 5).map((key) => CHARACTER_SLOTS.find((slot) => slot.key === key)?.label).join("、")}${coverage.missingRequiredKeys.length > 5 ? "等" : ""}。` : "当前用途的必需项已确认。其他用途和造型请单独核对。"}</p>
    <div className="character-group-tabs" role="group" aria-label="细项分类">{CHARACTER_GROUPS.map((item) => <button key={item.key} type="button" className={group === item.key ? "selected" : ""} onClick={() => setGroup(item.key)}>{item.label}</button>)}</div>
    <div className="inspector-section-heading"><div><h4>{CHARACTER_GROUPS.find((item) => item.key === group)?.label}</h4><p>{CHARACTER_GROUPS.find((item) => item.key === group)?.description}</p>{groupMissing.length > 0 && <small>本用途此分类待补：{groupMissing.length} 项</small>}</div>
      {kind && <div className="variant-controls"><label>{VARIANT_LABELS[kind]}变体<select value={selection[kind] ?? ""} onChange={(event) => onSelectionChange({ ...selection, [kind]: event.target.value || undefined })}><option value="">基础配置</option>{detail.variants.filter((item) => item.kind === kind).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>新建{VARIANT_LABELS[kind]}<input value={newVariantName} onChange={(event) => setNewVariantName(event.target.value)} placeholder={`例如：${kind === "look" ? "冬季旅行" : "版本二"}`} /></label><button type="button" disabled={!newVariantName.trim()} onClick={() => void createVariant()}>新增变体</button></div>}
    </div>
    <div className="character-fact-list">{groupedFacts.map((slot) => {
      const fact = (selectedVariantId ? detail.facts.find((item) => item.slotKey === slot.key && item.variantId === selectedVariantId) : undefined) ?? active.find((item) => item.slotKey === slot.key);
      return <FactRow key={`${slot.key}-${selectedVariantId ?? "base"}-${fact?.id ?? "new"}-${fact?.updatedAt ?? ""}`} slotKey={slot.key} group={group} label={slot.label} visualEvidence={slot.visualEvidence} required={slot.required} fact={fact} variantId={selectedVariantId} assets={detail.evidenceAssets} onSave={onSaveFact} onOpenAsset={onOpenAsset} />;
    })}</div>
    <div className="custom-fact"><label>补充专属细项<input value={newFactName} onChange={(event) => setNewFactName(event.target.value)} placeholder="例如：左眼下小痣、某套造型的刺绣" /></label><button type="button" disabled={!newFactName.trim()} onClick={() => void createFact()}>添加到当前分类</button></div>
    {error && <p className="fact-error" role="alert">{error}</p>}
  </section>;
}
