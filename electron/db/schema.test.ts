import { expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { StudioDatabase } from './client';
import { CharacterProfileRepository } from '../services/characters/repository';
import { AssetRepository } from '../services/assets/repository';

it('旧角色库升级后仍可读取，变体必须归属同一角色且删除后无孤儿事实', () => {
  const filename = join(mkdtempSync(join(tmpdir(), 'studio-schema-')), 'legacy.sqlite');
  const old = new Database(filename);
  old.exec("CREATE TABLE character_profiles (id TEXT PRIMARY KEY, project_id TEXT, name TEXT NOT NULL, card_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
  old.prepare("INSERT INTO character_profiles VALUES ('legacy', NULL, '旧角色', '{}', 'now', 'now')").run();
  old.close();
  const database = new StudioDatabase(filename);
  expect(new CharacterProfileRepository(database).get('legacy')?.specification.identityLocks).toEqual([]);
  database.database.prepare("INSERT INTO character_profiles (id, name, card_json, created_at, updated_at) VALUES ('other', '另一角色', '{}', 'now', 'now')").run();
  database.database.prepare("INSERT INTO character_variants (id, profile_id, kind, name, created_at, updated_at) VALUES ('look-1', 'legacy', 'look', '冬装', 'now', 'now')").run();
  const insert = database.database.prepare("INSERT INTO character_facts (id, profile_id, variant_id, slot_key, group_key, label, value, state, created_at, updated_at) VALUES (?, ?, 'look-1', 'wardrobe.top', 'wardrobe', '上衣', '白衣', 'confirmed', 'now', 'now')");
  expect(() => insert.run('wrong-role', 'other')).toThrow();
  insert.run('valid-role', 'legacy');
  database.database.prepare("DELETE FROM character_variants WHERE id = 'look-1'").run();
  expect(database.database.prepare("SELECT id FROM character_facts WHERE id = 'valid-role'").get()).toBeUndefined();
  expect(database.database.pragma('foreign_key_check')).toEqual([]);
  database.close();
});

it('升级旧素材时保留权利审计，未记录授权依据的素材转为待核，并补齐角色包项目归属', () => {
  const filename = join(mkdtempSync(join(tmpdir(), 'studio-rights-upgrade-')), 'legacy.sqlite');
  const original = new StudioDatabase(filename);
  original.database.exec(`
    INSERT INTO projects (id, name, medium, created_at, updated_at) VALUES ('project-1', '角色项目', 'image', 'now', 'now');
    INSERT INTO assets (id, type, name, managed_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at)
      VALUES ('asset-1', 'reference_image', '旧角色参考', '/tmp/old.png', 'hash-1', 'image/png', 'authorized', 'confirmed', '{"rightsReview":"approved"}', 'now', 'now');
    INSERT INTO assets (id, type, name, managed_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at)
      VALUES ('asset-2', 'reference_image', '另一主参考', '/tmp/other.png', 'hash-2', 'image/png', 'authorized', 'confirmed', '{"rightsReview":"approved","rightsReviewNote":"长期授权"}', 'now', 'now');
    INSERT INTO assets (id, type, name, managed_path, source_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at)
      VALUES ('generated-1', 'image', '旧生成图', '/tmp/generated.png', 'generated://job/old', 'hash-3', 'image/png', 'original', 'draft', '{"generatedFromJobId":"old"}', 'now', 'now');
    INSERT INTO character_profiles (id, project_id, name, card_json, master_asset_id, lifecycle, created_at, updated_at)
      VALUES ('profile-1', 'project-1', '蝶灵', '{}', 'asset-1', 'confirmed', 'now', 'now');
    INSERT INTO character_profiles (id, project_id, name, card_json, lifecycle, created_at, updated_at)
      VALUES ('profile-2', 'project-1', '另一角色', '{}', 'confirmed', 'now', 'now');
    UPDATE character_profiles SET master_asset_id = 'asset-2' WHERE id = 'profile-2';
    INSERT INTO character_profiles (id, project_id, name, card_json, master_asset_id, lifecycle, created_at, updated_at)
      VALUES ('profile-3', 'project-1', '缺少细项的旧角色', '{}', 'asset-2', 'confirmed', 'now', 'now');
    INSERT INTO asset_collections (id, project_id, character_profile_id, kind, name, status, created_at, updated_at)
      VALUES ('collection-1', 'project-1', 'profile-1', 'character', '角色资产包', 'active', 'now', 'now');
    INSERT INTO asset_collection_members (collection_id, asset_id, created_at)
      VALUES ('collection-1', 'asset-1', 'now');
    INSERT INTO asset_collections (id, project_id, character_profile_id, kind, name, status, created_at, updated_at)
      VALUES ('collection-2', 'project-1', 'profile-2', 'character', '另一角色资产包', 'active', 'now', 'now');
    INSERT INTO asset_collection_members (collection_id, asset_id, created_at) VALUES ('collection-2', 'asset-2', 'now');
    INSERT INTO asset_collections (id, project_id, character_profile_id, kind, name, status, created_at, updated_at)
      VALUES ('collection-3', 'project-1', 'profile-3', 'character', '未核验的旧角色包', 'active', 'now', 'now');
    INSERT INTO asset_collection_members (collection_id, asset_id, created_at) VALUES ('collection-3', 'asset-2', 'now');
    INSERT INTO character_facts (id, profile_id, slot_key, group_key, label, value, state, created_at, updated_at)
      VALUES ('fact-1', 'profile-2', 'face.shape', 'face', '脸型', '柔和鹅蛋脸', 'confirmed', 'now', 'now');
    INSERT INTO character_fact_evidence (fact_id, asset_id) VALUES ('fact-1', 'asset-1');
    DELETE FROM schema_migrations WHERE version IN (2, 3, 4, 5);
  `);
  original.close();
  const upgraded = new StudioDatabase(filename);
  const asset = upgraded.database.prepare('SELECT rights_status, metadata_json FROM assets WHERE id = ?').get('asset-1') as { rights_status: string; metadata_json: string };
  expect(asset.rights_status).toBe('unknown');
  expect(JSON.parse(asset.metadata_json)).toMatchObject({ previousRightsStatus: 'authorized', rightsReview: 'pending' });
  const generated = new AssetRepository(upgraded).findById('generated-1')!;
  expect(generated).toMatchObject({ rightsStatus: 'unknown', metadata: { provenance: 'ai_generated', previousRightsStatus: 'original' } });
  expect(() => new AssetRepository(upgraded).updateRights('generated-1', 'original', '这是之前生成的图片')).toThrow(/不能直接声明为原创/);
  expect(upgraded.database.prepare('SELECT asset_id FROM project_assets WHERE project_id = ?').all('project-1'))
    .toEqual(expect.arrayContaining([{ asset_id: 'asset-1' }, { asset_id: 'asset-2' }]));
  expect(upgraded.database.prepare('SELECT lifecycle FROM character_profiles WHERE id = ?').get('profile-1')).toEqual({ lifecycle: 'draft' });
  expect(upgraded.database.prepare('SELECT lifecycle FROM character_profiles WHERE id = ?').get('profile-2')).toEqual({ lifecycle: 'draft' });
  expect(upgraded.database.prepare('SELECT lifecycle FROM character_profiles WHERE id = ?').get('profile-3')).toEqual({ lifecycle: 'draft' });
  expect(upgraded.database.prepare('SELECT status FROM asset_collections WHERE id = ?').get('collection-1')).toEqual({ status: 'draft' });
  expect(upgraded.database.prepare('SELECT version FROM schema_migrations WHERE version = 2').get()).toEqual({ version: 2 });
  upgraded.close();
  const earlierMigration = new Database(filename);
  earlierMigration.exec("UPDATE character_profiles SET lifecycle = 'confirmed' WHERE id = 'profile-1'; UPDATE asset_collections SET status = 'active' WHERE id = 'collection-1'; DELETE FROM schema_migrations WHERE version = 3;");
  earlierMigration.close();
  const repaired = new StudioDatabase(filename);
  expect(repaired.database.prepare('SELECT lifecycle FROM character_profiles WHERE id = ?').get('profile-1')).toEqual({ lifecycle: 'draft' });
  expect(repaired.database.prepare('SELECT status FROM asset_collections WHERE id = ?').get('collection-1')).toEqual({ status: 'draft' });
  repaired.close();
});

it('legacy 全局母版只迁移一次且共享资产不会污染多个项目', () => {
  const filename = join(mkdtempSync(join(tmpdir(), 'studio-master-migration-')), 'legacy.sqlite');
  const initial = new StudioDatabase(filename);
  initial.database.exec(`
    INSERT INTO projects (id, name, medium, created_at, updated_at) VALUES ('m1', '项目一', 'image', 'now', 'now');
    INSERT INTO projects (id, name, medium, created_at, updated_at) VALUES ('m2', '项目二', 'image', 'now', 'now');
    INSERT INTO assets (id, type, name, managed_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at)
      VALUES ('shared-master', 'image', '共享旧母版', '/managed/shared.png', 'shared-master-hash', 'image/png', 'original', 'confirmed', '{"role":"master"}', 'now', 'now');
    INSERT INTO assets (id, type, name, managed_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at)
      VALUES ('single-master', 'image', '单项目旧母版', '/managed/single.png', 'single-master-hash', 'image/png', 'original', 'confirmed', '{"role":"master"}', 'now', 'now');
    INSERT INTO project_assets (project_id, asset_id, created_at) VALUES ('m1', 'shared-master', 'now');
    INSERT INTO project_assets (project_id, asset_id, created_at) VALUES ('m2', 'shared-master', 'now');
    INSERT INTO project_assets (project_id, asset_id, created_at) VALUES ('m1', 'single-master', 'now');
    DELETE FROM schema_migrations WHERE version = 6;
  `);
  initial.close();
  const migrated = new StudioDatabase(filename);
  expect(migrated.database.prepare('SELECT project_id, asset_id FROM project_masters ORDER BY project_id, asset_id').all()).toEqual([{ project_id: 'm1', asset_id: 'single-master' }]);
  migrated.close();
  const reopened = new StudioDatabase(filename);
  expect(reopened.database.prepare('SELECT COUNT(*) AS count FROM project_masters').get()).toEqual({ count: 1 });
  reopened.close();
});
