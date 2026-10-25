import { useEffect, useState } from "react";
import type {
  CharacterExtensionKind,
  CharacterStateTracker,
  CharacterStateKind,
  CharacterVersionStatus,
  CharacterWorkspaceSnapshot,
} from "../shared/types";
import { CHARACTER_EXTENSION_OPTIONS } from "./character-extensions";
import portraitArtwork from "../assets/character-creator/oriental-moon-v2.webp";
import expressionArtwork from "../assets/character-creator/face-reference-board-v1.webp";
import poseArtwork from "../assets/character-creator/body-reference-board-v1.webp";
import wardrobeArtwork from "../assets/character-creator/wardrobe-reference-board-v1.webp";
import storyArtwork from "../assets/character-creator/rain-noir-v2.webp";
import seriesArtwork from "../assets/character-creator/natural-day-v2.webp";
import dialogueArtwork from "../assets/character-creator/city-couture-v2.webp";
import dynamicArtwork from "../assets/character-creator/crystal-fantasy-v2.webp";
import {
  CHARACTER_TRACKER_PRESETS,
  DEFAULT_CHARACTER_TRACKER_IDS,
  buildCharacterStateTrackersFromValues,
  type CharacterTrackerPresetId,
} from "../creation/character-tracker-presets";
import { CharacterTrackerEditor } from "./CharacterTrackerEditor";

type Props = {
  snapshot: CharacterWorkspaceSnapshot;
  onChanged: (snapshot: CharacterWorkspaceSnapshot) => void;
  onStartCreation: (input: { kind: CharacterExtensionKind; versionId?: string; stateId?: string }) => void;
};

const VERSION_STATUS = {
  draft: "草稿",
  locked: "当前锁定",
  superseded: "历史版本",
} as const;
const STATE_KIND = {
  baseline: "基础状态",
  scene: "场景状态",
  performance: "演出状态",
} as const;

const LIFECYCLE_LABEL = {
  draft: "设定中",
  confirmed: "身份已确认",
  archived: "已归档",
} as const;

const EXTENSION_ARTWORK: Record<CharacterExtensionKind, string> = {
  portrait: portraitArtwork,
  expression_set: expressionArtwork,
  pose_set: poseArtwork,
  wardrobe_set: wardrobeArtwork,
  story_scene: storyArtwork,
  series_pack: seriesArtwork,
  dialogue_scene: dialogueArtwork,
  dynamic_keyframe: dynamicArtwork,
};

const EXTENSION_GROUPS: Array<{
  label: string;
  hint: string;
  kinds: CharacterExtensionKind[];
}> = [
  {
    label: "角色资产",
    hint: "完善同一角色的标准外观与表演素材",
    kinds: ["portrait", "expression_set", "pose_set", "wardrobe_set"],
  },
  {
    label: "故事与演出",
    hint: "让角色进入场景、关系、连续镜头和动态内容",
    kinds: ["story_scene", "series_pack", "dialogue_scene", "dynamic_keyframe"],
  },
];

type StateChoice = {
  id: string;
  label: string;
  description?: string;
};

const STATE_PURPOSES: Array<StateChoice & { kind: CharacterStateKind }> = [
  { id: "baseline", label: "基础定妆", description: "角色标准外观", kind: "baseline" },
  { id: "daily", label: "日常生活", description: "稳定的生活状态", kind: "scene" },
  { id: "work", label: "工作状态", description: "职业与正式场合", kind: "scene" },
  { id: "story", label: "剧情状态", description: "明确场景与情绪", kind: "scene" },
  { id: "dialogue", label: "对话演出", description: "关系与交流", kind: "performance" },
  { id: "action", label: "动作状态", description: "运动与瞬间", kind: "performance" },
];

const STATE_CHOICES = {
  wardrobe: [
    { id: "keep", label: "沿用主造型" },
    { id: "daily", label: "日常便装" },
    { id: "work", label: "专业工作装" },
    { id: "couture", label: "高定礼服" },
    { id: "action", label: "行动造型" },
  ],
  hair: [
    { id: "keep", label: "沿用基线" },
    { id: "updo", label: "整洁盘发" },
    { id: "down", label: "自然披发" },
    { id: "ponytail", label: "利落马尾" },
    { id: "motion", label: "微乱动态" },
  ],
  expression: [
    { id: "calm", label: "平静" },
    { id: "smile", label: "微笑" },
    { id: "cool", label: "清冷" },
    { id: "tense", label: "紧张" },
    { id: "firm", label: "坚定" },
  ],
  pose: [
    { id: "natural", label: "自然站姿" },
    { id: "confident", label: "自信站姿" },
    { id: "turn", label: "回身" },
    { id: "lean", label: "倚靠" },
    { id: "action", label: "动作瞬间" },
  ],
  scene: [
    { id: "keep", label: "沿用原场景" },
    { id: "home", label: "日常室内" },
    { id: "work", label: "工作空间" },
    { id: "night", label: "夜景街头" },
    { id: "courtyard", label: "东方庭院" },
    { id: "fantasy", label: "幻想空间" },
  ],
  emotion: [
    { id: "restrained", label: "克制" },
    { id: "gentle", label: "温柔" },
    { id: "tension", label: "张力" },
    { id: "mystery", label: "神秘" },
    { id: "bright", label: "明快" },
  ],
} satisfies Record<string, StateChoice[]>;

const CONTINUITY_CHOICES: StateChoice[] = [
  { id: "face", label: "锁定脸部" },
  { id: "hair", label: "锁定发型" },
  { id: "body", label: "锁定身材" },
  { id: "wardrobe", label: "锁定服装" },
  { id: "time", label: "锁定时间" },
  { id: "lighting", label: "锁定光线" },
];

function StateChoiceGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: StateChoice[];
  value: string;
  onChange: (value: string) => void;
}) {
  return <section className="state-choice-group" aria-label={label}>
    <header><strong>{label}</strong><span>单选</span></header>
    <div className="state-choice-grid" role="radiogroup" aria-label={label}>
      {options.map((option) => <button
        key={option.id}
        type="button"
        role="radio"
        aria-label={option.label}
        aria-checked={value === option.id}
        className={value === option.id ? "selected" : ""}
        onClick={() => onChange(option.id)}
      >
        <strong>{option.label}</strong>
        {option.description && <small>{option.description}</small>}
        <i aria-hidden="true">{value === option.id ? "✓" : ""}</i>
      </button>)}
    </div>
  </section>;
}

function stateChoiceLabel(options: StateChoice[], id: string) {
  return options.find((item) => item.id === id)?.label ?? "";
}

export function CharacterWorkspacePanel({ snapshot, onChanged, onStartCreation }: Props) {
  const currentVersion = snapshot.activeVersion ?? snapshot.versions[0];
  const [tab, setTab] = useState<"extend" | "versions" | "states" | "media">("extend");
  const [extensionKind, setExtensionKind] = useState<CharacterExtensionKind>("portrait");
  const [versionSummary, setVersionSummary] = useState("");
  const [statePurpose, setStatePurpose] = useState("baseline");
  const [stateSelections, setStateSelections] = useState({
    wardrobe: "keep", hair: "keep", expression: "calm", pose: "natural", scene: "keep", emotion: "restrained",
  });
  const [continuitySelections, setContinuitySelections] = useState(["face", "body"]);
  const [trackerIds, setTrackerIds] = useState<CharacterTrackerPresetId[]>(DEFAULT_CHARACTER_TRACKER_IDS);
  const [customTrackers, setCustomTrackers] = useState<CharacterStateTracker[]>([]);
  const [editingStateId, setEditingStateId] = useState("");
  const [editingTrackers, setEditingTrackers] = useState<CharacterStateTracker[]>([]);
  const [customContinuityNote, setCustomContinuityNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [masterPreview, setMasterPreview] = useState("");
  const selectedExtension = CHARACTER_EXTENSION_OPTIONS.find((item) => item.id === extensionKind)!;
  const selectedPurpose = STATE_PURPOSES.find((item) => item.id === statePurpose) ?? STATE_PURPOSES[0];
  const selectedSceneLabel = stateChoiceLabel(STATE_CHOICES.scene, stateSelections.scene);
  const posterIdentitySummary = ["identity.persona", "identity.age", "identity.gender"]
    .map((slotKey) => snapshot.character.facts.find((fact) => fact.slotKey === slotKey && fact.state === "confirmed")?.value.trim())
    .filter(Boolean)
    .join(" · ");
  const rawPosterFallback = snapshot.character.card.subject.trim() || "角色身份待补充";
  const posterSummary = posterIdentitySummary || (rawPosterFallback.length > 36 ? `${rawPosterFallback.slice(0, 36)}…` : rawPosterFallback);
  const generatedStateName = stateSelections.scene === "keep"
    ? selectedPurpose.label
    : `${selectedPurpose.label} · ${selectedSceneLabel}`;
  const stateTrackers = buildCharacterStateTrackersFromValues(trackerIds, {
    wardrobe: stateChoiceLabel(STATE_CHOICES.wardrobe, stateSelections.wardrobe),
    location: selectedSceneLabel,
    mood: stateChoiceLabel(STATE_CHOICES.emotion, stateSelections.emotion),
  });
  const allStateTrackers = [...stateTrackers, ...customTrackers];

  useEffect(() => {
    let cancelled = false;
    const assetId = snapshot.character.masterAssetId;
    const preview = window.studio?.assets?.preview;
    if (!assetId || !preview) {
      setMasterPreview("");
      return () => { cancelled = true; };
    }
    Promise.resolve(preview(assetId))
      .then((value) => { if (!cancelled) setMasterPreview(value ?? ""); })
      .catch(() => { if (!cancelled) setMasterPreview(""); });
    return () => { cancelled = true; };
  }, [snapshot.character.masterAssetId]);

  const reload = async () => onChanged(await window.studio.characterWorkspace.get(snapshot.character.id));
  const createVersion = async (status: CharacterVersionStatus) => {
    setBusy(true); setError("");
    try {
      await window.studio.characterWorkspace.createVersion(snapshot.character.id, {
        label: undefined,
        status,
        changeSummary: versionSummary.trim(),
      });
      setVersionSummary("");
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存角色版本失败。");
    } finally { setBusy(false); }
  };
  const createState = async () => {
    setBusy(true); setError("");
    try {
      await window.studio.characterWorkspace.createState(snapshot.character.id, {
        versionId: currentVersion?.id,
        name: generatedStateName,
        kind: selectedPurpose.kind,
        status: "active",
        wardrobe: stateChoiceLabel(STATE_CHOICES.wardrobe, stateSelections.wardrobe),
        hair: stateChoiceLabel(STATE_CHOICES.hair, stateSelections.hair),
        expression: stateChoiceLabel(STATE_CHOICES.expression, stateSelections.expression),
        pose: stateChoiceLabel(STATE_CHOICES.pose, stateSelections.pose),
        scene: selectedSceneLabel,
        emotion: stateChoiceLabel(STATE_CHOICES.emotion, stateSelections.emotion),
        continuityNotes: [
          ...continuitySelections.map((id) => stateChoiceLabel(CONTINUITY_CHOICES, id)),
          customContinuityNote.trim(),
        ].filter(Boolean).join("；"),
        trackers: allStateTrackers,
      });
      setCustomContinuityNote("");
      setCustomTrackers([]);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存角色状态失败。");
    } finally { setBusy(false); }
  };
  const activateState = async (id: string) => {
    setBusy(true); setError("");
    try {
      await window.studio.characterWorkspace.updateState(id, { status: "active" });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "切换角色状态失败。");
    } finally { setBusy(false); }
  };
  const openStateTrackerEditor = (stateId: string, trackers: CharacterStateTracker[] | undefined) => {
    setEditingStateId(stateId);
    setEditingTrackers((trackers ?? []).map((tracker) => ({ ...tracker, options: [...tracker.options] })));
  };
  const saveStateTrackers = async () => {
    if (!editingStateId) return;
    setBusy(true); setError("");
    try {
      await window.studio.characterWorkspace.updateState(editingStateId, { trackers: editingTrackers });
      setEditingStateId("");
      setEditingTrackers([]);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新持续状态失败。");
    } finally { setBusy(false); }
  };

  return <section className="character-runtime-panel" aria-label={`${snapshot.character.name}角色工作室`}>
    <header className="character-runtime-hero">
      <div className={masterPreview ? "character-runtime-poster has-image" : "character-runtime-poster"}>
        {masterPreview
          ? <img src={masterPreview} alt={`${snapshot.character.name}主参考图`} />
          : <div className="character-runtime-poster-empty" aria-label="尚未绑定主参考图"><b>{snapshot.character.name.slice(0, 1)}</b><span>尚未绑定主参考图</span></div>}
        <div className="character-runtime-poster-copy">
          <span>{LIFECYCLE_LABEL[snapshot.character.lifecycle]}</span>
          <strong>{snapshot.character.name}</strong>
          <small>{posterSummary}</small>
        </div>
      </div>
      <div className="character-runtime-overview">
        <div className="character-runtime-header">
          <div>
            <p className="eyebrow">角色资产中枢</p>
            <h3>{snapshot.character.name}</h3>
            <p>{snapshot.character.card.identityAnchor || "角色固定后，所有创作都会沿用同一身份。"}</p>
          </div>
          <div className="character-runtime-current">
            <span>{currentVersion ? `V${currentVersion.versionNumber}` : "当前档案"}</span>
            <i aria-hidden="true">·</i>
            <strong>{snapshot.activeState?.name ?? "基础状态"}</strong>
          </div>
        </div>
        <div className="character-runtime-summary">
          <div><strong>{currentVersion ? `V${currentVersion.versionNumber}` : "未建立"}</strong><span>当前版本</span></div>
          <div><strong>{snapshot.activeState?.name ?? "基础设定"}</strong><span>当前状态</span></div>
          <div><strong>{snapshot.media.length}</strong><span>衍生素材</span></div>
          <div><strong>{snapshot.sessions.length}</strong><span>创作会话</span></div>
        </div>
        <div className="character-runtime-tabs" role="tablist" aria-label="角色工作室模块">
          <button type="button" role="tab" aria-selected={tab === "extend"} className={tab === "extend" ? "selected" : ""} onClick={() => setTab("extend")}>继续创作</button>
          <button type="button" role="tab" aria-selected={tab === "versions"} className={tab === "versions" ? "selected" : ""} onClick={() => setTab("versions")}>版本</button>
          <button type="button" role="tab" aria-selected={tab === "states"} className={tab === "states" ? "selected" : ""} onClick={() => setTab("states")}>状态</button>
          <button type="button" role="tab" aria-selected={tab === "media"} className={tab === "media" ? "selected" : ""} onClick={() => setTab("media")}>历史</button>
        </div>
      </div>
    </header>
    {tab === "extend" && <div className="character-extension-workspace">
      <div className="character-extension-heading">
        <div><span>继续延展</span><h4>选择下一种角色资产</h4></div>
        <p>只选结果类型，角色、版本、状态和参考素材自动带入。</p>
      </div>
      <div className="character-extension-groups" role="radiogroup" aria-label="角色衍生类型">
        {EXTENSION_GROUPS.map((group) => <section key={group.label} className="character-extension-group" aria-label={group.label}>
          <header><strong>{group.label}</strong><span>{group.hint}</span></header>
          <div className="character-extension-grid">
            {group.kinds.map((kind) => {
              const option = CHARACTER_EXTENSION_OPTIONS.find((item) => item.id === kind)!;
              return <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={extensionKind === option.id}
                className={extensionKind === option.id ? "character-extension-card selected" : "character-extension-card"}
                onClick={() => setExtensionKind(option.id)}
              >
                <img src={EXTENSION_ARTWORK[option.id]} alt="" />
                <span className="character-extension-card-shade" aria-hidden="true" />
                <span className="character-extension-card-copy">
                  <small>{option.result}</small>
                  <strong>{option.label}</strong>
                  <em>{option.description}</em>
                </span>
                <i aria-hidden="true">{extensionKind === option.id ? "✓" : "→"}</i>
              </button>;
            })}
          </div>
        </section>)}
      </div>
      <footer className="character-extension-footer">
        <div><span>将创建</span><strong>{selectedExtension.result}</strong><small>沿用 {snapshot.character.name} · {snapshot.activeState?.name ?? "基础状态"}</small></div>
        <button className="primary-button" type="button" onClick={() => onStartCreation({
          kind: extensionKind,
          versionId: currentVersion?.id,
          stateId: snapshot.activeState?.id,
        })}>进入{selectedExtension.label}工作台</button>
      </footer>
    </div>}
    {tab === "versions" && <div className="character-runtime-grid">
      <div className="character-runtime-list">
        {snapshot.versions.map((version) => <article key={version.id} className={version.status === "locked" ? "runtime-item runtime-current" : "runtime-item"}>
          <div><strong>V{version.versionNumber} · {version.label}</strong><span>{VERSION_STATUS[version.status]}</span></div>
          <p>{version.changeSummary || "未填写调整说明"}</p>
          <small>{new Date(version.createdAt).toLocaleString("zh-CN")}</small>
        </article>)}
        {!snapshot.versions.length && <div className="empty-state compact-empty"><strong>还没有角色版本</strong><p>保存一次快照，后续图片和视频才能回溯到明确角色。</p></div>}
      </div>
      <div className="runtime-editor version-snapshot-editor">
        <div className="version-snapshot-preview">
          <span>将保存</span>
          <strong>{snapshot.character.name} · V{(currentVersion?.versionNumber ?? 0) + 1}</strong>
          <p>自动记录当前角色设定、主参考、细节事实和造型约束。</p>
        </div>
        <div className="form-actions version-snapshot-actions">
          <button className="primary-button" type="button" disabled={busy} onClick={() => void createVersion("draft")}>保存当前版本</button>
          <button type="button" disabled={busy || snapshot.character.lifecycle !== "confirmed"} onClick={() => void createVersion("locked")}>锁定为生产版本</button>
        </div>
        <details className="runtime-optional-details">
          <summary>补充变化说明（可选）</summary>
          <label>版本补充说明<textarea aria-label="版本补充说明" value={versionSummary} onChange={(event) => setVersionSummary(event.target.value)} placeholder="只在需要时记录与上一版的差异" /></label>
        </details>
        {snapshot.character.lifecycle !== "confirmed" && <p className="result-note">角色完成主参考和必需细项后，才能锁定生产版本。</p>}
      </div>
    </div>}
    {tab === "states" && <div className="character-state-workspace">
      <aside className="character-runtime-list state-history-list">
        <header className="state-history-heading"><span>已保存状态</span><strong>{snapshot.states.length}</strong></header>
        {snapshot.states.map((state) => <article key={state.id} className={state.status === "active" ? "runtime-item runtime-current" : "runtime-item"}>
          <div><strong>{state.name}</strong><span>{state.status === "active" ? "正在使用" : state.status === "archived" ? "已归档" : "备用"}</span></div>
          <p>{[STATE_KIND[state.kind], state.wardrobe, state.pose, state.scene, state.emotion].filter(Boolean).join(" · ")}</p>
          {!!state.trackers?.length && <div className="runtime-tracker-chips" aria-label={`${state.name}持续状态`}>
            {state.trackers.map((tracker) => <span key={tracker.id}><b>{tracker.label}</b>{tracker.value}</span>)}
          </div>}
          <div className="state-history-actions">
            <button type="button" disabled={busy} onClick={() => openStateTrackerEditor(state.id, state.trackers)}>编辑状态字段</button>
            {state.status !== "active" && <button type="button" disabled={busy} onClick={() => void activateState(state.id)}>设为当前状态</button>}
          </div>
        </article>)}
        {!snapshot.states.length && <div className="empty-state compact-empty"><strong>还没有场景状态</strong><p>选择服装、动作和场景后保存，不会改写角色身份。</p></div>}
      </aside>
      {editingStateId ? <div className="character-state-composer tracker-field-editor">
        <header className="state-composer-heading">
          <div><span>持续状态编辑</span><h4>{snapshot.states.find((state) => state.id === editingStateId)?.name ?? "角色状态"}</h4></div>
          <div><small>字段数量</small><strong>{editingTrackers.length}</strong></div>
        </header>
        <CharacterTrackerEditor
          value={editingTrackers}
          onChange={setEditingTrackers}
          title="编辑字段与更新规则"
          description="修改当前值、可见性或变化方式，也可添加新字段"
        />
        <footer className="state-composer-summary">
          <div><span>将更新</span><strong>{editingTrackers.length} 个持续状态字段</strong><small>只修改这一条角色状态，不改变角色身份。</small></div>
          <div className="state-editor-actions">
            <button type="button" disabled={busy} onClick={() => { setEditingStateId(""); setEditingTrackers([]); }}>取消</button>
            <button className="primary-button" type="button" disabled={busy} onClick={() => void saveStateTrackers()}>保存字段</button>
          </div>
        </footer>
      </div> : <div className="character-state-composer">
        <header className="state-composer-heading">
          <div><span>角色状态组合器</span><h4>只选择，不填表</h4></div>
          <div><small>基于版本</small><strong>{currentVersion ? `V${currentVersion.versionNumber} · ${currentVersion.label}` : "当前档案"}</strong></div>
        </header>
        <StateChoiceGroup label="状态用途" options={STATE_PURPOSES} value={statePurpose} onChange={setStatePurpose} />
        <div className="state-composer-pair">
          <StateChoiceGroup label="服装" options={STATE_CHOICES.wardrobe} value={stateSelections.wardrobe} onChange={(wardrobe) => setStateSelections((current) => ({ ...current, wardrobe }))} />
          <StateChoiceGroup label="发型" options={STATE_CHOICES.hair} value={stateSelections.hair} onChange={(hair) => setStateSelections((current) => ({ ...current, hair }))} />
        </div>
        <div className="state-composer-pair">
          <StateChoiceGroup label="表情" options={STATE_CHOICES.expression} value={stateSelections.expression} onChange={(expression) => setStateSelections((current) => ({ ...current, expression }))} />
          <StateChoiceGroup label="姿态" options={STATE_CHOICES.pose} value={stateSelections.pose} onChange={(pose) => setStateSelections((current) => ({ ...current, pose }))} />
        </div>
        <div className="state-composer-pair">
          <StateChoiceGroup label="场景" options={STATE_CHOICES.scene} value={stateSelections.scene} onChange={(scene) => setStateSelections((current) => ({ ...current, scene }))} />
          <StateChoiceGroup label="情绪" options={STATE_CHOICES.emotion} value={stateSelections.emotion} onChange={(emotion) => setStateSelections((current) => ({ ...current, emotion }))} />
        </div>
        <section className="state-choice-group state-continuity-group" aria-label="连续性约束">
          <header><strong>保持不变</strong><span>可多选</span></header>
          <div className="state-choice-grid continuity-choice-grid" role="group" aria-label="连续性约束">
            {CONTINUITY_CHOICES.map((option) => {
              const selected = continuitySelections.includes(option.id);
              return <button
                key={option.id}
                type="button"
                role="checkbox"
                aria-label={option.label}
                aria-checked={selected}
                className={selected ? "selected" : ""}
                onClick={() => setContinuitySelections((current) => selected
                  ? current.filter((item) => item !== option.id)
                  : [...current, option.id])}
              ><span aria-hidden="true">{selected ? "✓" : "+"}</span><strong>{option.label}</strong></button>;
            })}
          </div>
        </section>
        <section className="state-choice-group state-tracker-group" aria-label="持续状态字段">
          <header><strong>持续状态</strong><span>可多选</span></header>
          <div className="state-tracker-choice-grid" role="group" aria-label="持续状态字段">
            {CHARACTER_TRACKER_PRESETS.map((preset) => {
              const selected = trackerIds.includes(preset.id);
              const preview = stateTrackers.find((item) => item.id === preset.id);
              return <button
                key={preset.id}
                type="button"
                role="checkbox"
                aria-label={preset.label}
                aria-checked={selected}
                className={selected ? "selected" : ""}
                onClick={() => setTrackerIds((current) => selected
                  ? current.filter((item) => item !== preset.id)
                  : [...current, preset.id])}
              >
                <span aria-hidden="true">{selected ? "✓" : "+"}</span>
                <strong>{preset.label}</strong>
                <small>{preview?.value ?? preset.description}</small>
              </button>;
            })}
          </div>
        </section>
        <CharacterTrackerEditor
          value={customTrackers}
          onChange={setCustomTrackers}
          title="添加自定义状态"
          description="标准字段不够时再添加"
          compact
        />
        <details className="runtime-optional-details state-optional-details">
          <summary>精细补充（可选）</summary>
          <label>额外连续性说明<textarea aria-label="额外连续性说明" value={customContinuityNote} onChange={(event) => setCustomContinuityNote(event.target.value)} placeholder="仅补充选项没有覆盖的要求" /></label>
        </details>
        <footer className="state-composer-summary">
          <div>
            <span>将保存为</span>
            <strong>{generatedStateName}</strong>
            <small>{[
              stateChoiceLabel(STATE_CHOICES.wardrobe, stateSelections.wardrobe),
              stateChoiceLabel(STATE_CHOICES.hair, stateSelections.hair),
              stateChoiceLabel(STATE_CHOICES.expression, stateSelections.expression),
              stateChoiceLabel(STATE_CHOICES.pose, stateSelections.pose),
              stateChoiceLabel(STATE_CHOICES.emotion, stateSelections.emotion),
            ].join(" · ")} · {allStateTrackers.length} 个持续状态</small>
          </div>
          <button className="primary-button" type="button" disabled={busy} onClick={() => void createState()}>保存为当前状态</button>
        </footer>
      </div>}
    </div>}
    {tab === "media" && <div className="character-runtime-grid">
      <div className="character-runtime-list">
        {snapshot.media.map((item) => <article key={item.id} className="runtime-item">
          <div><strong>{item.asset.name}</strong><span>{item.role}</span></div>
          <p>{item.asset.type} · {item.asset.confirmation === "confirmed" ? "已确认" : "待审片"} · {item.asset.rightsStatus === "unknown" ? "权利待复核" : item.asset.rightsStatus}</p>
        </article>)}
        {!snapshot.media.length && <div className="empty-state compact-empty"><strong>还没有衍生资产</strong><p>从角色工作室发起生成后，参考与结果会自动回到这里。</p></div>}
      </div>
      <div className="character-runtime-list">
        <h4>最近创作会话</h4>
        {snapshot.sessions.map((session) => <article key={session.id} className="runtime-item"><div><strong>{session.title}</strong><span>{session.status}</span></div><p>{session.mode} · {session.aspectRatio}</p></article>)}
        {!snapshot.sessions.length && <p className="result-note">还没有创作会话。</p>}
      </div>
    </div>}
    {error && <p className="fact-error" role="alert">{error}</p>}
  </section>;
}
