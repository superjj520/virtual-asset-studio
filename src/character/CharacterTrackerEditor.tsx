import { useMemo, useState } from "react";
import type {
  CharacterStateTracker,
  CharacterTrackerValueKind,
  CharacterTrackerVisibility,
} from "../shared/types";

const UPDATE_RULES = [
  { id: "event", label: "事件发生时", value: "发生明确事件或结果变化时更新；没有新事件时保持不变。" },
  { id: "scene", label: "切换场景时", value: "进入新场景时更新；同一段连续场景中保持不变。" },
  { id: "interaction", label: "人物互动后", value: "根据人物互动、关系变化与共同经历更新。" },
  { id: "manual", label: "手动确认后", value: "只有用户明确修改并确认后才更新。" },
] as const;

const VALUE_KINDS: Array<{ id: CharacterTrackerValueKind; label: string }> = [
  { id: "text", label: "文字状态" },
  { id: "choice", label: "固定选项" },
  { id: "scale", label: "数值范围" },
];

type Props = {
  value: CharacterStateTracker[];
  onChange: (value: CharacterStateTracker[]) => void;
  title?: string;
  description?: string;
  allowAdd?: boolean;
  compact?: boolean;
};

function nextCustomTrackerId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `custom-${crypto.randomUUID()}`;
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
export function CharacterTrackerEditor({
  value,
  onChange,
  title = "自定义状态",
  description = "只在标准字段不够时添加",
  allowAdd = true,
  compact = false,
}: Props) {
  const [label, setLabel] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [valueKind, setValueKind] = useState<CharacterTrackerValueKind>("text");
  const [visibility, setVisibility] = useState<CharacterTrackerVisibility>("visible");
  const [ruleId, setRuleId] = useState<(typeof UPDATE_RULES)[number]["id"]>("event");
  const canAdd = label.trim().length > 0 && currentValue.trim().length > 0;
  const labelIds = useMemo(() => new Set(value.map((tracker) => tracker.label.trim().toLowerCase())), [value]);

  const update = (id: string, patch: Partial<CharacterStateTracker>) => {
    onChange(value.map((tracker) => tracker.id === id ? { ...tracker, ...patch } : tracker));
  };

  const add = () => {
    const normalizedLabel = label.trim();
    if (!canAdd || labelIds.has(normalizedLabel.toLowerCase())) return;
    const rule = UPDATE_RULES.find((item) => item.id === ruleId) ?? UPDATE_RULES[0];
    onChange([...value, {
      id: nextCustomTrackerId(),
      label: normalizedLabel,
      valueKind,
      value: currentValue.trim(),
      min: valueKind === "scale" ? 0 : undefined,
      max: valueKind === "scale" ? 100 : undefined,
      options: [],
      visibility,
      updateRule: rule.value,
    }]);
    setLabel("");
    setCurrentValue("");
    setValueKind("text");
    setVisibility("visible");
    setRuleId("event");
  };

  return <details className={`character-tracker-editor${compact ? " compact" : ""}`}>
    <summary><span><strong>{title}</strong><small>{description}</small></span><i aria-hidden="true">＋</i></summary>
    <div className="character-tracker-editor-body">
      {value.length > 0 && <div className="character-tracker-edit-list" aria-label="可编辑持续状态">
        {value.map((tracker) => <article key={tracker.id} className="character-tracker-edit-row">
          <header><strong>{tracker.label}</strong><button type="button" onClick={() => onChange(value.filter((item) => item.id !== tracker.id))}>移除</button></header>
          <div className="character-tracker-edit-fields">
            <label>字段名称<input aria-label={`${tracker.label}字段名称`} value={tracker.label} onChange={(event) => update(tracker.id, { label: event.target.value })} /></label>
            <label>当前值<input aria-label={`${tracker.label}当前值`} value={tracker.value} onChange={(event) => update(tracker.id, { value: event.target.value })} /></label>
            <label>可见性<select aria-label={`${tracker.label}可见性`} value={tracker.visibility} onChange={(event) => update(tracker.id, { visibility: event.target.value as CharacterTrackerVisibility })}><option value="visible">用户可见</option><option value="internal">内部状态</option></select></label>
            <label>更新规则<select aria-label={`${tracker.label}更新规则`} value={UPDATE_RULES.find((rule) => rule.value === tracker.updateRule)?.id ?? "event"} onChange={(event) => update(tracker.id, { updateRule: UPDATE_RULES.find((rule) => rule.id === event.target.value)?.value ?? UPDATE_RULES[0].value })}>{UPDATE_RULES.map((rule) => <option key={rule.id} value={rule.id}>{rule.label}</option>)}</select></label>
          </div>
        </article>)}
      </div>}
      {allowAdd && <section className="character-tracker-add" aria-label="添加持续状态字段">
        <div className="character-tracker-add-fields">
          <label>字段名称<input aria-label="新状态字段名称" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如：体力" /></label>
          <label>初始值<input aria-label="新状态字段初始值" value={currentValue} onChange={(event) => setCurrentValue(event.target.value)} placeholder="例如：充沛" /></label>
          <label>记录方式<select aria-label="新状态字段记录方式" value={valueKind} onChange={(event) => setValueKind(event.target.value as CharacterTrackerValueKind)}>{VALUE_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}</select></label>
          <label>可见性<select aria-label="新状态字段可见性" value={visibility} onChange={(event) => setVisibility(event.target.value as CharacterTrackerVisibility)}><option value="visible">用户可见</option><option value="internal">内部状态</option></select></label>
          <label>更新规则<select aria-label="新状态字段更新规则" value={ruleId} onChange={(event) => setRuleId(event.target.value as (typeof UPDATE_RULES)[number]["id"])}>{UPDATE_RULES.map((rule) => <option key={rule.id} value={rule.id}>{rule.label}</option>)}</select></label>
        </div>
        <button type="button" className="primary-button" disabled={!canAdd || labelIds.has(label.trim().toLowerCase())} onClick={add}>添加状态字段</button>
      </section>}
    </div>
  </details>;
}
