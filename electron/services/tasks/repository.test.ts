import { expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioDatabase } from '../../db/client';
import { CreativeTaskRepository } from './repository';
import { ProjectRepository } from '../projects/repository';
import { AssetRepository } from '../assets/repository';
import { CharacterProfileRepository } from '../characters/repository';

const card = {
  intent: '角色定妆',
  subject: '成年女性',
  identityAnchor: '黑色长发',
  bodyAndWardrobe: '',
  expressionAndPose: '',
  scene: '',
  lighting: '',
  camera: '',
  style: '真人感',
  avoid: '',
  aspectRatio: '9:16',
  referenceAssetIds: [] as string[],
  characterCore: {
    roleId: 'oriental_lead',
    personalityId: 'gentle',
    voiceId: 'mature',
    relationshipId: 'partner',
    interestId: 'travel',
    performanceId: 'dialogue',
  },
  candidatePlan: [
    { id: 'series_base', label: '系列基准', directive: '锁定角色基线' },
    { id: 'action_moment', label: '动作瞬间', directive: '保持角色一致并改变动作' },
  ],
};

it('创作任务连接创作基线和生产结果，并按状态回到审片流程', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-task-')), 'db.sqlite'));
  const repository = new CreativeTaskRepository(database);
  const project = new ProjectRepository(database).create('测试项目', 'image');
  const asset = new AssetRepository(database).createOrGet({ type: 'image', name: '候选图', managedPath: '/tmp/candidate.png', sha256: 'task-test-asset', mediaType: 'image/png', rightsStatus: 'original', metadata: {} }).asset;
  const task = repository.create({ name: '蝶灵温室定妆', objective: '做真人感温室定妆图', card, projectId: project.id, collectionIds: ['角色资产包', '温室场景包'] });
  const character = new CharacterProfileRepository(database).create({ name: '蝶灵', card, projectId: project.id });

  const updated = repository.update(task.id, { characterProfileId: character.id, status: 'review', resultAssetId: asset.id });

  expect(updated).toMatchObject({ projectId: project.id, characterProfileId: character.id, status: 'review', resultAssetId: asset.id, collectionIds: ['角色资产包', '温室场景包'] });
  expect(updated.card.candidatePlan?.map((item) => item.id)).toEqual(['series_base', 'action_moment']);
  expect(updated.card.characterCore).toEqual(card.characterCore);
  expect(repository.list(project.id)).toHaveLength(1);
  database.close();
});

it('同一毫秒内建的任务按 created_at 与 id 稳定排序，不会每次刷新乱跳', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-task-order-')), 'db.sqlite'));
  const repository = new CreativeTaskRepository(database);
  const created = [1, 2, 3, 4, 5, 6, 7, 8].map((index) => repository.create({
    name: `任务 ${index}`,
    objective: '验证排序',
    status: 'draft',
    card,
  }));

  // 把 8 个任务的 updated_at 压成同一毫秒，模拟批量创建
  const stamp = '2026-11-02T09:00:00.000Z';
  const statement = database.database.prepare('UPDATE creative_tasks SET updated_at = ?');
  statement.run(stamp);
  database.database.prepare('UPDATE creative_tasks SET created_at = ?').run(stamp);

  const first = repository.list().map((task) => task.id);
  const second = repository.list().map((task) => task.id);
  expect(first).toEqual(second);
  expect(first).toHaveLength(8);
  // id DESC 兜底：全部时间戳相同时按 id 倒序
  expect(first).toEqual([...created].map((task) => task.id).sort().reverse());
});
