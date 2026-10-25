import { useEffect, useState } from "react";
import {
  activeCharacterFacts, CHARACTER_GROUPS, CHARACTER_SLOTS,
  characterFactIsUsable, evaluateCharacterCoverage, type CharacterSlotGroup, type CharacterUseCase,
  type CharacterVariantSelection,
} from "../shared/character-slots";
import type {
  Asset, CharacterDetail, CharacterFact, CharacterFactEvidence,
  CharacterFactInput, CharacterVariantKind,
} from "../shared/types";
import { choicesForCharacterFact } from "./character-fact-choices";

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

function EvidenceAssetChoice({ asset, selected, onToggle, onOpen }: {
  asset: Asset;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    let active = true;
    if (!asset.mediaType?.startsWith("image/") || !window.studio?.assets?.preview) return;
    const request = window.studio.assets.preview(asset.id);
    if (!request || typeof request.then !== "function") return;
    request
      .then((source) => { if (active) setPreview(source); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [asset.id, asset.mediaType]);

  const usable = asset.confirmation === "confirmed" && ["original", "authorized"].includes(asset.rightsStatus);
  return <div className={selected ? "fact-visual-card selected" : "fact-visual-card"}>
    <button type="button" className="fact-visual-choice" aria-pressed={selected} aria-label={`${asset.name}${selected ? "，已选择" : ""}`} onClick={onToggle}>
      <span className="fact-visual-preview">{preview ? <img src={preview} alt="" /> : <span aria-hidden="true">图片</span>}</span>
      <span className="fact-visual-copy"><strong>{asset.name}</strong><small>{usable ? "可用于角色设定" : "待确认使用权"}</small></span>
      <span className="fact-visual-check" aria-hidden="true">{selected ? "✓" : "+"}</span>
    </button>
    <button type="button" className="fact-visual-open" onClick={onOpen} aria-label={`查看${asset.name}`}>查看</button>
  </div>;
}

function FactRow({ slotKey, group, label, visualEvidence, fact, variantId, assets, required, onSave, onOpenAsset }: FactRowProps) {
  const [value, setValue] = useState(fact?.value ?? "");
  const [state, setState] = useState<CharacterFact["state"]>(fact?.state ?? "draft");
  const [note, setNote] = useState(fact?.note ?? "");
  const [evidence, setEvidence] = useState<CharacterFactEvidence[]>(fact?.evidence ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const options = choicesForCharacterFact(slotKey);
  const imageAssets = assets.filter((asset) => asset.mediaType?.startsWith("image/"));
  const selectionFirst = visualEvidence || options.length > 0;

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
  const toggleEvidence = (assetId: string) => setEvidence((current) => {
    const exists = current.some((item) => item.assetId === assetId);
    const next = exists ? current.filter((item) => item.assetId !== assetId) : [...current, { assetId }];
    if (!exists) {
      const asset = assets.find((item) => item.id === assetId);
      if (!value.trim() && asset) setValue(asset.name);
      setState("confirmed");
    }
    return next;
  });
  const staleEvidence = evidence.filter((item) => !assets.some((asset) => asset.id === item.assetId));
  const disabled = saving || (state !== "not_applicable" && !value.trim() && evidence.length === 0);

  return <article className="fact-row">
    <div className="fact-row-heading">
      <div className="fact-row-title"><strong>{label}</strong>{required && <span>必需</span>}{visualEvidence && <span>图片证据</span>}</div>
      <span className={`fact-state fact-state-${state}`}>{state === "confirmed" ? "已确认" : state === "not_applicable" ? "不适用" : fact ? "待确认" : "未设置"}</span>
    </div>
    {options.length > 0 && <div className="fact-choice-grid" role="radiogroup" aria-label={`${label}常用选项`}>
      {options.map((option) => <button key={option.id} type="button" role="radio" aria-checked={value === option.value} aria-label={option.label}
        className={value === option.value ? "fact-choice selected" : "fact-choice"}
        onClick={() => { setValue(option.value); setState("confirmed"); }}>
        <span>{option.label}</span>{value === option.value && <span aria-hidden="true">✓</span>}
      </button>)}
    </div>}
    {visualEvidence && <div className="fact-visual-evidence">
      <div className="fact-visual-label"><strong>看图选择素材证据</strong><span>所选图片会直接绑定到该人物细项</span></div>
      {imageAssets.length > 0 ? <div className="fact-visual-grid">{imageAssets.map((asset) => <EvidenceAssetChoice key={asset.id} asset={asset}
        selected={evidence.some((item) => item.assetId === asset.id)} onToggle={() => toggleEvidence(asset.id)} onOpen={() => onOpenAsset(asset.id)} />)}</div>
        : <div className="fact-empty-evidence"><span>还没有图片素材</span><button type="button" onClick={() => onOpenAsset("")}>去素材库添加</button></div>}
    </div>}
    <details className="fact-advanced">
      <summary>{selectionFirst ? "自定义或补充说明" : "编辑设定"}</summary>
      <div className="fact-row-main">
        <label>{label}描述<input value={value} onChange={(event) => setValue(event.target.value)} placeholder={visualEvidence ? "可补充图片中的识别部位" : `填写${label}的专属设定`} disabled={state === "not_applicable"} /></label>
        <label>{label}状态<select value={state} onChange={(event) => setState(event.target.value as CharacterFact["state"])}><option value="draft">待确认</option><option value="confirmed">已确认</option><option value="not_applicable">不适用</option></select></label>
        <label>补充说明<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：仅适用于本套造型" /></label>
      </div>
      {(evidence.length > 0 || staleEvidence.length > 0) && <div className="fact-evidence-details">
        {evidence.map((item) => {
          const asset = assets.find((source) => source.id === item.assetId);
          if (!asset) return null;
          return <label key={item.assetId}>{asset.name}局部说明<input aria-label={`${asset.name}局部说明`} value={item.regionNote ?? ""}
            onChange={(event) => setEvidence((current) => current.map((source) => source.assetId === item.assetId ? { ...source, regionNote: event.target.value } : source))} placeholder="例如：右上角面部、背面发髻" /></label>;
        })}
        {staleEvidence.map((item) => <div className="fact-stale-evidence" key={item.assetId}>
          <span>引用已失效：{item.assetId}{item.regionNote ? ` · ${item.regionNote}` : ""}</span>
          <button type="button" aria-label={`移除失效引用 ${item.assetId}`} onClick={() => toggleEvidence(item.assetId)}>移除引用</button>
        </div>)}
      </div>}
    </details>
    <div className="fact-row-actions"><span>{state === "confirmed" ? "会进入角色设定" : state === "not_applicable" ? "已标记不适用" : "不会进入正式创作"}</span><button type="button" disabled={disabled} onClick={() => void save()}>{selectionFirst ? "确认" : "保存"}{label}</button></div>
    {error && <p className="fact-error" role="alert">{error}</p>}
  </article>;
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
  const groupSummaries = CHARACTER_GROUPS.map((item) => {
    const slots = CHARACTER_SLOTS.filter((slot) => slot.group === item.key);
    const confirmed = slots.filter((slot) => {
      const fact = active.find((candidate) => candidate.slotKey === slot.key);
      return fact ? characterFactIsUsable(fact, detail) : false;
    }).length;
    const requiredMissing = coverage.missingRequiredKeys.filter((key) => slots.some((slot) => slot.key === key)).length;
    return { ...item, total: slots.length, confirmed, requiredMissing };
  });
  const importLegacy = async () => {
    setError(""); setImportingLegacy(true);
    try {
      for (const row of pendingLegacy) await onSaveFact({ slotKey: `custom:${crypto.randomUUID()}`, group: row.group, label: row.label, value: row.value, state: "draft", evidence: [], note: "从历史卡导入，待核验" });
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
    <div className="inspector-heading"><div><p className="eyebrow">角色设定</p><h3>{detail.name} · 素材完整度</h3><p>先选答案，再用图片锁定细节。</p></div><button onClick={onOpenLibrary}>管理素材</button></div>
    {legacyRows.length > 0 && <details className="character-legacy-card"><summary>历史文字设定 · 待核验</summary><p>导入后仍需逐项确认，不会直接进入正式创作。</p><ul>{legacyRows.map((row) => <li key={row.field}><span>{row.label}</span><p>{row.value}</p></li>)}</ul>{pendingLegacy.length > 0 && <button type="button" disabled={importingLegacy} onClick={() => void importLegacy()}>导入为草稿</button>}{legacyNotice && <p role="status">{legacyNotice}</p>}</details>}
    <div className="character-coverage">
      <div className="purpose-switch" role="radiogroup" aria-label="检查用途">{PURPOSES.map((item) => <button type="button" role="radio" aria-checked={purpose === item.id} className={purpose === item.id ? "selected" : ""} key={item.id} onClick={() => setPurpose(item.id)}>{item.label}</button>)}</div>
      <div><strong>{coverage.confirmedRequiredCount} / {coverage.requiredCount}</strong><span>必需项</span></div><div><strong>{coverage.evidenceLinkedCount}</strong><span>素材证据</span></div><div><strong>{coverage.status === "ready" ? "可创作" : "待补齐"}</strong><span>当前用途</span></div>
    </div>
    <p className="coverage-next" role="status">{coverage.missingRequiredKeys.length ? `还缺 ${coverage.missingRequiredKeys.length} 个必需项：${coverage.missingRequiredKeys.slice(0, 5).map((key) => CHARACTER_SLOTS.find((slot) => slot.key === key)?.label).join("、")}${coverage.missingRequiredKeys.length > 5 ? "等" : ""}。` : "当前用途的必需项已确认。"}</p>
    <div className="character-completeness-map">
      <div className="character-map-heading"><div><h4>角色完整度地图</h4><p>按模块补齐；有缺口的模块优先处理。</p></div><span>{active.filter((fact) => characterFactIsUsable(fact, detail)).length} 项已确认</span></div>
      <div className="character-group-map" role="group" aria-label="角色细项分类">{groupSummaries.map((item) => {
        const progress = item.total ? Math.round((item.confirmed / item.total) * 100) : 0;
        return <button key={item.key} type="button" aria-label={item.label} aria-pressed={group === item.key} className={group === item.key ? "character-group-card selected" : "character-group-card"} onClick={() => setGroup(item.key)}><span className="character-group-card-head"><strong>{item.label}</strong><small>{item.confirmed}/{item.total}</small></span><span className="character-group-progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></span><span className={item.requiredMissing > 0 ? "character-group-status missing" : "character-group-status"}>{item.requiredMissing > 0 ? `${item.requiredMissing} 个必需项待补` : item.confirmed > 0 ? "已有可用设定" : "尚未开始"}</span></button>;
      })}</div>
    </div>
    <div className="inspector-section-heading"><div><h4>{CHARACTER_GROUPS.find((item) => item.key === group)?.label}</h4><p>{CHARACTER_GROUPS.find((item) => item.key === group)?.description}</p>{groupMissing.length > 0 && <small>当前用途待补 {groupMissing.length} 项</small>}</div>
      {kind && <details className="variant-controls"><summary>管理{VARIANT_LABELS[kind]}版本</summary><label>{VARIANT_LABELS[kind]}变体<select value={selection[kind] ?? ""} onChange={(event) => onSelectionChange({ ...selection, [kind]: event.target.value || undefined })}><option value="">基础配置</option>{detail.variants.filter((item) => item.kind === kind).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>新建{VARIANT_LABELS[kind]}<input value={newVariantName} onChange={(event) => setNewVariantName(event.target.value)} placeholder={`例如：${kind === "look" ? "冬季旅行" : "版本二"}`} /></label><button type="button" disabled={!newVariantName.trim()} onClick={() => void createVariant()}>新增变体</button></details>}
    </div>
    <div className="character-fact-list">{groupedFacts.map((slot) => {
      const fact = (selectedVariantId ? detail.facts.find((item) => item.slotKey === slot.key && item.variantId === selectedVariantId) : undefined) ?? active.find((item) => item.slotKey === slot.key);
      return <FactRow key={`${slot.key}-${selectedVariantId ?? "base"}-${fact?.id ?? "new"}-${fact?.updatedAt ?? ""}`} slotKey={slot.key} group={group} label={slot.label} visualEvidence={slot.visualEvidence} required={slot.required} fact={fact} variantId={selectedVariantId} assets={detail.evidenceAssets} onSave={onSaveFact} onOpenAsset={onOpenAsset} />;
    })}</div>
    <details className="custom-fact"><summary>添加专属细项</summary><label>细项名称<input value={newFactName} onChange={(event) => setNewFactName(event.target.value)} placeholder="例如：左眼下小痣、衣服专属刺绣" /></label><button type="button" disabled={!newFactName.trim()} onClick={() => void createFact()}>添加</button></details>
    {error && <p className="fact-error" role="alert">{error}</p>}
  </section>;
}
