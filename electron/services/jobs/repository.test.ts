import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { StudioDatabase } from '../../db/client';
import { JobRepository } from './repository';
import { ProjectRepository } from '../projects/repository';

const databases: StudioDatabase[] = [];
afterEach(() => databases.splice(0).forEach((database) => database.close()));

it('任务保留请求、状态和结果', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'vas-job-')), 'studio.sqlite'));
  databases.push(database);
  const jobs = new JobRepository(database);
  const project = new ProjectRepository(database).getOrCreateLibraryProject();
  const created = jobs.create({ projectId: project.id, kind: 'image_to_video', providerId: 'openai', request: { prompt: '微风吹动发丝' } });
  const completed = jobs.update(created.id, { status: 'completed', result: { remoteId: 'video_123' } });
  expect(completed.result?.remoteId).toBe('video_123');
  const interrupted = jobs.create({ projectId: project.id, kind: 'image_generation', providerId: 'flux', request: { prompt: '测试恢复' } });
  jobs.update(interrupted.id, { status: 'in_progress' });
  expect(jobs.recoverInterrupted()).toBe(1);
  expect(jobs.get(interrupted.id)?.status).toBe('queued');
  expect(jobs.list()).toHaveLength(2);
});

it('视频轮询失败只更新状态与错误，不抹掉已获得的远程编号', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'vas-job-')), 'studio.sqlite'));
  databases.push(database);
  const jobs = new JobRepository(database);
  const project = new ProjectRepository(database).getOrCreateLibraryProject();
  const created = jobs.create({ projectId: project.id, kind: 'image_to_video', providerId: 'openai', request: { prompt: '保留远程关联' } });
  jobs.update(created.id, { status: 'in_progress', result: { remoteId: 'video_remote_1', progress: 20 } });
  const unknown = jobs.update(created.id, { status: 'unknown', error: '网络暂时不可达' });
  expect(unknown.result).toMatchObject({ remoteId: 'video_remote_1', progress: 20 });
  expect(unknown.error).toBe('网络暂时不可达');
});

it('应用重启时有远程编号的视频进入未知状态而不是盲目重排队', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'vas-job-')), 'studio.sqlite'));
  databases.push(database);
  const jobs = new JobRepository(database);
  const project = new ProjectRepository(database).getOrCreateLibraryProject();
  const created = jobs.create({ projectId: project.id, kind: 'image_to_video', providerId: 'openai', status: 'in_progress', request: { prompt: '重启恢复' } });
  jobs.update(created.id, { status: 'in_progress', result: { remoteId: 'remote-after-restart' } });
  expect(jobs.recoverInterrupted()).toBe(1);
  expect(jobs.get(created.id)).toMatchObject({ status: 'unknown', result: { remoteId: 'remote-after-restart' } });
});

it('应用重启时有远程编号的图片继续保持未知状态，不创建新的排队请求', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'vas-job-')), 'studio.sqlite'));
  databases.push(database);
  const jobs = new JobRepository(database);
  const project = new ProjectRepository(database).getOrCreateLibraryProject();
  const created = jobs.create({ projectId: project.id, kind: 'image_generation', providerId: 'fal', status: 'in_progress', request: { prompt: '重启恢复图片' } });
  jobs.update(created.id, { status: 'in_progress', result: { remoteTask: { requestId: 'image-remote-1', statusUrl: 'https://fal/status', responseUrl: 'https://fal/result', model: 'fal-ai/flux/schnell' } } });
  expect(jobs.recoverInterrupted()).toBe(1);
  expect(jobs.get(created.id)).toMatchObject({ status: 'unknown', result: { remoteTask: { requestId: 'image-remote-1' } } });
});

it('提交中的视频作业不会以 queued 假装等待，重启时进入未知状态', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'vas-job-')), 'studio.sqlite'));
  databases.push(database);
  const jobs = new JobRepository(database);
  const project = new ProjectRepository(database).getOrCreateLibraryProject();
  const created = jobs.create({ projectId: project.id, kind: 'image_to_video', providerId: 'openai', status: 'in_progress', request: { prompt: '提交态' } });
  expect(created.status).toBe('in_progress');
  expect(jobs.recoverInterrupted()).toBe(1);
  expect(jobs.get(created.id)?.status).toBe('unknown');
});

it('重试任务保留根任务并递增次数，且同一失败任务不能重复创建直接重试', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'vas-job-')), 'studio.sqlite'));
  databases.push(database);
  const jobs = new JobRepository(database);
  const project = new ProjectRepository(database).getOrCreateLibraryProject();
  const original = jobs.create({ projectId: project.id, kind: 'image_generation', providerId: 'gemini', request: { prompt: '角色主图' } });
  const retry = jobs.create({ projectId: project.id, kind: 'image_generation', providerId: 'gemini', request: { prompt: '角色主图', retryOfJobId: original.id } });
  const retryAgain = jobs.create({ projectId: project.id, kind: 'image_generation', providerId: 'gemini', request: { prompt: '角色主图', retryOfJobId: retry.id } });

  expect(retry).toMatchObject({ retryCount: 1, request: { retryOfJobId: original.id, retryRootJobId: original.id } });
  expect(retryAgain).toMatchObject({ retryCount: 2, request: { retryOfJobId: retry.id, retryRootJobId: original.id } });
  expect(() => jobs.create({ projectId: project.id, kind: 'image_generation', providerId: 'gemini', request: { prompt: '重复', retryOfJobId: original.id } }))
    .toThrow('该任务已经建立过重试');
});

it('拒绝跨项目或缺失父任务的伪重试链', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'vas-job-')), 'studio.sqlite'));
  databases.push(database);
  const jobs = new JobRepository(database);
  const project = new ProjectRepository(database).getOrCreateLibraryProject();
  const original = jobs.create({ projectId: project.id, kind: 'image_generation', providerId: 'gemini', request: { prompt: '角色主图' } });

  expect(() => jobs.create({ projectId: 'other-project', kind: 'image_generation', providerId: 'gemini', request: { prompt: '跨项目', retryOfJobId: original.id } }))
    .toThrow('同一项目和任务类型');
  expect(() => jobs.create({ projectId: project.id, kind: 'image_generation', providerId: 'gemini', request: { prompt: '缺失来源', retryOfJobId: 'missing' } }))
    .toThrow('原始任务不存在');
});
