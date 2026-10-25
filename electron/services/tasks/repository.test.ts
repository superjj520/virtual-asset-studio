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
