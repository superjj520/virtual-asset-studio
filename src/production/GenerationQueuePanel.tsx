import { useEffect } from "react";
import type { StudioJob } from "../shared/types";
import { classifyGenerationError } from "../shared/generation-errors";
import {
  jobAspectSummary,
  jobCostSummary,
  jobSeedSummary,
  jobFailureCategory,
  jobModelSummary,
  jobProgressSummary,
  jobReferenceSummary,
  jobRemoteSummary,
} from "./job-presentation";

type Props = {
  jobs: StudioJob[];
  retryingJobIds: ReadonlySet<string>;
  onRefresh: () => void;
  onRetry: (job: StudioJob) => void;
  focusedJobId?: string;
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

export function GenerationQueuePanel({ jobs, retryingJobIds, onRefresh, onRetry, focusedJobId }: Props) {
  useEffect(() => {
    if (!focusedJobId) return;
    const card = document.querySelector(`[data-job-id="${focusedJobId}"]`);
    card?.scrollIntoView?.({ block: "center" });
  }, [focusedJobId]);
  const activeCount = jobs.filter((candidate) => candidate.status === "queued" || candidate.status === "in_progress").length;
  return (
    <section className="generation-queue" aria-label="生成任务列表" aria-busy={activeCount > 0}>
      <span className="sr-only" role="status">{activeCount > 0 ? `队列中还有 ${activeCount} 个任务正在处理` : "生成队列已更新"}</span>
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
          <article key={job.id} className={`generation-job-card${job.id === focusedJobId ? " focused" : ""}`} data-job-id={job.id} aria-current={job.id === focusedJobId ? "true" : undefined}>
            <div className="generation-job-main">
              <div className="generation-job-heading">
                <span className={`pattern-status job-${job.status}`}>{statusLabel(job)}</span>
                <div>
                  <h3>{kindLabel(job)}</h3>
                  <p>{job.providerId} · {new Date(job.updatedAt).toLocaleString("zh-CN")}</p>
                </div>
              </div>
              <div className="generation-job-tags">
                {job.kind === "image_generation" && <span>{jobModelSummary(job)}</span>}
                {job.kind === "image_generation" && <span>画幅 {jobAspectSummary(job)}</span>}
                {job.kind === "image_generation" && <span>{jobReferenceSummary(job)}</span>}
                {job.kind === "image_generation" && jobCostSummary(job) && <span>{jobCostSummary(job)}</span>}
                {job.kind === "image_generation" && jobSeedSummary(job) && <span>{jobSeedSummary(job)}</span>}
                {job.retryCount > 0 && <span>第 {job.retryCount} 次重试</span>}
                {category && <span className="job-failure-category">{category}</span>}
              </div>
              <p className={job.error ? "generation-job-error" : "generation-job-summary"}>
                {job.error
                  ? (() => {
                      const info = classifyGenerationError(job.error);
                      return `${info.title}：${info.detail}`;
                    })()
                  : job.status === "in_progress"
                    ? `${jobProgressSummary(job)} · 正在更新`
                    : jobRemoteSummary(job)}
              </p>
              {job.error && <p className="generation-job-action">{classifyGenerationError(job.error).action}</p>}
              {job.error && !classifyGenerationError(job.error).retryable && <p className="generation-job-action" role="status">这类失败不会提供一键重试，避免重复失败或重复扣费。</p>}
              <details>
                <summary>查看追溯信息</summary>
                <dl className="generation-job-trace">
                  <div><dt>任务编号</dt><dd>{job.id}</dd></div>
                  <div><dt>模型</dt><dd>{jobModelSummary(job)}</dd></div>
                  <div><dt>远程／结果</dt><dd>{jobRemoteSummary(job)}</dd></div>
                  {jobCostSummary(job) && <div><dt>预计成本</dt><dd>{jobCostSummary(job)}</dd></div>}
                  {jobSeedSummary(job) && <div><dt>随机种子</dt><dd>{jobSeedSummary(job)}</dd></div>}
                  {retryParent && <div><dt>上一次任务</dt><dd>{retryParent}</dd></div>}
                  {retryRoot && <div><dt>重试根任务</dt><dd>{retryRoot}</dd></div>}
                </dl>
              </details>
            </div>
            <div className="generation-job-actions">
              {canSafelyQuery(job) && <button type="button" onClick={onRefresh}>查询原任务</button>}
              {canRetry(job, jobs) && (!job.error || job.error.includes("应用关闭前任务中断") || classifyGenerationError(job.error).retryable) && !retryingJobIds.has(job.id) && (
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
