import { useEffect, useMemo, useState } from "react";
import type {
  CharacterProfile,
  ImageReviewDecision,
  ImageReviewScores,
  MasterPromotionTarget,
  ReviewWorkspaceSnapshot,
  SceneProfile,
} from "../shared/types";

type Props = {
  snapshot: ReviewWorkspaceSnapshot;
  characters: CharacterProfile[];
  scenes: SceneProfile[];
  onChanged: (snapshot: ReviewWorkspaceSnapshot) => void;
  onOpenAsset: (assetId: string) => void;
};

const EMPTY_SCORES: ImageReviewScores = { identity: 3, scene: 3, realism: 3, composition: 3, technical: 3 };
const SCORE_FIELDS: Array<[keyof ImageReviewScores, string]> = [
  ["identity", "角色一致"],
  ["scene", "场景贴合"],
  ["realism", "真实质感"],
  ["composition", "构图完成"],
  ["technical", "技术质量"],
];
const DECISION_LABEL: Record<ImageReviewDecision, string> = {
  pending: "待定",
  approved: "通过",
  rejected: "淘汰",
};

export function ReviewWorkspacePanel({ snapshot, characters, scenes, onChanged, onOpenAsset }: Props) {
  const [selectedAssetId, setSelectedAssetId] = useState(snapshot.candidates[0]?.asset.id ?? "");
  const [preview, setPreview] = useState("");
  const [decision, setDecision] = useState<ImageReviewDecision>("pending");
  const [scores, setScores] = useState<ImageReviewScores>(EMPTY_SCORES);
  const [note, setNote] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [targetType, setTargetType] = useState<MasterPromotionTarget>("project");
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selected = useMemo(
    () => snapshot.candidates.find((item) => item.asset.id === selectedAssetId) ?? snapshot.candidates[0],
    [selectedAssetId, snapshot.candidates],
  );
  const approvedCount = snapshot.candidates.filter((item) => item.latestReview?.decision === "approved").length;
  const pendingCount = snapshot.candidates.filter((item) => !item.latestReview || item.latestReview.decision === "pending").length;

  useEffect(() => {
    if (!selected && snapshot.candidates[0]) setSelectedAssetId(snapshot.candidates[0].asset.id);
  }, [selected, snapshot.candidates]);
  useEffect(() => {
    if (!selected) return;
    const latest = selected.latestReview;
    setDecision(latest?.decision ?? "pending");
    setScores(latest?.scores ?? EMPTY_SCORES);
    setNote(latest?.note ?? "");
    setNextAction(latest?.nextAction ?? "");
    setError("");
    setPreview("");
    let current = true;
    window.studio.assets.preview(selected.asset.id).then((value) => {
      if (current) setPreview(value ?? "");
    }).catch(() => undefined);
    return () => { current = false; };
  }, [selected?.asset.id]);
  useEffect(() => {
    setTargetId("");
  }, [targetType]);

  const reload = async () => onChanged(await window.studio.imageReviews.workspace(snapshot.projectId));
  const saveReview = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      await window.studio.imageReviews.create({
        projectId: snapshot.projectId,
        assetId: selected.asset.id,
        decision,
        scores,
        note,
        nextAction,
      });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存审片记录失败。");
    } finally { setBusy(false); }
  };
  const promote = async () => {
    const reviewId = selected?.latestReview?.id;
    if (!reviewId) return;
    setBusy(true); setError("");
    try {
      await window.studio.imageReviews.promote({
        reviewId,
        targetType,
        targetId: targetType === "project" ? undefined : targetId,
        versionId: targetType === "character" && targetId === selected.latestReview?.provenance.characterProfileId
          ? selected.latestReview.provenance.characterVersionId
          : targetType === "scene" && targetId === selected.latestReview?.provenance.sceneProfileId
            ? selected.latestReview.provenance.sceneVersionId : undefined,
        stateId: targetType === "character" && targetId === selected.latestReview?.provenance.characterProfileId
          ? selected.latestReview.provenance.characterStateId
          : targetType === "scene" && targetId === selected.latestReview?.provenance.sceneProfileId
            ? selected.latestReview.provenance.sceneStateId : undefined,
      });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "晋级母版失败。");
    } finally { setBusy(false); }
  };

  if (!snapshot.candidates.length) return <section className="review-workspace" aria-label="审片与母版">
    <div className="empty-state empty-state-action"><div><strong>还没有图片候选</strong><p>先从创作卡或镜头工作室生成图片，候选会自动进入这里。</p></div></div>
  </section>;

  const promotable = selected?.latestReview?.decision === "approved" && selected.asset.confirmation === "confirmed" &&
    ["authorized", "original"].includes(selected.asset.rightsStatus);

  return <section className="review-workspace" aria-label="审片与母版">
    <header className="review-summary">
      <div><strong>{snapshot.candidates.length}</strong><span>图片候选</span></div>
      <div><strong>{pendingCount}</strong><span>待审</span></div>
      <div><strong>{approvedCount}</strong><span>已通过</span></div>
      <div><strong>{snapshot.promotions.length}</strong><span>母版晋级</span></div>
    </header>
    <div className="review-layout">
      <aside className="review-candidate-list" aria-label="图片候选列表">
        {snapshot.candidates.map((candidate) => <button type="button" key={candidate.asset.id}
          className={candidate.asset.id === selected?.asset.id ? "selected" : ""}
          onClick={() => setSelectedAssetId(candidate.asset.id)}>
          <span>{candidate.asset.name}</span>
          <small>{candidate.projectMaster ? "项目母版" : candidate.latestReview ? DECISION_LABEL[candidate.latestReview.decision] : "未审"} · {candidate.reviewCount} 次记录</small>
        </button>)}
      </aside>
      {selected && <main className="review-inspector">
        <section className="review-preview-panel">
          <div className="review-preview">{preview ? <img src={preview} alt={`${selected.asset.name} 审片预览`} /> : <span>图片预览</span>}</div>
          <div>
            <p className="eyebrow">当前候选</p>
            <h3>{selected.asset.name}</h3>
            <p>{selected.asset.confirmation === "confirmed" ? "画面已确认" : selected.asset.confirmation === "rejected" ? "已淘汰" : "待确认"} · {selected.asset.rightsStatus === "authorized" ? "已获授权" : selected.asset.rightsStatus === "original" ? "原创" : "权利待复核"}</p>
            {selected.latestReview?.provenance.providerId && <p>模型：{selected.latestReview.provenance.providerId} · 画幅：{selected.latestReview.provenance.aspectRatio ?? "未记录"}</p>}
            {selected.latestReview?.provenance.prompt && <details><summary>查看本轮提示词</summary><p>{selected.latestReview.provenance.prompt}</p></details>}
            <button type="button" onClick={() => onOpenAsset(selected.asset.id)}>打开完整资产</button>
          </div>
        </section>
        <section className="review-form-panel">
          <div className="review-decision" role="group" aria-label="审片结论">
            {(["pending", "approved", "rejected"] as const).map((value) => <button type="button" key={value}
              className={decision === value ? "selected" : ""} onClick={() => setDecision(value)}>{DECISION_LABEL[value]}</button>)}
          </div>
          <div className="review-score-grid">
            {SCORE_FIELDS.map(([key, label]) => <label key={key}>{label}<select aria-label={label} value={scores[key]}
              onChange={(event) => setScores((current) => ({ ...current, [key]: Number(event.target.value) }))}>
              {[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value} 分</option>)}
            </select></label>)}
          </div>
          <label>判断依据<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="写清通过或待定的依据" /></label>
          <label>下一轮调整<textarea value={nextAction} onChange={(event) => setNextAction(event.target.value)} placeholder="淘汰时必填；只写下一轮需要改变的变量" /></label>
          <button className="primary-button" type="button" disabled={busy} onClick={() => void saveReview()}>保存审片记录</button>
        </section>
        <section className="review-master-panel">
          <div><p className="eyebrow">母版晋级</p><h3>把通过结果变成后续生产基线</h3></div>
          <label>晋级到<select aria-label="母版类型" value={targetType} onChange={(event) => setTargetType(event.target.value as MasterPromotionTarget)}>
            <option value="project">项目母版</option><option value="character">角色主参考</option><option value="scene">场景母版</option>
          </select></label>
          {targetType === "character" && <label>角色<select aria-label="母版角色" value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">请选择</option>{characters.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
          {targetType === "scene" && <label>场景<select aria-label="母版场景" value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">请选择</option>{scenes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
          <button type="button" disabled={busy || !promotable || (targetType !== "project" && !targetId)} onClick={() => void promote()}>晋级母版</button>
          {!promotable && <p className="result-note">须先审片通过，并完成画面确认和使用权复核。</p>}
        </section>
        {error && <p className="fact-error" role="alert">{error}</p>}
      </main>}
    </div>
  </section>;
}
