import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { StudioDatabase } from '../../db/client';
import { ProjectRepository } from '../projects/repository';
import { CreativeRecipeRepository } from './repository';
import { CreativeTaskRepository } from '../tasks/repository';

const paths: string[] = [];
afterEach(() => paths.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

describe('CreativeRecipeRepository', () => {
  it('保存可复用配方并保留创作卡、提示词和验证状态', () => {
    const root = mkdtempSync(join(tmpdir(), 'studio-recipe-'));
    paths.push(root);
    const database = new StudioDatabase(join(root, 'studio.sqlite'));
    const repository = new CreativeRecipeRepository(database);
    const project = new ProjectRepository(database).create('测试项目', 'image');
    const task = new CreativeTaskRepository(database).create({
      projectId: project.id,
      name: '夜色角色定妆',
      objective: '建立角色夜景定妆母版',
      card: { intent: '人物肖像', subject: '成年女性', identityAnchor: '', bodyAndWardrobe: '', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '', avoid: '', aspectRatio: '9:16', referenceAssetIds: [] },
    });

    const recipe = repository.create({
      name: '夜色东方人像', projectId: project.id, creativeTaskId: task.id, providerId: 'openai', purpose: '角色定妆',
      card: { intent: '人物肖像', subject: '成年女性', identityAnchor: '', bodyAndWardrobe: '', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '', avoid: '', aspectRatio: '9:16', referenceAssetIds: [] },
      prompt: '人物主体：成年女性；场景：深蓝夜景', negative: '水印', sourceAssetIds: ['asset-1'],
    });

    expect(recipe.status).toBe('draft');
    expect(repository.list(project.id)).toMatchObject([{ name: '夜色东方人像', purpose: '角色定妆', creativeTaskId: task.id, providerId: 'openai', sourceAssetIds: ['asset-1'] }]);
  });
});
