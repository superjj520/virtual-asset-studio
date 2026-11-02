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
  const batch = batches.create({ name: '夜景角色组', projectId: project.id, creativeTaskId: task.id, providerId: 'flux', modelId: 'flux-1.1-pro', aspectRatio: '9:16', referenceAssetIds: ['master-1', 'detail-2'], referenceBindings: [{ assetId: 'master-1', role: 'face', priority: 'primary' }, { assetId: 'detail-2', role: 'wardrobe', priority: 'support' }], estimatedCostUsd: 0.08, variants: [{ label: '霓虹街头', prompt: '锁定人物，夜景霓虹街头' }, { label: '雨后玻璃', prompt: '锁定人物，雨后玻璃温室' }] });
  expect(batch.creativeTaskId).toBe(task.id);
  expect(batch.modelId).toBe('flux-1.1-pro');
  expect(batch.referenceAssetIds).toEqual(['master-1', 'detail-2']);
  expect(batch.referenceBindings).toEqual([{ assetId: 'master-1', role: 'face', priority: 'primary' }, { assetId: 'detail-2', role: 'wardrobe', priority: 'support' }]);
  expect(batch.variants).toHaveLength(2);
  expect(batch.variants.every((item) => item.status === 'planned')).toBe(true);
  expect(batches.plannedSpendSince('2000-01-01T00:00:00.000Z')).toBe(0.08);
  const completedVariant = batches.updateVariant(batch.variants[0].id, {
    status: 'completed',
    actualCostUsd: 0.006,
    actualWidth: 1024,
    actualHeight: 1536,
  });
  expect(completedVariant.status).toBe('completed');
  expect(completedVariant.actualCostUsd).toBe(0.006);
  expect(completedVariant.actualWidth).toBe(1024);
  expect(batches.get(batch.id)?.actualCostUsd).toBe(0.006);

  batches.updateStatus(batch.id, 'partially_failed');
  expect(batches.claimForRun(batch.id)?.status).toBe('running');
  expect(batches.claimForRun(batch.id)).toBeUndefined();
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

it('批量任务能记住深度图，重启后还在，出图时才送得出去', () => {
  const filename = join(mkdtempSync(join(tmpdir(), 'studio-batch-depth-')), 'studio.sqlite');
  const database = new StudioDatabase(filename);
  const batches = new GenerationBatchRepository(database);
  const batch = batches.create({ name: '带深度的批次', providerId: 'comfyui', aspectRatio: '9:16', depthAssetId: 'depth-7', variants: [{ label: '候选一', prompt: 'p' }] });
  expect(batch.depthAssetId).toBe('depth-7');
  database.close();

  // 重新打开同一个库，确认这一列真的落盘了、不是只存在内存里
  const reopened = new StudioDatabase(filename);
  const again = new GenerationBatchRepository(reopened).get(batch.id);
  expect(again?.depthAssetId).toBe('depth-7');
  reopened.close();
});

it('没挂深度图时这个字段是空的，不会残留上一次的值', () => {
  const filename = join(mkdtempSync(join(tmpdir(), 'studio-batch-migrate-')), 'studio.sqlite');
  const database = new StudioDatabase(filename);
  const batches = new GenerationBatchRepository(database);
  const batch = batches.create({ name: '没有深度的批次', providerId: 'flux', aspectRatio: '1:1', variants: [{ label: '候选一', prompt: 'p' }] });
  expect(batch.depthAssetId).toBeUndefined();
  database.close();
});
