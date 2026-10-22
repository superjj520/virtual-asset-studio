import type { ProjectPipelineTarget, ProjectWorkspace } from "../shared/types";

type ProjectPipelinePanelProps = {
  snapshot?: ProjectWorkspace;
  onNavigate: (target: ProjectPipelineTarget) => void;
};

const statusLabel = (status: ProjectWorkspace["pipeline"][number]["status"]) =>
  status === "complete" ? "已闭环" : status === "ready" ? "可继续" : status === "needs_attention" ? "需处理" : "未开始";

export function ProjectPipelinePanel({ snapshot, onNavigate }: ProjectPipelinePanelProps) {
  const pipeline = snapshot?.pipeline ?? [];
  const blockers = snapshot?.blockers ?? [];
  return <section className="project-pipeline" aria-label="四域创作进度">
    <div className="project-pipeline-heading">
      <div><p className="eyebrow">项目进度</p><strong>四个工作域，一条交付主线</strong></div>
      <span>{pipeline.filter((item) => item.status === "complete").length}/4 已闭环</span>
    </div>
    {!snapshot && <p className="result-note" role="status">正在汇总项目状态…</p>}
    {!!snapshot && <>
      <div className="project-pipeline-grid">
        {pipeline.map((stage) => <button key={stage.key} className={`pipeline-stage pipeline-${stage.status}`} onClick={() => onNavigate(stage.target)}>
          <span><b>{stage.label}</b><em>{statusLabel(stage.status)}</em></span>
          <strong>{stage.summary}</strong>
          <small>{stage.nextAction}</small>
        </button>)}
      </div>
      {!!blockers.length && <div className="project-blockers" aria-label="当前待处理事项">
        {blockers.map((blocker) => <button key={blocker.code} onClick={() => onNavigate(blocker.target)}>
          <span>{blocker.label}</span><strong>{blocker.count}</strong><small>{blocker.detail}</small>
        </button>)}
      </div>}
    </>}
  </section>;
}
