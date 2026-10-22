import { useEffect, useState } from "react";
import type { Asset, SceneKind, SceneMediaRole, SceneVersionStatus, SceneWorkspaceSnapshot } from "../shared/types";

type Props = {
  snapshot: SceneWorkspaceSnapshot;
  onChanged: (snapshot: SceneWorkspaceSnapshot) => void;
  onStartImage: (input: { versionId?: string; stateId?: string }) => void;
};

const KIND_LABEL: Record<SceneKind, string> = {
  interior: "室内", exterior: "室外", environment: "自然／环境", fantasy: "幻想空间", studio: "影棚",
};

export function SceneWorkspacePanel({ snapshot, onChanged, onStartImage }: Props) {
  const currentVersion = snapshot.activeVersion ?? snapshot.versions[0];
  const [tab, setTab] = useState<"core" | "versions" | "states" | "media">("core");
  const [core, setCore] = useState({
    name: snapshot.scene.name, kind: snapshot.scene.kind, anchor: snapshot.scene.anchor, layout: snapshot.scene.layout,
    materials: snapshot.scene.materials, colorSystem: snapshot.scene.colorSystem,
    requiredElements: snapshot.scene.requiredElements, forbiddenChanges: snapshot.scene.forbiddenChanges,
  });
  const [versionLabel, setVersionLabel] = useState("");
  const [versionSummary, setVersionSummary] = useState("");
  const [stateVersionId, setStateVersionId] = useState(currentVersion?.id ?? "");
  const [stateName, setStateName] = useState("");
  const [stateFields, setStateFields] = useState({
    timeOfDay: "", weather: "", season: "", lighting: "", atmosphere: "", setDressing: "", continuityNotes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [libraryAssets, setLibraryAssets] = useState<Asset[]>([]);
  const [mediaAssetId, setMediaAssetId] = useState("");
  const [mediaRole, setMediaRole] = useState<SceneMediaRole>("layout_reference");

  useEffect(() => {
    setCore({
      name: snapshot.scene.name, kind: snapshot.scene.kind, anchor: snapshot.scene.anchor, layout: snapshot.scene.layout,
      materials: snapshot.scene.materials, colorSystem: snapshot.scene.colorSystem,
      requiredElements: snapshot.scene.requiredElements, forbiddenChanges: snapshot.scene.forbiddenChanges,
    });
  }, [snapshot.scene]);
  useEffect(() => {
    if (!stateVersionId && currentVersion?.id) setStateVersionId(currentVersion.id);
  }, [currentVersion?.id, stateVersionId]);
  useEffect(() => {
    if (tab !== "media") return;
    let current = true;
    window.studio.assets.list({ projectId: snapshot.scene.projectId })
      .then((items) => {
        if (current) setLibraryAssets(items.filter((item) => item.mediaType.startsWith("image/") &&
          item.confirmation === "confirmed" && ["authorized", "original"].includes(item.rightsStatus)));
      })
      .catch(() => { if (current) setLibraryAssets([]); });
    return () => { current = false; };
  }, [snapshot.scene.projectId, tab]);

  const reload = async () => onChanged(await window.studio.sceneWorkspace.get(snapshot.scene.id));
  const saveCore = async () => {
    setBusy(true); setError("");
    try {
      await window.studio.sceneWorkspace.update(snapshot.scene.id, core);
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存场景基线失败。"); }
    finally { setBusy(false); }
  };
  const createVersion = async (status: SceneVersionStatus) => {
    setBusy(true); setError("");
    try {
      await window.studio.sceneWorkspace.createVersion(snapshot.scene.id, {
        label: versionLabel.trim() || undefined, status, changeSummary: versionSummary.trim(),
      });
      setVersionLabel(""); setVersionSummary("");
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存场景版本失败。"); }
    finally { setBusy(false); }
  };
  const createState = async () => {
    setBusy(true); setError("");
    try {
      await window.studio.sceneWorkspace.createState(snapshot.scene.id, {
        versionId: stateVersionId || undefined, name: stateName, status: "active", ...stateFields,
      });
      setStateName("");
      setStateFields({ timeOfDay: "", weather: "", season: "", lighting: "", atmosphere: "", setDressing: "", continuityNotes: "" });
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存场景状态失败。"); }
    finally { setBusy(false); }
  };
  const activateState = async (id: string) => {
    setBusy(true); setError("");
    try { await window.studio.sceneWorkspace.updateState(id, { status: "active" }); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "切换场景状态失败。"); }
    finally { setBusy(false); }
  };
  const attachReference = async () => {
    setBusy(true); setError("");
    try {
      await window.studio.sceneWorkspace.attachMedia(snapshot.scene.id, {
        versionId: currentVersion?.id, stateId: snapshot.activeState?.id, assetId: mediaAssetId, role: mediaRole,
      });
      setMediaAssetId("");
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "关联场景参考失败。"); }
    finally { setBusy(false); }
  };

  return <section className="character-runtime-panel scene-runtime-panel" aria-label={`${snapshot.scene.name}场景工作室`}>
    <header className="character-runtime-header">
      <div>
        <p className="eyebrow">场景工作室 / 空间基线、环境状态与衍生资产</p>
        <h3>{snapshot.scene.name}</h3>
        <p>空间结构保持稳定；时间、天气、光线和布景通过状态切换。</p>
      </div>
      <button className="primary-button" type="button" onClick={() => onStartImage({
        versionId: currentVersion?.id, stateId: snapshot.activeState?.id,
      })}>用当前场景开始图片创作</button>
    </header>
    <div className="character-runtime-summary">
      <div><strong>{currentVersion ? `V${currentVersion.versionNumber}` : "未建立"}</strong><span>当前版本</span></div>
      <div><strong>{snapshot.activeState?.name ?? "基础环境"}</strong><span>当前状态</span></div>
      <div><strong>{snapshot.media.length}</strong><span>场景素材</span></div>
      <div><strong>{snapshot.sessions.length}</strong><span>创作会话</span></div>
    </div>
    <div className="character-runtime-tabs" role="tablist" aria-label="场景工作室模块">
      {([['core', '空间基线'], ['versions', '版本'], ['states', '环境状态'], ['media', '衍生资产']] as const).map(([value, label]) =>
        <button type="button" role="tab" key={value} aria-selected={tab === value} className={tab === value ? "selected" : ""} onClick={() => setTab(value)}>{label}</button>)}
    </div>
    {tab === "core" && <div className="runtime-editor scene-core-editor">
      <h4>固定不变的场景结构</h4>
      <div className="runtime-form-grid">
        <label>场景名称<input value={core.name} onChange={(event) => setCore((value) => ({ ...value, name: event.target.value }))} /></label>
        <label>场景类型<select value={core.kind} onChange={(event) => setCore((value) => ({ ...value, kind: event.target.value as SceneKind }))}>{Object.entries(KIND_LABEL).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>空间锚点<textarea value={core.anchor} onChange={(event) => setCore((value) => ({ ...value, anchor: event.target.value }))} /></label>
        <label>空间结构<textarea aria-label="空间结构" value={core.layout} onChange={(event) => setCore((value) => ({ ...value, layout: event.target.value }))} /></label>
        <label>材质体系<textarea value={core.materials} onChange={(event) => setCore((value) => ({ ...value, materials: event.target.value }))} /></label>
        <label>色彩体系<textarea value={core.colorSystem} onChange={(event) => setCore((value) => ({ ...value, colorSystem: event.target.value }))} /></label>
        <label>必须出现<textarea value={core.requiredElements} onChange={(event) => setCore((value) => ({ ...value, requiredElements: event.target.value }))} /></label>
        <label>禁止改变<textarea value={core.forbiddenChanges} onChange={(event) => setCore((value) => ({ ...value, forbiddenChanges: event.target.value }))} /></label>
      </div>
      <button className="primary-button" type="button" disabled={busy} onClick={() => void saveCore()}>保存场景基线</button>
    </div>}
    {tab === "versions" && <div className="character-runtime-grid">
      <div className="character-runtime-list">
        {snapshot.versions.map((version) => <article key={version.id} className={version.status === "locked" ? "runtime-item runtime-current" : "runtime-item"}>
          <div><strong>V{version.versionNumber} · {version.label}</strong><span>{version.status === "locked" ? "当前锁定" : version.status === "superseded" ? "历史版本" : "草稿"}</span></div>
          <p>{version.changeSummary || "未填写调整说明"}</p>
        </article>)}
        {!snapshot.versions.length && <div className="empty-state compact-empty"><strong>还没有场景版本</strong><p>先保存空间快照，再进入连续创作。</p></div>}
      </div>
      <div className="runtime-editor">
        <h4>保存当前空间</h4>
        <label>版本名称<input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} placeholder="例如：温室正式版 V1" /></label>
        <label>本次变化<textarea value={versionSummary} onChange={(event) => setVersionSummary(event.target.value)} /></label>
        <div className="form-actions">
          <button disabled={busy} onClick={() => void createVersion("draft")}>保存草稿版本</button>
          <button disabled={busy || snapshot.scene.lifecycle !== "confirmed"} onClick={() => void createVersion("locked")}>锁定为生产版本</button>
        </div>
        {snapshot.scene.lifecycle !== "confirmed" && <p className="result-note">先将场景档案标记为“已确认”，才能锁定生产版本。</p>}
      </div>
    </div>}
    {tab === "states" && <div className="character-runtime-grid">
      <div className="character-runtime-list">
        {snapshot.states.map((state) => <article key={state.id} className={state.status === "active" ? "runtime-item runtime-current" : "runtime-item"}>
          <div><strong>{state.name}</strong><span>{state.status === "active" ? "正在使用" : "备用"}</span></div>
          <p>{[state.timeOfDay, state.weather, state.season, state.lighting, state.atmosphere].filter(Boolean).join(" · ")}</p>
          {state.status !== "active" && <button disabled={busy} onClick={() => void activateState(state.id)}>设为当前状态</button>}
        </article>)}
        {!snapshot.states.length && <div className="empty-state compact-empty"><strong>还没有环境状态</strong><p>时间、天气和光线属于状态，不改写空间结构。</p></div>}
      </div>
      <div className="runtime-editor">
        <h4>建立环境状态</h4>
        <div className="runtime-form-grid">
          <label>状态名称<input value={stateName} onChange={(event) => setStateName(event.target.value)} placeholder="例如：雨夜" /></label>
          <label>基于版本<select value={stateVersionId} onChange={(event) => setStateVersionId(event.target.value)}><option value="">当前档案</option>{snapshot.versions.map((version) => <option key={version.id} value={version.id}>V{version.versionNumber} · {version.label}</option>)}</select></label>
          {([['timeOfDay', '时间'], ['weather', '天气'], ['season', '季节'], ['lighting', '光线'], ['atmosphere', '氛围'], ['setDressing', '布景变化']] as const).map(([field, label]) => <label key={field}>{label}<input value={stateFields[field]} onChange={(event) => setStateFields((value) => ({ ...value, [field]: event.target.value }))} /></label>)}
        </div>
        <label>连续性要求<textarea value={stateFields.continuityNotes} onChange={(event) => setStateFields((value) => ({ ...value, continuityNotes: event.target.value }))} /></label>
        <button disabled={busy || !stateName.trim()} onClick={() => void createState()}>保存并设为当前状态</button>
      </div>
    </div>}
    {tab === "media" && <div className="character-runtime-grid">
      <div className="character-runtime-list">
        {snapshot.media.map((item) => <article key={item.id} className="runtime-item"><div><strong>{item.asset.name}</strong><span>{item.role}</span></div><p>{item.asset.confirmation === "confirmed" ? "已确认" : "待审片"} · {item.asset.rightsStatus}</p></article>)}
        {!snapshot.media.length && <div className="empty-state compact-empty"><strong>还没有场景衍生资产</strong><p>从场景工作室发起生成后，候选和结果会自动回到这里。</p></div>}
      </div>
      <div className="character-runtime-list">
        <h4>最近创作会话</h4>
        {snapshot.sessions.map((session) => <article key={session.id} className="runtime-item"><div><strong>{session.title}</strong><span>{session.status}</span></div><p>{session.mode} · {session.aspectRatio}</p></article>)}
        {!snapshot.sessions.length && <p className="result-note">还没有创作会话。</p>}
        <div className="runtime-editor scene-reference-editor">
          <h4>关联已有场景参考</h4>
          <label>参考用途<select value={mediaRole} onChange={(event) => setMediaRole(event.target.value as SceneMediaRole)}><option value="layout_reference">空间结构</option><option value="lighting_reference">光线</option><option value="material_reference">材质</option><option value="master">场景母版</option><option value="remix_source">衍生来源</option></select></label>
          <label>已授权图片<select value={mediaAssetId} onChange={(event) => setMediaAssetId(event.target.value)}><option value="">请选择</option>{libraryAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
          <button disabled={busy || !mediaAssetId} onClick={() => void attachReference()}>关联到当前场景</button>
          {!libraryAssets.length && <p className="result-note">当前项目没有已确认且具备使用权的图片。</p>}
        </div>
      </div>
    </div>}
    {error && <p className="fact-error" role="alert">{error}</p>}
  </section>;
}
