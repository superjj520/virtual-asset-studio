import { expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioDatabase } from '../../db/client';
import { CreativeTaskRepository } from './repository';
import { ProjectRepository } from '../projects/repository';
import { AssetRepository } from '../assets/repository';

const card = { intent: '角色定妆', subject: '成年女性', identityAnchor: '黑色长发', bodyAndWardrobe: '', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '真人感', avoid: '', aspectRatio: '9:16', referenceAssetIds: [] as string[] };

it('创作任务连接创作基线和生产结果，并按状态回到审片流程', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-task-')), 'db.sqlite'));
  const repository = new CreativeTaskRepository(database);
  const project = new ProjectRepository(database).create('测试项目', 'image');
  const asset = new AssetRepository(database).createOrGet({ type: 'image', name: '候选图', managedPath: '/tmp/candidate.png', sha256: 'task-test-asset', mediaType: 'image/png', rightsStatus: 'original', metadata: {} }).asset;
  const task = repository.create({ name: '蝶灵温室定妆', objective: '做真人感温室定妆图', card, projectId: project.id, collectionIds: ['角色资产包', '温室场景包'] });

  const updated = repository.update(task.id, { status: 'review', resultAssetId: asset.id });

  expect(updated).toMatchObject({ projectId: project.id, status: 'review', resultAssetId: asset.id, collectionIds: ['角色资产包', '温室场景包'] });
  expect(repository.list(project.id)).toHaveLength(1);
  database.close();
});
