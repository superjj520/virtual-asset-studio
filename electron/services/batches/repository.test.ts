import { expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioDatabase } from '../../db/client';
import { GenerationBatchRepository } from './repository';
import { CreativeTaskRepository } from '../tasks/repository';
import { ProjectRepository } from '../projects/repository';

it('批量任务保留所属创作任务、每个候选的审核前状态与成本预估', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-batch-')), 'studio.sqlite'));
  const batches = new GenerationBatchRepository(database);
  const project = new ProjectRepository(database).create('测试项目', 'image');
  const task = new CreativeTaskRepository(database).create({ projectId: project.id, name: '夜景角色定妆', objective: '测试候选场景', card: { intent: '角色定妆', subject: '成年女性', identityAnchor: '黑发', bodyAndWardrobe: '', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '真人感', avoid: '', aspectRatio: '9:16', referenceAssetIds: [] } });
  const batch = batches.create({ name: '夜景角色组', projectId: project.id, creativeTaskId: task.id, providerId: 'flux', aspectRatio: '9:16', estimatedCostUsd: 0.08, variants: [{ label: '霓虹街头', prompt: '锁定人物，夜景霓虹街头' }, { label: '雨后玻璃', prompt: '锁定人物，雨后玻璃温室' }] });
  expect(batch.creativeTaskId).toBe(task.id);
  expect(batch.variants).toHaveLength(2);
  expect(batch.variants.every((item) => item.status === 'planned')).toBe(true);
  expect(batches.plannedSpendSince('2000-01-01T00:00:00.000Z')).toBe(0.08);
  expect(batches.updateVariant(batch.variants[0].id, { status: 'completed' }).status).toBe('completed');
  database.close();
});

it('批量任务只能被一个调用者原子认领，避免重复点击重复收费', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-batch-lock-')), 'studio.sqlite'));
  const batches = new GenerationBatchRepository(database);
  const batch = batches.create({ name: '幂等测试', providerId: 'flux', aspectRatio: '1:1', variants: [{ label: '合成静物', prompt: '蓝色花瓶' }] });

  expect(batches.claimForRun(batch.id)?.status).toBe('running');
  expect(batches.claimForRun(batch.id)).toBeUndefined();
  database.close();
});

it('应用重启时运行中的批次标记为中断，不把未核对变体静默改回待生成', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-batch-interrupted-')), 'studio.sqlite'));
  const batches = new GenerationBatchRepository(database);
  const batch = batches.create({ name: '中断恢复', providerId: 'flux', aspectRatio: '1:1', variants: [{ label: '候选', prompt: '静物' }] });
  batches.claimForRun(batch.id);
  expect(batches.recoverInterrupted()).toBe(1);
  expect(batches.get(batch.id)).toMatchObject({ status: 'interrupted', variants: [{ status: 'planned' }] });
  database.close();
});
