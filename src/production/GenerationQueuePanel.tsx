import type { StudioJob } from "../shared/types";
import {
  jobAspectSummary,
  jobFailureCategory,
  jobReferenceSummary,
  jobRemoteSummary,
} from "./job-presentation";

type Props = {
  jobs: StudioJob[];
  retryingJobIds: ReadonlySet<string>;
  onRefresh: () => void;
  onRetry: (job: StudioJob) => void;
};

const kindLabel = (job: StudioJob) =>
  job.kind === "vision_analysis" ? "视觉理解" : job.kind === "image_generation" ? "图片生成" : "图生视频";

const statusLabel = (job: StudioJob) =>
  job.status === "queued" ? "等待中" : job.status === "in_progress" ? "生成中" : job.status === "completed" ? "已完成" : job.status === "unknown" ? "待核实" : "失败";

const canRetry = (job: StudioJob, jobs: StudioJob[]) => {
  const interrupted = job.kind === "image_generation" && job.status === "queued" && job.error === "应用关闭前任务中断，可由用户确认后重试。";
  return (job.status === "failed" || interrupted) && !jobs.some((candidate) => candidate.request.retryOfJobId === job.id);
};

const canSafelyQuery = (job: StudioJob) =>
  (job.status === "unknown" || job.status === "in_progress") &&
  (typeof job.result?.remoteId === "string" || typeof job.result?.remoteTask === "object");

export function GenerationQueuePanel({ jobs, retryingJobIds, onRefresh, onRetry }: Props) {
  return (
    <section className="generation-queue" aria-label="生成任务列表">
      {!jobs.length && (
        <div className="empty-state">
          <strong>没有生成任务</strong>
          <p>完成一次视觉理解或图片生成后，来源与恢复状态会显示在这里。</p>
        </div>
      )}
      {jobs.map((job) => {
        const category = jobFailureCategory(job);
        const retryRoot = typeof job.request.retryRootJobId === "string" ? job.request.retryRootJobId : undefined;
        const retryParent = typeof job.request.retryOfJobId === "string" ? job.request.retryOfJobId : undefined;
        return (
          <article key={job.id} className="generation-job-card">
            <div className="generation-job-main">
              <div className="generation-job-heading">
                <span className={`pattern-status job-${job.status}`}>{statusLabel(job)}</span>
                <div>
                  <h3>{kindLabel(job)}</h3>
                  <p>{job.providerId} · {new Date(job.updatedAt).toLocaleString("zh-CN")}</p>
                </div>
              </div>
              <div className="generation-job-tags">
                {job.kind === "image_generation" && <span>画幅 {jobAspectSummary(job)}</span>}
                {job.kind === "image_generation" && <span>{jobReferenceSummary(job)}</span>}
                {job.retryCount > 0 && <span>第 {job.retryCount} 次重试</span>}
                {category && <span className="job-failure-category">{category}</span>}
              </div>
              <p className={job.error ? "generation-job-error" : "generation-job-summary"}>
                {job.error || (job.status === "in_progress" ? `${String(job.result?.progress ?? 0)}% · 正在更新` : jobRemoteSummary(job))}
              </p>
              <details>
                <summary>查看追溯信息</summary>
                <dl className="generation-job-trace">
                  <div><dt>任务编号</dt><dd>{job.id}</dd></div>
                  <div><dt>远程／结果</dt><dd>{jobRemoteSummary(job)}</dd></div>
                  {retryParent && <div><dt>上一次任务</dt><dd>{retryParent}</dd></div>}
                  {retryRoot && <div><dt>重试根任务</dt><dd>{retryRoot}</dd></div>}
                </dl>
              </details>
            </div>
            <div className="generation-job-actions">
              {canSafelyQuery(job) && <button type="button" onClick={onRefresh}>查询原任务</button>}
              {canRetry(job, jobs) && !retryingJobIds.has(job.id) && (
                <button type="button" className="primary-button" onClick={() => onRetry(job)}>
                  {job.status === "queued" ? "确认重试" : "按原请求重试"}
                </button>
              )}
              {retryingJobIds.has(job.id) && <span role="status">正在建立重试…</span>}
            </div>
          </article>
        );
      })}
    </section>
  );
}
