import { expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioDatabase } from '../../db/client';
import { AssetCollectionRepository } from './repository';
import { CharacterProfileRepository } from '../characters/repository';
import { CHARACTER_SLOTS } from '../../../src/shared/character-slots';

it('资产包可按项目和角色归档素材，并在列表中返回资产数量', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-collection-')), 'db.sqlite'));
  const collections = new AssetCollectionRepository(database);
  database.database.prepare("INSERT INTO projects (id, name, medium, created_at, updated_at) VALUES ('project-1', '古风漫剧', 'comic_drama', 'now', 'now')").run();
  database.database.prepare("INSERT INTO assets (id, type, name, managed_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at) VALUES ('asset-1', 'image', '定妆图', '/tmp/master.png', 'hash-1', 'image/png', 'original', 'confirmed', '{}', 'now', 'now')").run();
  database.database.prepare("INSERT INTO character_profiles (id, project_id, name, card_json, specification_json, master_asset_id, created_at, updated_at) VALUES ('character-1', 'project-1', '蝶灵', '{}', '{}', 'asset-1', 'now', 'now')").run();

  const collection = collections.create({
    projectId: 'project-1',
    characterProfileId: 'character-1',
    kind: 'character',
    name: '蝶灵角色包',
    description: '定妆、服装、表情与场景延展统一归档',
  });
  collections.attachAsset(collection.id, 'asset-1', '主参考');

  expect(collections.list('project-1')).toEqual([
    expect.objectContaining({ id: collection.id, name: '蝶灵角色包', assetCount: 1, characterProfileId: 'character-1' }),
  ]);
  expect(collections.getDetail(collection.id)?.assets).toEqual([
    expect.objectContaining({ id: 'asset-1', membershipRole: '主参考' }),
  ]);
  expect(collections.getDetail(collection.id)?.readiness).toEqual({
    status: 'incomplete',
    confirmedAssetCount: 1,
    masterReferenceCount: 1,
    nextAction: expect.stringMatching(/角色档案仍缺.*肖像必需细项/),
    characterCoverage: expect.objectContaining({ status: 'empty', missingRequiredKeys: expect.arrayContaining(['face.shape', 'view.face_front']) }),
    moduleCoverage: expect.objectContaining({
      requiredCount: 5,
      confirmedRequiredCount: 0,
      missingRequiredKeys: expect.arrayContaining(['identity', 'face', 'body', 'hair_skin', 'views']),
    }),
  });
  expect(database.database.prepare("SELECT 1 FROM project_assets WHERE project_id = 'project-1' AND asset_id = 'asset-1'").get()).toBeTruthy();
  database.close();
});

it('资产包成员可以绑定到针对性的模块，并按模块生成完整度', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-collection-')), 'db.sqlite'));
  const collections = new AssetCollectionRepository(database);
  database.database.prepare("INSERT INTO assets (id, type, name, managed_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at) VALUES ('asset-face', 'reference_image', '正面参考', '/tmp/face.png', 'hash-face', 'image/png', 'original', 'confirmed', '{}', 'now', 'now')").run();
  const collection = collections.create({ kind: 'reference', name: '参考包' });
  const detail = collections.attachAsset(collection.id, 'asset-face', '来源图', 'source', '仅用于拆解构图');
  expect(detail.assets[0]).toMatchObject({ membershipRole: '来源图', moduleKey: 'source', notes: '仅用于拆解构图' });
  expect(detail.readiness.moduleCoverage).toMatchObject({ confirmedRequiredCount: 1, missingRequiredKeys: [] });
  database.close();
});

it('资产包不能把其他项目的素材静默带入当前项目', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-collection-')), 'db.sqlite'));
  const collections = new AssetCollectionRepository(database);
  database.database.prepare("INSERT INTO projects (id, name, medium, created_at, updated_at) VALUES ('project-a', '项目甲', 'image', 'now', 'now'), ('project-b', '项目乙', 'image', 'now', 'now')").run();
  database.database.prepare("INSERT INTO assets (id, type, name, managed_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at) VALUES ('asset-other', 'image', '乙项目图片', '/tmp/other.png', 'hash-other', 'image/png', 'original', 'confirmed', '{}', 'now', 'now')").run();
  database.database.prepare("INSERT INTO project_assets (project_id, asset_id, created_at) VALUES ('project-b', 'asset-other', 'now')").run();
  const collection = collections.create({ projectId: 'project-a', kind: 'reference', name: '甲项目参考包' });
  expect(() => collections.attachAsset(collection.id, 'asset-other', '来源图', 'source')).toThrow(/项目/);
  database.close();
});

it('未达到模块和素材基线的资产包不能直接切换为使用中', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-collection-')), 'db.sqlite'));
  const collections = new AssetCollectionRepository(database);
  const collection = collections.create({ kind: 'reference', name: '空参考包' });
  expect(() => collections.update(collection.id, { status: 'active' })).toThrow(/就绪/);
  database.close();
});

it('项目、角色、父包必须归属一致，未授权图不能充当可用主参考', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-collection-')), 'db.sqlite'));
  const collections = new AssetCollectionRepository(database);
  database.database.prepare("INSERT INTO projects (id, name, medium, created_at, updated_at) VALUES ('project-a', '项目甲', 'image', 'now', 'now'), ('project-b', '项目乙', 'image', 'now', 'now')").run();
  database.database.prepare("INSERT INTO assets (id, type, name, managed_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at) VALUES ('asset-bad', 'image', '未授权图片', '/tmp/bad.png', 'bad-hash', 'image/png', 'restricted', 'confirmed', '{}', 'now', 'now')").run();
  database.database.prepare("INSERT INTO character_profiles (id, project_id, name, card_json, master_asset_id, created_at, updated_at) VALUES ('role-a', 'project-a', '人物甲', '{}', 'asset-bad', 'now', 'now')").run();
  expect(() => collections.create({ projectId: 'project-b', characterProfileId: 'role-a', kind: 'character', name: '错项目' })).toThrow(/项目/);
  const parent = collections.create({ projectId: 'project-b', kind: 'reference', name: '乙素材包' });
  expect(() => collections.create({ projectId: 'project-a', parentId: parent.id, kind: 'character', characterProfileId: 'role-a', name: '错父包' })).toThrow(/项目/);
  const collection = collections.create({ projectId: 'project-a', characterProfileId: 'role-a', kind: 'character', name: '甲角色包' });
  collections.attachAsset(collection.id, 'asset-bad', '主参考');
  expect(collections.getDetail(collection.id)?.readiness).toMatchObject({ status: 'incomplete', confirmedAssetCount: 0, masterReferenceCount: 0 });
  database.close();
});

it('撤下角色主参考若状态同步失败，角色包成员关系仍然保留', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-collection-')), 'db.sqlite'));
  const collections = new AssetCollectionRepository(database);
  const roles = new CharacterProfileRepository(database);
  const role = roles.create({ name: '测试角色', card: { intent: '', subject: '成年角色', identityAnchor: '', bodyAndWardrobe: '', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '', avoid: '', aspectRatio: '2:3', referenceAssetIds: [] } });
  database.database.prepare("INSERT INTO assets (id, type, name, managed_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at) VALUES ('asset-1', 'image', '定妆图', '/tmp/master.png', 'hash-1', 'image/png', 'original', 'confirmed', '{}', 'now', 'now')").run();
  const collection = collections.create({ characterProfileId: role.id, kind: 'character', name: '角色包' });
  collections.attachAsset(collection.id, 'asset-1', '主参考');
  for (const slot of CHARACTER_SLOTS.filter((item) => item.requiredFor.includes('portrait')))
    roles.upsertFact(role.id, { slotKey: slot.key, value: slot.label, state: 'confirmed', evidence: slot.visualEvidence ? [{ assetId: 'asset-1' }] : [] });
  roles.update(role.id, { masterAssetId: 'asset-1', lifecycle: 'confirmed' });
  database.database.exec("CREATE TRIGGER block_downgrade BEFORE UPDATE OF lifecycle ON character_profiles WHEN NEW.lifecycle = 'draft' BEGIN SELECT RAISE(ABORT, '模拟同步失败'); END;");
  expect(() => collections.detachAsset(collection.id, 'asset-1')).toThrow(/模拟同步失败/);
  expect(collections.getDetail(collection.id)?.assets.map((asset) => asset.id)).toContain('asset-1');
  database.close();
});
