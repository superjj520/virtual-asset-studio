import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, join, relative } from 'node:path';
import Database from 'better-sqlite3';

type BackupManifest = { formatVersion: 1; createdAt: string; database: string; databaseSha256: string; managedAssets: string; managedAssetFiles: Array<{ path: string; sha256: string }> };
export type BackupRestoreHooks = {
  beforeDatabaseInstall?: () => void;
  beforeAssetsInstall?: () => void;
  beforeRestoreNote?: () => void;
};

const safeName = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '_');
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const filesUnder = (root: string): string[] => readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
  const path = join(root, entry.name);
  return entry.isDirectory() ? filesUnder(path) : [path];
});

export class BackupService {
  constructor(private readonly databasePath: string, private readonly managedAssetsPath: string, private readonly hooks: BackupRestoreHooks = {}) {}

  async create(database: Database.Database, destinationDirectory: string): Promise<string> {
    mkdirSync(destinationDirectory, { recursive: true });
    const name = `virtual-asset-studio-backup-${safeName(new Date().toISOString().replace(/[:.]/g, '-'))}`;
    const stage = join(destinationDirectory, `.vas-backup-stage-${Date.now()}`);
    const output = join(destinationDirectory, name);
    mkdirSync(stage, { recursive: true });
    try {
      database.pragma('wal_checkpoint(TRUNCATE)');
      await database.backup(join(stage, 'database.sqlite'));
      if (existsSync(this.managedAssetsPath)) cpSync(this.managedAssetsPath, join(stage, 'managed-assets'), { recursive: true });
      else mkdirSync(join(stage, 'managed-assets'), { recursive: true });
      const managedRoot = join(stage, 'managed-assets');
      const manifest: BackupManifest = {
        formatVersion: 1,
        createdAt: new Date().toISOString(),
        database: 'database.sqlite',
        databaseSha256: sha256(join(stage, 'database.sqlite')),
        managedAssets: 'managed-assets',
        managedAssetFiles: filesUnder(managedRoot).map((path) => ({ path: relative(managedRoot, path), sha256: sha256(path) })),
      };
      writeFileSync(join(stage, 'backup-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
      renameSync(stage, output);
      return output;
    } catch (error) {
      rmSync(stage, { recursive: true, force: true });
      throw error;
    }
  }

  restore(backupDirectory: string): { recoveryDirectory: string } {
    const manifest = JSON.parse(readFileSync(join(backupDirectory, 'backup-manifest.json'), 'utf8')) as BackupManifest;
    if (manifest.formatVersion !== 1 || manifest.database !== 'database.sqlite' || manifest.managedAssets !== 'managed-assets' || !manifest.databaseSha256 || !Array.isArray(manifest.managedAssetFiles)) throw new Error('备份格式不受支持。');
    const sourceDatabase = join(backupDirectory, manifest.database);
    const sourceAssets = join(backupDirectory, manifest.managedAssets);
    if (!existsSync(sourceDatabase) || !existsSync(sourceAssets)) throw new Error('备份缺少数据库或素材目录。');
    if (sha256(sourceDatabase) !== manifest.databaseSha256) throw new Error('备份数据库校验失败，未执行恢复。');
    for (const file of manifest.managedAssetFiles) {
      const path = join(sourceAssets, file.path);
      if (!path.startsWith(`${sourceAssets}/`) || !existsSync(path) || sha256(path) !== file.sha256) throw new Error(`备份素材校验失败：${file.path}`);
    }
    const recoveryDirectory = `${this.databasePath}.before-restore-${Date.now()}`;
    const stagedDatabase = `${this.databasePath}.restore-stage`;
    const stagedAssets = `${this.managedAssetsPath}.restore-stage`;
    copyFileSync(sourceDatabase, stagedDatabase);
    cpSync(sourceAssets, stagedAssets, { recursive: true });
    const stagedDb = new Database(stagedDatabase);
    let oldDatabaseMoved = false;
    let oldAssetsMoved = false;
    let newDatabaseInstalled = false;
    let newAssetsInstalled = false;
    const movedDatabaseSuffixes: string[] = [];
    try {
      const assetRows = stagedDb.prepare('SELECT id, managed_path FROM assets').all() as Array<{ id: string; managed_path: string }>;
      const updateAssetPath = stagedDb.prepare('UPDATE assets SET managed_path = ? WHERE id = ?');
      for (const row of assetRows) {
        const relocated = join(this.managedAssetsPath, basename(dirname(row.managed_path)), basename(row.managed_path));
        if (!existsSync(join(stagedAssets, basename(dirname(row.managed_path)), basename(row.managed_path)))) throw new Error(`恢复素材缺失，无法重定位：${row.id}`);
        updateAssetPath.run(relocated, row.id);
      }
      const versionRows = stagedDb.prepare('SELECT id, managed_path FROM asset_versions').all() as Array<{ id: string; managed_path: string }>;
      const updateVersionPath = stagedDb.prepare('UPDATE asset_versions SET managed_path = ? WHERE id = ?');
      for (const row of versionRows) updateVersionPath.run(join(this.managedAssetsPath, basename(dirname(row.managed_path)), basename(row.managed_path)), row.id);
      stagedDb.close();
      mkdirSync(recoveryDirectory, { recursive: true });
      writeFileSync(join(recoveryDirectory, 'restore-note.txt'), `恢复于 ${new Date().toISOString()}；此目录保留恢复前数据，可人工取回。\n`, 'utf8');
      for (const suffix of ['', '-wal', '-shm']) if (existsSync(`${this.databasePath}${suffix}`)) { renameSync(`${this.databasePath}${suffix}`, join(recoveryDirectory, `database.sqlite${suffix}`)); movedDatabaseSuffixes.push(suffix); }
      oldDatabaseMoved = movedDatabaseSuffixes.length > 0;
      if (existsSync(this.managedAssetsPath)) { renameSync(this.managedAssetsPath, join(recoveryDirectory, 'managed-assets')); oldAssetsMoved = true; }
      this.hooks.beforeDatabaseInstall?.();
      renameSync(stagedDatabase, this.databasePath);
      newDatabaseInstalled = true;
      this.hooks.beforeAssetsInstall?.();
      renameSync(stagedAssets, this.managedAssetsPath);
      newAssetsInstalled = true;
      return { recoveryDirectory };
    } catch (error) {
      try { stagedDb.close(); } catch { /* already closed */ }
      // 补偿顺序：先移除已安装的新内容，再把 recovery 中的旧内容放回原位。
      if (newAssetsInstalled) rmSync(this.managedAssetsPath, { recursive: true, force: true });
      if (oldAssetsMoved && existsSync(join(recoveryDirectory, 'managed-assets')) && !existsSync(this.managedAssetsPath)) renameSync(join(recoveryDirectory, 'managed-assets'), this.managedAssetsPath);
      if (newDatabaseInstalled) rmSync(this.databasePath, { force: true });
      for (const suffix of movedDatabaseSuffixes) {
        const restored = join(recoveryDirectory, `database.sqlite${suffix}`);
        if (existsSync(restored) && !existsSync(`${this.databasePath}${suffix}`)) renameSync(restored, `${this.databasePath}${suffix}`);
      }
      rmSync(stagedDatabase, { force: true });
      rmSync(stagedAssets, { recursive: true, force: true });
      if (existsSync(join(recoveryDirectory, 'restore-note.txt')) && (!oldDatabaseMoved || movedDatabaseSuffixes.every((suffix) => !existsSync(join(recoveryDirectory, `database.sqlite${suffix}`))) && !existsSync(join(recoveryDirectory, 'managed-assets')))) rmSync(recoveryDirectory, { recursive: true, force: true });
      throw error;
    }
  }
}
