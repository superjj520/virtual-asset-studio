import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { StudioDatabase } from '../../db/client';
import { BackupService } from './backup-service';

it('备份包含数据库与 managed-assets，恢复前保留可回滚目录', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vas-backup-'));
  const dbPath = join(root, 'virtual-asset-studio.sqlite');
  const assetsPath = join(root, 'managed-assets');
  mkdirSync(assetsPath);
  writeFileSync(join(assetsPath, 'asset.png'), 'before');
  const database = new StudioDatabase(dbPath);
  const service = new BackupService(dbPath, assetsPath);
  const destination = join(root, 'backups');
  const backup = await service.create(database.database, destination);
  database.close();
  expect(existsSync(join(backup, 'database.sqlite'))).toBe(true);
  expect(readFileSync(join(backup, 'managed-assets', 'asset.png'), 'utf8')).toBe('before');
  writeFileSync(join(assetsPath, 'asset.png'), 'after');
  const restored = service.restore(backup);
  expect(readFileSync(join(assetsPath, 'asset.png'), 'utf8')).toBe('before');
  expect(existsSync(join(restored.recoveryDirectory, 'managed-assets', 'asset.png'))).toBe(true);
});

it('损坏备份或素材哈希不符时拒绝恢复且不移动当前数据', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vas-backup-corrupt-'));
  const dbPath = join(root, 'virtual-asset-studio.sqlite');
  const assetsPath = join(root, 'managed-assets');
  mkdirSync(assetsPath);
  writeFileSync(join(assetsPath, 'asset.png'), 'safe-current');
  const database = new StudioDatabase(dbPath);
  const service = new BackupService(dbPath, assetsPath);
  const backup = await service.create(database.database, join(root, 'backups'));
  database.close();
  writeFileSync(join(backup, 'managed-assets', 'asset.png'), 'tampered');
  expect(() => service.restore(backup)).toThrow(/素材校验失败/);
  expect(readFileSync(join(assetsPath, 'asset.png'), 'utf8')).toBe('safe-current');
});

it('安装新数据库后素材替换失败会补偿回滚，且恢复到另一目录会重定位 managed_path', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vas-backup-rollback-'));
  const dbPath = join(root, 'current', 'virtual-asset-studio.sqlite');
  const assetsPath = join(root, 'current', 'managed-assets');
  mkdirSync(assetsPath, { recursive: true });
  writeFileSync(join(assetsPath, 'old.txt'), 'old');
  const database = new StudioDatabase(dbPath);
  const backupSource = join(root, 'source', 'managed-assets', 'hash-1');
  mkdirSync(backupSource, { recursive: true });
  writeFileSync(join(backupSource, 'source.png'), 'new');
  database.database.prepare(`INSERT INTO assets (id, type, name, managed_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at) VALUES ('a1', 'image', '新素材', ?, 'hash-1', 'image/png', 'unknown', 'draft', '{}', 'now', 'now')`).run(join(backupSource, 'source.png'));
  const creator = new BackupService(dbPath, join(root, 'source', 'managed-assets'));
  const backup = await creator.create(database.database, join(root, 'backups'));
  database.close();
  const failing = new BackupService(dbPath, assetsPath, { beforeAssetsInstall: () => { throw new Error('模拟素材替换失败'); } });
  expect(() => failing.restore(backup)).toThrow(/模拟素材替换失败/);
  expect(readFileSync(join(assetsPath, 'old.txt'), 'utf8')).toBe('old');
  expect(readFileSync(dbPath, 'utf8').length).toBeGreaterThan(0);
  const successful = new BackupService(dbPath, assetsPath);
  const restored = successful.restore(backup);
  expect(restored.recoveryDirectory).toContain('before-restore');
  const check = new Database(dbPath);
  expect((check.prepare('SELECT managed_path FROM assets WHERE id = ?').get('a1') as { managed_path: string }).managed_path).toBe(join(assetsPath, 'hash-1', 'source.png'));
  check.close();
});
