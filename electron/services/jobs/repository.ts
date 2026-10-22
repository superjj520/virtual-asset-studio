import { randomUUID } from 'node:crypto';
import type { JobKind, JobStatus, StudioJob } from '../../../src/shared/types';
import { StudioDatabase } from '../../db/client';

type JobRow = {
  id: string; project_id: string | null; kind: JobKind; provider_id: string; status: JobStatus; request_json: string; result_json: string | null; error: string | null; retry_count: number; created_at: string; updated_at: string;
};

const mapJob = (row: JobRow): StudioJob => ({
  id: row.id, projectId: row.project_id ?? undefined, kind: row.kind, providerId: row.provider_id, status: row.status,
  request: JSON.parse(row.request_json), result: row.result_json ? JSON.parse(row.result_json) : undefined, error: row.error ?? undefined,
  retryCount: row.retry_count, createdAt: row.created_at, updatedAt: row.updated_at
});

export class JobRepository {
  constructor(private readonly db: StudioDatabase) {}

  create(input: { projectId: string; kind: JobKind; providerId: string; request: Record<string, unknown>; status?: JobStatus }): StudioJob {
    const now = new Date().toISOString();
    const retryOfJobId = typeof input.request.retryOfJobId === 'string' && input.request.retryOfJobId.trim()
      ? input.request.retryOfJobId.trim()
      : undefined;
    const parent = retryOfJobId ? this.get(retryOfJobId) : undefined;
    if (retryOfJobId && !parent) throw new Error('原始任务不存在，不能建立不可追溯的重试。');
    if (parent && (parent.kind !== input.kind || parent.projectId !== input.projectId))
      throw new Error('重试任务必须与原任务属于同一项目和任务类型。');
    if (retryOfJobId) {
      const existing = this.db.database.prepare("SELECT id FROM jobs WHERE json_extract(request_json, '$.retryOfJobId') = ? LIMIT 1").get(retryOfJobId) as { id: string } | undefined;
      if (existing) throw new Error('该任务已经建立过重试，请继续查看现有重试任务。');
    }
    const request = parent
      ? { ...input.request, retryOfJobId: parent.id, retryRootJobId: typeof parent.request.retryRootJobId === 'string' ? parent.request.retryRootJobId : parent.id }
      : input.request;
    const job: StudioJob = { id: randomUUID(), projectId: input.projectId, kind: input.kind, providerId: input.providerId, status: input.status ?? 'queued', request, retryCount: parent ? parent.retryCount + 1 : 0, createdAt: now, updatedAt: now };
    this.db.database.prepare('INSERT INTO jobs (id, project_id, kind, provider_id, status, request_json, retry_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(job.id, job.projectId, job.kind, job.providerId, job.status, JSON.stringify(job.request), job.retryCount, now, now);
    return job;
  }

  get(id: string): StudioJob | undefined {
    const row = this.db.database.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined;
    return row ? mapJob(row) : undefined;
  }

  list(projectId?: string): StudioJob[] {
    const query = projectId ? ['SELECT * FROM jobs WHERE project_id = ? ORDER BY updated_at DESC', projectId] : ['SELECT * FROM jobs ORDER BY updated_at DESC'];
    return (this.db.database.prepare(query[0]).all(...query.slice(1)) as JobRow[]).map(mapJob);
  }

  recoverInterrupted(): number {
    const now = new Date().toISOString();
    const queuedVideo = this.db.database.prepare("UPDATE jobs SET status = 'unknown', error = '视频任务在提交阶段留下等待状态，无法确认服务端是否已接收；禁止盲目重试。', updated_at = ? WHERE status = 'queued' AND kind = 'image_to_video'")
      .run(now).changes;
    const videoUnknown = this.db.database.prepare("UPDATE jobs SET status = 'unknown', error = '应用关闭时视频任务已有远程编号，状态未核实；请查询远程状态，不要重新提交。', updated_at = ? WHERE status = 'in_progress' AND kind = 'image_to_video' AND json_extract(result_json, '$.remoteId') IS NOT NULL")
      .run(now).changes;
    const imageUnknown = this.db.database.prepare("UPDATE jobs SET status = 'unknown', error = '应用关闭时图片任务已有远程编号；请继续查询原任务，不要重新提交。', updated_at = ? WHERE status = 'in_progress' AND kind = 'image_generation' AND json_extract(result_json, '$.remoteTask.requestId') IS NOT NULL")
      .run(now).changes;
    const recoverable = this.db.database.prepare("UPDATE jobs SET status = 'queued', error = '应用关闭前任务中断，可由用户确认后重试。', retry_count = retry_count + 1, updated_at = ? WHERE status = 'in_progress' AND kind != 'image_to_video' AND NOT (kind = 'image_generation' AND json_extract(result_json, '$.remoteTask.requestId') IS NOT NULL)")
      .run(now).changes;
    const videoWithoutRemoteId = this.db.database.prepare("UPDATE jobs SET status = 'unknown', error = '视频提交阶段中断，无法确认服务端是否已接收；禁止盲目重试。', updated_at = ? WHERE status = 'in_progress' AND kind = 'image_to_video' AND json_extract(result_json, '$.remoteId') IS NULL")
      .run(now).changes;
    return queuedVideo + videoUnknown + imageUnknown + recoverable + videoWithoutRemoteId;
  }

  update(id: string, patch: { status: JobStatus; result?: Record<string, unknown> | null; error?: string | null }): StudioJob {
    const now = new Date().toISOString();
    const fields = ['status = ?', 'updated_at = ?'];
    const values: unknown[] = [patch.status, now];
    if (Object.prototype.hasOwnProperty.call(patch, 'result')) {
      fields.push('result_json = ?');
      values.push(patch.result === null ? null : JSON.stringify(patch.result));
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'error')) {
      fields.push('error = ?');
      values.push(patch.error ?? null);
    }
    values.push(id);
    const result = this.db.database.prepare(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    if (result.changes !== 1) throw new Error('任务不存在。');
    return this.get(id)!;
  }
}
