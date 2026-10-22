import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { StudioDatabase } from '../../db/client';
import { ProjectRepository } from '../projects/repository';
import { CreativeRecipeRepository } from './repository';
import { CreativeTaskRepository } from '../tasks/repository';
import { AssetRepository } from '../assets/repository';
import { ImageReviewRepository } from '../reviews/repository';

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
      applicability: '同一角色的写实夜景', invalidationConditions: ['更换角色身份', '切换动漫风格'],
      card: { intent: '人物肖像', subject: '成年女性', identityAnchor: '', bodyAndWardrobe: '', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '', avoid: '', aspectRatio: '9:16', referenceAssetIds: [] },
      prompt: '人物主体：成年女性；场景：深蓝夜景', negative: '水印', sourceAssetIds: ['asset-1'],
    });

    expect(recipe.status).toBe('draft');
    expect(repository.list(project.id)).toMatchObject([{ name: '夜色东方人像', purpose: '角色定妆', applicability: '同一角色的写实夜景', invalidationConditions: ['更换角色身份', '切换动漫风格'], creativeTaskId: task.id, providerId: 'openai', sourceAssetIds: ['asset-1'] }]);
  });

  it('只有同一来源任务的已通过审片成图才能验证配方', () => {
    const root = mkdtempSync(join(tmpdir(), 'studio-recipe-review-'));
    paths.push(root);
    const database = new StudioDatabase(join(root, 'studio.sqlite'));
    const projects = new ProjectRepository(database);
    const project = projects.create('测试项目', 'image');
    const task = new CreativeTaskRepository(database).create({
      projectId: project.id, name: '角色定妆', objective: '验证配方',
      card: { intent: '人物肖像', subject: '成年女性', identityAnchor: '', bodyAndWardrobe: '', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '', avoid: '', aspectRatio: '2:3', referenceAssetIds: [] },
    });
    const asset = new AssetRepository(database).createOrGet({
      type: 'image', name: '通过成图', managedPath: join(root, 'approved.png'), sourcePath: 'generated://job/1', sha256: 'approved-image',
      mediaType: 'image/png', rightsStatus: 'authorized', confirmation: 'draft', metadata: { rightsReview: 'approved', rightsReviewNote: '已核实' },
    }).asset;
    projects.attachAsset(project.id, asset.id);
    const review = new ImageReviewRepository(database).create({
      projectId: project.id, assetId: asset.id, creativeTaskId: task.id, decision: 'approved',
      scores: { identity: 5, scene: 4, realism: 4, composition: 5, technical: 4 },
    });
    const repository = new CreativeRecipeRepository(database);
    const recipe = repository.create({
      name: '通过配方', projectId: project.id, creativeTaskId: task.id, providerId: 'gemini', purpose: '角色定妆',
      applicability: '同一角色定妆', invalidationConditions: ['更换角色身份'],
      card: task.card, prompt: '写实角色', negative: '水印', sourceAssetIds: [],
    });

    expect(() => repository.updateStatus(recipe.id, 'validated', '用户口头确认')).toThrow('必须绑定一条已通过的图片审片记录');
    expect(repository.updateStatus(recipe.id, 'validated', review.id)).toMatchObject({
      status: 'validated', evidence: [expect.stringContaining('通过成图')],
    });
  });

  it('缺少适用条件或失效条件时不能验证配方', () => {
    const root = mkdtempSync(join(tmpdir(), 'studio-recipe-boundary-'));
    paths.push(root);
    const database = new StudioDatabase(join(root, 'studio.sqlite'));
    const project = new ProjectRepository(database).create('边界测试项目', 'image');
    const repository = new CreativeRecipeRepository(database);
    const recipe = repository.create({
      name: '缺少边界的配方', projectId: project.id, purpose: '验证状态门禁',
      applicability: '', invalidationConditions: [],
      card: { intent: '人物肖像', subject: '成年女性', identityAnchor: '', bodyAndWardrobe: '', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '', avoid: '', aspectRatio: '2:3', referenceAssetIds: [] },
      prompt: '写实人物肖像', negative: '水印', sourceAssetIds: [],
    });

    expect(() => repository.updateStatus(recipe.id, 'validated', 'review-id')).toThrow('请先补齐适用条件和失效条件');
    expect(repository.list(project.id)[0].status).toBe('draft');
  });
});
