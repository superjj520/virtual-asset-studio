import { useEffect, useState } from "react";
import type {
  CharacterStateKind,
  CharacterVersionStatus,
  CharacterWorkspaceSnapshot,
} from "../shared/types";

type Props = {
  snapshot: CharacterWorkspaceSnapshot;
  onChanged: (snapshot: CharacterWorkspaceSnapshot) => void;
  onStartImage: (input: { versionId?: string; stateId?: string }) => void;
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

export function CharacterWorkspacePanel({ snapshot, onChanged, onStartImage }: Props) {
  const currentVersion = snapshot.activeVersion ?? snapshot.versions[0];
  const [tab, setTab] = useState<"versions" | "states" | "media">("versions");
  const [versionLabel, setVersionLabel] = useState("");
  const [versionSummary, setVersionSummary] = useState("");
  const [stateName, setStateName] = useState("");
  const [stateKind, setStateKind] = useState<CharacterStateKind>("scene");
  const [stateVersionId, setStateVersionId] = useState(currentVersion?.id ?? "");
  const [stateFields, setStateFields] = useState({
    wardrobe: "", hair: "", expression: "", pose: "", scene: "", emotion: "", continuityNotes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!stateVersionId && currentVersion?.id) setStateVersionId(currentVersion.id);
  }, [currentVersion?.id, stateVersionId]);

  const reload = async () => onChanged(await window.studio.characterWorkspace.get(snapshot.character.id));
  const createVersion = async (status: CharacterVersionStatus) => {
    setBusy(true); setError("");
    try {
      await window.studio.characterWorkspace.createVersion(snapshot.character.id, {
        label: versionLabel.trim() || undefined,
        status,
        changeSummary: versionSummary.trim(),
      });
      setVersionLabel(""); setVersionSummary("");
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存角色版本失败。");
    } finally { setBusy(false); }
  };
  const createState = async () => {
    setBusy(true); setError("");
    try {
      await window.studio.characterWorkspace.createState(snapshot.character.id, {
        versionId: stateVersionId || undefined,
        name: stateName,
        kind: stateKind,
        status: "active",
        ...stateFields,
      });
      setStateName("");
      setStateFields({ wardrobe: "", hair: "", expression: "", pose: "", scene: "", emotion: "", continuityNotes: "" });
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

  return <section className="character-runtime-panel" aria-label={`${snapshot.character.name}角色工作室`}>
    <header className="character-runtime-header">
      <div>
        <p className="eyebrow">角色工作室 / 版本、状态与衍生资产</p>
        <h3>{snapshot.character.name}</h3>
        <p>身份保持不变；服装、动作、场景和情绪通过状态切换。</p>
      </div>
      <button className="primary-button" type="button" onClick={() => onStartImage({
        versionId: currentVersion?.id,
        stateId: snapshot.activeState?.id,
      })}>用当前状态开始图片创作</button>
    </header>
    <div className="character-runtime-summary">
      <div><strong>{currentVersion ? `V${currentVersion.versionNumber}` : "未建立"}</strong><span>当前版本</span></div>
      <div><strong>{snapshot.activeState?.name ?? "基础设定"}</strong><span>当前状态</span></div>
      <div><strong>{snapshot.media.length}</strong><span>衍生素材</span></div>
      <div><strong>{snapshot.sessions.length}</strong><span>创作会话</span></div>
    </div>
    <div className="character-runtime-tabs" role="tablist" aria-label="角色工作室模块">
      <button type="button" role="tab" aria-selected={tab === "versions"} className={tab === "versions" ? "selected" : ""} onClick={() => setTab("versions")}>版本</button>
      <button type="button" role="tab" aria-selected={tab === "states"} className={tab === "states" ? "selected" : ""} onClick={() => setTab("states")}>状态</button>
      <button type="button" role="tab" aria-selected={tab === "media"} className={tab === "media" ? "selected" : ""} onClick={() => setTab("media")}>衍生资产</button>
    </div>
    {tab === "versions" && <div className="character-runtime-grid">
      <div className="character-runtime-list">
        {snapshot.versions.map((version) => <article key={version.id} className={version.status === "locked" ? "runtime-item runtime-current" : "runtime-item"}>
          <div><strong>V{version.versionNumber} · {version.label}</strong><span>{VERSION_STATUS[version.status]}</span></div>
          <p>{version.changeSummary || "未填写调整说明"}</p>
          <small>{new Date(version.createdAt).toLocaleString("zh-CN")}</small>
        </article>)}
        {!snapshot.versions.length && <div className="empty-state compact-empty"><strong>还没有角色版本</strong><p>保存一次快照，后续图片和视频才能回溯到明确角色。</p></div>}
      </div>
      <div className="runtime-editor">
        <h4>保存当前设定</h4>
        <label>版本名称<input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} placeholder="例如：正式定妆 V1" /></label>
        <label>本次变化<textarea value={versionSummary} onChange={(event) => setVersionSummary(event.target.value)} placeholder="只写相对上一版发生的变化" /></label>
        <div className="form-actions">
          <button type="button" disabled={busy} onClick={() => void createVersion("draft")}>保存草稿版本</button>
          <button type="button" disabled={busy || snapshot.character.lifecycle !== "confirmed"} onClick={() => void createVersion("locked")}>锁定为生产版本</button>
        </div>
        {snapshot.character.lifecycle !== "confirmed" && <p className="result-note">角色档案完成主参考与必需细项后，才能锁定生产版本。</p>}
      </div>
    </div>}
    {tab === "states" && <div className="character-runtime-grid">
      <div className="character-runtime-list">
        {snapshot.states.map((state) => <article key={state.id} className={state.status === "active" ? "runtime-item runtime-current" : "runtime-item"}>
          <div><strong>{state.name}</strong><span>{state.status === "active" ? "正在使用" : state.status === "archived" ? "已归档" : "备用"}</span></div>
          <p>{[STATE_KIND[state.kind], state.wardrobe, state.pose, state.scene, state.emotion].filter(Boolean).join(" · ")}</p>
          {state.status !== "active" && <button type="button" disabled={busy} onClick={() => void activateState(state.id)}>设为当前状态</button>}
        </article>)}
        {!snapshot.states.length && <div className="empty-state compact-empty"><strong>还没有场景状态</strong><p>把换装、动作和场景保存为状态，不改写角色身份。</p></div>}
      </div>
      <div className="runtime-editor">
        <h4>建立角色状态</h4>
        <div className="runtime-form-grid">
          <label>状态名称<input value={stateName} onChange={(event) => setStateName(event.target.value)} placeholder="例如：雨夜街头" /></label>
          <label>类型<select value={stateKind} onChange={(event) => setStateKind(event.target.value as CharacterStateKind)}><option value="baseline">基础</option><option value="scene">场景</option><option value="performance">演出</option></select></label>
          <label>基于版本<select value={stateVersionId} onChange={(event) => setStateVersionId(event.target.value)}><option value="">当前档案</option>{snapshot.versions.map((version) => <option key={version.id} value={version.id}>V{version.versionNumber} · {version.label}</option>)}</select></label>
          {(["wardrobe", "hair", "expression", "pose", "scene", "emotion"] as const).map((field) => <label key={field}>{({ wardrobe: "服装", hair: "发型", expression: "表情", pose: "姿势／动作", scene: "场景", emotion: "情绪" } as const)[field]}<input value={stateFields[field]} onChange={(event) => setStateFields((current) => ({ ...current, [field]: event.target.value }))} /></label>)}
        </div>
        <label>连续性要求<textarea value={stateFields.continuityNotes} onChange={(event) => setStateFields((current) => ({ ...current, continuityNotes: event.target.value }))} placeholder="例如：雨水只落在外套肩部，发型不改变" /></label>
        <button type="button" disabled={busy || !stateName.trim()} onClick={() => void createState()}>保存并设为当前状态</button>
      </div>
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
