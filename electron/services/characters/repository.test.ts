import { expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioDatabase } from '../../db/client';
import { CharacterProfileRepository } from './repository';
import { AssetRepository } from '../assets/repository';
import { CHARACTER_SLOTS } from '../../../src/shared/character-slots';

const card = { intent: '角色测试', subject: '成年女性', identityAnchor: '', bodyAndWardrobe: '', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '', avoid: '', aspectRatio: '2:3' as const, referenceAssetIds: [] };
const readyPortrait = (database: StudioDatabase, repository: CharacterProfileRepository, profileId: string) => {
  database.database.prepare("INSERT INTO assets (id, type, name, managed_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at) VALUES ('portrait-1', 'image', '定妆照', '/tmp/portrait.png', 'portrait-hash', 'image/png', 'authorized', 'confirmed', '{}', 'now', 'now')").run();
  database.database.prepare("INSERT INTO asset_collections (id, character_profile_id, kind, name, created_at, updated_at) VALUES ('portrait-pack', ?, 'character', '角色包', 'now', 'now')").run(profileId);
  database.database.prepare("INSERT INTO asset_collection_members (collection_id, asset_id, created_at) VALUES ('portrait-pack', 'portrait-1', 'now')").run();
  for (const slot of CHARACTER_SLOTS.filter((item) => item.requiredFor.includes('portrait')))
    repository.upsertFact(profileId, { slotKey: slot.key, value: slot.label, state: 'confirmed', evidence: slot.visualEvidence ? [{ assetId: 'portrait-1' }] : [] });
};

it('保存可跨场景复用的角色档案与参考资产锚点', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-character-')), 'db.sqlite'));
  const profile = new CharacterProfileRepository(database).create({ name: '蝶灵', card: { intent: '角色测试', subject: '成年女性', identityAnchor: '黑色长发', bodyAndWardrobe: '月白礼服', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '真人感', avoid: '', aspectRatio: '9:16', referenceAssetIds: ['ref-1'] } });
  expect(profile.card.referenceAssetIds).toEqual(['ref-1']);
  expect(new CharacterProfileRepository(database).list()).toEqual([expect.objectContaining({ id: profile.id, name: '蝶灵' })]);
  database.close();
});

it('角色档案可按角色组和创作状态管理，并能更新而不丢失身份锚点', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-character-')), 'db.sqlite'));
  const repository = new CharacterProfileRepository(database);
  const profile = repository.create({
    name: '蝶灵',
    group: 'lead',
    lifecycle: 'draft',
    card: { intent: '角色测试', subject: '成年女性', identityAnchor: '黑色长发', bodyAndWardrobe: '月白礼服', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '真人感', avoid: '', aspectRatio: '9:16', referenceAssetIds: [] }
  });

  expect(() => repository.update(profile.id, { lifecycle: 'confirmed' })).toThrow(/主参考|肖像/);
  const updated = repository.update(profile.id, { group: 'supporting' });

  expect(updated).toMatchObject({ group: 'supporting', lifecycle: 'draft' });
  expect(updated.card.identityAnchor).toBe('黑色长发');
  database.close();
});

it('角色细项保留来源素材、局部说明和确认状态，允许同一图片支持不同维度', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-character-')), 'db.sqlite'));
  const repository = new CharacterProfileRepository(database);
  const profile = repository.create({ name: '蝶灵', card: { intent: '', subject: '成年女性', identityAnchor: '', bodyAndWardrobe: '', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '', avoid: '', aspectRatio: '2:3', referenceAssetIds: [] } });
  database.database.prepare("INSERT INTO assets (id, type, name, managed_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at) VALUES ('ref-1', 'image', '设定图', '/tmp/ref.png', 'ref-hash', 'image/png', 'authorized', 'confirmed', '{}', 'now', 'now')").run();
  database.database.prepare("INSERT INTO asset_collections (id, character_profile_id, kind, name, created_at, updated_at) VALUES ('pack-1', ?, 'character', '蝶灵资产包', 'now', 'now')").run(profile.id);
  database.database.prepare("INSERT INTO asset_collection_members (collection_id, asset_id, created_at) VALUES ('pack-1', 'ref-1', 'now')").run();

  repository.upsertFact(profile.id, { slotKey: 'face.shape', value: '柔和鹅蛋脸', state: 'confirmed', evidence: [{ assetId: 'ref-1', regionNote: '右上角肖像' }] });
  repository.upsertFact(profile.id, { slotKey: 'hair.style', value: '松散高髻', state: 'draft', evidence: [{ assetId: 'ref-1', regionNote: '发型背面' }] });

  const detail = repository.getDetail(profile.id)!;
  expect(detail.facts).toEqual(expect.arrayContaining([
    expect.objectContaining({ slotKey: 'face.shape', value: '柔和鹅蛋脸', state: 'confirmed', evidence: [{ assetId: 'ref-1', regionNote: '右上角肖像' }] }),
    expect.objectContaining({ slotKey: 'hair.style', state: 'draft', evidence: [{ assetId: 'ref-1', regionNote: '发型背面' }] }),
  ]));
  expect(detail.evidenceAssets).toEqual([expect.objectContaining({ id: 'ref-1' })]);
  expect(() => repository.upsertFact(profile.id, { slotKey: 'view.front', value: '正面', state: 'confirmed', evidence: [] })).toThrow(/角度.*素材/);
  database.close();
});

it('造型与姿势变体分开保存，并阻止未经确认或未归档的素材成为已确认事实', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-character-')), 'db.sqlite'));
  const repository = new CharacterProfileRepository(database);
  const profile = repository.create({ name: '蝶灵', card: { intent: '', subject: '成年女性', identityAnchor: '', bodyAndWardrobe: '', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '', avoid: '', aspectRatio: '2:3', referenceAssetIds: [] } });
  const look = repository.createVariant(profile.id, 'look', '冬季旅行');
  const pose = repository.createVariant(profile.id, 'pose', '奔跑');
  database.database.prepare("INSERT INTO assets (id, type, name, managed_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at) VALUES ('ref-2', 'image', '参考', '/tmp/ref2.png', 'ref-hash-2', 'image/png', 'unknown', 'draft', '{}', 'now', 'now')").run();

  expect(() => repository.upsertFact(profile.id, { slotKey: 'wardrobe.outerwear', variantId: pose.id, value: '羊毛大衣', state: 'confirmed', evidence: [] })).toThrow(/变体类型/);
  expect(() => repository.upsertFact(profile.id, { slotKey: 'wardrobe.outerwear', variantId: look.id, value: '羊毛大衣', state: 'confirmed', evidence: [{ assetId: 'ref-2' }] })).toThrow(/素材.*确认|素材.*归档/);
  repository.upsertFact(profile.id, { slotKey: 'wardrobe.outerwear', variantId: look.id, value: '羊毛大衣', state: 'draft', evidence: [] });
  repository.upsertFact(profile.id, { slotKey: 'wardrobe.underwear', variantId: look.id, value: '', state: 'not_applicable', evidence: [] });
  expect(repository.getDetail(profile.id)?.variants).toEqual(expect.arrayContaining([expect.objectContaining({ id: look.id, name: '冬季旅行' }), expect.objectContaining({ id: pose.id, name: '奔跑' })]));
  expect(repository.getDetail(profile.id)?.facts).toEqual(expect.arrayContaining([expect.objectContaining({ slotKey: 'wardrobe.underwear', variantId: look.id, state: 'not_applicable' })]));
  database.close();
});

it('旧库缺失的角色规格会安全归一化，创建不能绕过角色锁定', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-character-')), 'db.sqlite'));
  const repository = new CharacterProfileRepository(database);
  expect(() => repository.create({ name: '绕过', card, lifecycle: 'confirmed' })).toThrow(/确认|锁定/);
  database.database.prepare("INSERT INTO character_profiles (id, name, card_json, specification_json, created_at, updated_at) VALUES ('legacy-1', '旧角色', ?, '{}', 'now', 'now')").run(JSON.stringify(card));
  expect(repository.get('legacy-1')?.specification.identityLocks).toEqual([]);
  expect(repository.get('legacy-1')?.specification.wardrobeLocks).toEqual([]);
  database.close();
});

it('已锁定角色被修改细项时自动失效，重新锁定会核对拟写入的主参考', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-character-')), 'db.sqlite'));
  const repository = new CharacterProfileRepository(database);
  const profile = repository.create({ name: '定妆角色', card });
  readyPortrait(database, repository, profile.id);
  database.database.prepare("INSERT INTO assets (id, type, name, managed_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at) VALUES ('bad-1', 'image', '未授权', '/tmp/bad.png', 'bad-hash', 'image/png', 'restricted', 'confirmed', '{}', 'now', 'now')").run();
  repository.update(profile.id, { masterAssetId: 'portrait-1', lifecycle: 'confirmed' });
  expect(repository.get(profile.id)?.lifecycle).toBe('confirmed');
  expect(() => repository.update(profile.id, { masterAssetId: 'bad-1', lifecycle: 'confirmed' })).toThrow(/主参考/);
  repository.upsertFact(profile.id, { slotKey: 'face.eyes', value: '待校验的眼睛', state: 'draft', evidence: [] });
  expect(repository.get(profile.id)?.lifecycle).toBe('draft');
  database.close();
});

it('角度证据只接受已归档的图片，不把声音标为正脸', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-character-')), 'db.sqlite'));
  const repository = new CharacterProfileRepository(database);
  const profile = repository.create({ name: '定妆角色', card });
  database.database.prepare("INSERT INTO assets (id, type, name, managed_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at) VALUES ('voice-1', 'audio', '语音', '/tmp/voice.mp3', 'voice-hash', 'audio/mpeg', 'authorized', 'confirmed', '{}', 'now', 'now')").run();
  database.database.prepare("INSERT INTO asset_collections (id, character_profile_id, kind, name, created_at, updated_at) VALUES ('voice-pack', ?, 'character', '角色包', 'now', 'now')").run(profile.id);
  database.database.prepare("INSERT INTO asset_collection_members (collection_id, asset_id, created_at) VALUES ('voice-pack', 'voice-1', 'now')").run();
  expect(() => repository.upsertFact(profile.id, { slotKey: 'view.face_front', value: '正脸', state: 'confirmed', evidence: [{ assetId: 'voice-1' }] })).toThrow(/图片/);
  database.close();
});

it('设定中角色更换主参考也必须经过项目归属、角色归档、审片与授权校验', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-character-')), 'db.sqlite'));
  const repository = new CharacterProfileRepository(database);
  database.database.prepare("INSERT INTO projects (id, name, medium, created_at, updated_at) VALUES ('project-1', '项目一', 'image', 'now', 'now')").run();
  const profile = repository.create({ name: '蝶灵', card, projectId: 'project-1' });
  database.database.prepare("INSERT INTO assets (id, type, name, managed_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at) VALUES ('image-1', 'image', '参考', '/tmp/image.png', 'image-1', 'image/png', 'authorized', 'confirmed', '{}', 'now', 'now')").run();
  expect(() => repository.create({ name: '未归档主图', card, projectId: 'project-1', masterAssetId: 'image-1' })).toThrow(/项目/);
  expect(() => repository.update(profile.id, { masterAssetId: 'image-1' })).toThrow(/项目/);
  database.database.prepare("INSERT INTO project_assets (project_id, asset_id, created_at) VALUES ('project-1', 'image-1', 'now')").run();
  const unassigned = repository.create({ name: '未归档角色', card });
  expect(() => repository.create({ name: '跨项目角色', card, masterAssetId: 'image-1' })).toThrow(/其他项目/);
  expect(() => repository.update(unassigned.id, { masterAssetId: 'image-1' })).toThrow(/其他项目/);
  expect(() => repository.update(profile.id, { masterAssetId: 'image-1' })).toThrow(/主参考.*角色/);
  database.database.prepare("INSERT INTO asset_collections (id, project_id, character_profile_id, kind, name, created_at, updated_at) VALUES ('pack-1', 'project-1', ?, 'character', '角色包', 'now', 'now')").run(profile.id);
  database.database.prepare("INSERT INTO asset_collection_members (collection_id, asset_id, created_at) VALUES ('pack-1', 'image-1', 'now')").run();
  database.database.prepare("DELETE FROM project_assets WHERE project_id = 'project-1' AND asset_id = 'image-1'").run();
  expect(() => repository.update(profile.id, { masterAssetId: 'image-1' })).toThrow(/项目/);
  database.database.prepare("INSERT INTO project_assets (project_id, asset_id, created_at) VALUES ('project-1', 'image-1', 'now')").run();
  expect(repository.update(profile.id, { masterAssetId: 'image-1' }).masterAssetId).toBe('image-1');
  database.database.prepare("UPDATE assets SET rights_status = 'restricted' WHERE id = 'image-1'").run();
  expect(() => repository.update(profile.id, { masterAssetId: 'image-1' })).toThrow(/授权/);
  database.close();
});

it('撤销素材授权若角色状态同步失败，整笔变更回滚', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-character-')), 'db.sqlite'));
  const repository = new CharacterProfileRepository(database);
  const profile = repository.create({ name: '定妆角色', card });
  readyPortrait(database, repository, profile.id);
  repository.update(profile.id, { masterAssetId: 'portrait-1', lifecycle: 'confirmed' });
  database.database.exec("CREATE TRIGGER block_downgrade BEFORE UPDATE OF lifecycle ON character_profiles WHEN NEW.lifecycle = 'draft' BEGIN SELECT RAISE(ABORT, '模拟状态同步失败'); END;");
  expect(() => new AssetRepository(database).updateRights('portrait-1', 'restricted', '授权已撤销')).toThrow(/模拟状态同步失败/);
  expect(database.database.prepare('SELECT rights_status FROM assets WHERE id = ?').get('portrait-1')).toEqual({ rights_status: 'authorized' });
  database.close();
});
