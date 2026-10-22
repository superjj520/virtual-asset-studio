import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { StudioDatabase } from '../../db/client';
import { AssetRepository } from './repository';
import { ProjectRepository } from '../projects/repository';
import { RelationshipRepository } from '../relationships/repository';
import type { ProjectBrief } from '../../../src/shared/types';

const directories: string[] = [];

const createStores = () => {
  const directory = mkdtempSync(join(tmpdir(), 'virtual-asset-studio-'));
  directories.push(directory);
  const database = new StudioDatabase(join(directory, 'studio.sqlite'));
  return {
    assets: new AssetRepository(database),
    projects: new ProjectRepository(database),
    relationships: new RelationshipRepository(database)
  };
};

afterEach(() => {
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

describe('AssetRepository', () => {
  it('以哈希去重、保留受管路径并支持项目和关系追溯', () => {
    const { assets, projects, relationships } = createStores();
    const first = assets.createOrGet({
      type: 'reference_image',
      name: '人物正脸参考',
      managedPath: '/managed/a.png',
      sourcePath: '/original/a.png',
      sha256: 'same-hash',
      mediaType: 'image/png',
      rightsStatus: 'authorized',
      metadata: { width: 1000, height: 1500 }
    });
    const duplicate = assets.createOrGet({
      type: 'reference_image',
      name: '重复导入',
      managedPath: '/managed/duplicate.png',
      sourcePath: '/original/duplicate.png',
      sha256: 'same-hash',
      mediaType: 'image/png',
      rightsStatus: 'authorized',
      metadata: {}
    });
    const scene = assets.createOrGet({
      type: 'scene',
      name: '夜间办公室',
      managedPath: '/managed/scene.png',
      sha256: 'scene-hash',
      mediaType: 'image/png',
      rightsStatus: 'original',
      metadata: {}
    });

    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(duplicate.asset.id).toBe(first.asset.id);
    expect(first.asset.managedPath).toBe('/managed/a.png');

    const project = projects.create('漫剧试验', 'comic_drama');
    projects.attachAsset(project.id, first.asset.id);
    const relationship = relationships.create(first.asset.id, scene.asset.id, 'appears_in');

    expect(projects.listAssets(project.id).map((asset) => asset.id)).toEqual([first.asset.id]);
    expect(relationships.listForAsset(first.asset.id)).toEqual([relationship]);
  });

  it('汇总项目工作区的创作简报、资产健康度和已锁定母版', () => {
    const { assets, projects } = createStores();
    const project = projects.create('雨夜角色企划', 'comic_drama');
    const brief: ProjectBrief = {
      goal: '建立可用于漫剧的成年女性角色资产组',
      audience: '竖屏漫剧观众',
      visualWorld: '电影感东方都市幻想',
      delivery: '角色定妆、三张场景图与首个视频镜头',
      acceptance: '同一角色在不同场景中保持可辨识的脸部、发型与服装锚点',
    };
    projects.updateBrief(project.id, brief);
    const master = assets.createOrGet({
      type: 'image', name: '角色主参考', managedPath: '/managed/master.png', sha256: 'master-hash',
      mediaType: 'image/png', rightsStatus: 'original', confirmation: 'confirmed',
      metadata: { role: 'master', dna: { identity: ['冷静杏眼', '黑色长发'] } },
    }).asset;
    const candidate = assets.createOrGet({
      type: 'image', name: '雨夜候选', managedPath: '/managed/candidate.png', sha256: 'candidate-hash',
      mediaType: 'image/png', rightsStatus: 'original', confirmation: 'draft', metadata: {},
    }).asset;
    projects.attachAsset(project.id, master.id);
    projects.attachAsset(project.id, candidate.id);
    assets.setProjectMaster(project.id, master.id, true);

    const workspace = projects.getWorkspace(project.id);

    expect(workspace.project.brief).toEqual(brief);
    expect(workspace.health).toMatchObject({ assetCount: 2, confirmedAssetCount: 1, candidateAssetCount: 1, masterAssetCount: 1 });
    expect(workspace.masterAssets.map((asset) => asset.id)).toEqual([master.id]);
    expect(workspace.pipeline.map((stage) => [stage.key, stage.status])).toEqual([
      ['creation', 'ready'], ['assets', 'complete'], ['production', 'complete'], ['templates', 'not_started'],
    ]);
    expect(workspace.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'review', count: 1, target: 'review' }),
    ]));
    expect(workspace.recommendedNextAction).toContain('候选待审片');
  });

  it('空项目明确标记四域未开始，并把缺失简报作为第一处理项', () => {
    const { projects } = createStores();
    const project = projects.create('新企划', 'image');

    const workspace = projects.getWorkspace(project.id);

    expect(workspace.pipeline).toHaveLength(4);
    expect(workspace.pipeline.every((stage) => stage.status === 'not_started')).toBe(true);
    expect(workspace.blockers[0]).toMatchObject({ code: 'brief', count: 5, target: 'workspace' });
    expect(workspace.recommendedNextAction).toContain('简报待补齐');
  });

  it('将已确认资产设为母版时保留原有资产 DNA', () => {
    const { assets, projects } = createStores();
    const asset = assets.createOrGet({
      type: 'image', name: '角色定妆', managedPath: '/managed/look.png', sha256: 'look-hash',
      mediaType: 'image/png', rightsStatus: 'original', confirmation: 'confirmed',
      metadata: { dna: { identity: ['黑色长发'] }, width: 1024 },
    }).asset;

    const project = projects.create('母版项目', 'image');
    projects.attachAsset(project.id, asset.id);
    const master = assets.setProjectMaster(project.id, asset.id, true);

    expect(master.metadata).toMatchObject({ dna: { identity: ['黑色长发'] }, width: 1024 });
  });

  it('项目母版彼此隔离，新的锁定不会修改全局资产元数据', () => {
    const { assets, projects } = createStores();
    const first = projects.create('项目甲', 'image');
    const second = projects.create('项目乙', 'image');
    const asset = assets.createOrGet({ type: 'image', name: '共享候选', managedPath: '/managed/shared.png', sha256: 'shared-hash', mediaType: 'image/png', rightsStatus: 'original', confirmation: 'confirmed', metadata: {} }).asset;
    projects.attachAsset(first.id, asset.id);
    projects.attachAsset(second.id, asset.id);
    assets.setProjectMaster(first.id, asset.id, true);
    expect(projects.getWorkspace(first.id).masterAssets.map((item) => item.id)).toEqual([asset.id]);
    expect(projects.getWorkspace(second.id).masterAssets).toEqual([]);
    expect(assets.findById(asset.id)?.metadata.role).toBeUndefined();
  });

  it('生成候选权利未明时须记录人工依据才能改为授权，并同步撤销失效角色锁定', () => {
    const { assets, projects } = createStores();
    const asset = assets.createOrGet({ type: 'image', name: '生成候选', managedPath: '/managed/generated.png', sha256: 'generated-hash', mediaType: 'image/png', rightsStatus: 'unknown', confirmation: 'draft', metadata: { provenance: 'ai_generated' } }).asset;
    expect(() => assets.updateRights(asset.id, 'authorized', '')).toThrow(/依据/);
    expect(() => assets.setProjectMaster('missing-project', asset.id, true)).toThrow(/当前项目|归档/);
    const updated = assets.updateRights(asset.id, 'authorized', '我拥有原始参考图的使用授权，并确认可用于此项目');
    expect(updated.rightsStatus).toBe('authorized');
    expect(updated.metadata).toMatchObject({ rightsReview: 'approved', rightsReviewNote: expect.stringContaining('原始参考图') });
    assets.updateConfirmation(asset.id, 'confirmed');
    const project = projects.create('权利测试', 'image');
    projects.attachAsset(project.id, asset.id);
    expect(assets.setProjectMaster(project.id, asset.id, true).metadata.role).toBeUndefined();
    expect(projects.getWorkspace(project.id).health.masterAssetCount).toBe(1);
    assets.updateRights(asset.id, 'restricted', '权利复核后撤销');
    expect(() => assets.setProjectMaster(project.id, asset.id, true)).toThrow(/授权/);
    expect(projects.getWorkspace(project.id).health.masterAssetCount).toBe(0);
  });
});
