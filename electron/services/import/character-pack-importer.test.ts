import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { StudioDatabase } from '../../db/client';
import { AssetRepository } from '../assets/repository';
import { CharacterProfileRepository } from '../characters/repository';
import { AssetCollectionRepository } from '../collections/repository';
import { ProjectRepository } from '../projects/repository';
import { ManagedStore } from '../files/managed-store';
import { ImportService } from './import-service';
import { CharacterAssetPackImporter } from './character-pack-importer';

const filenames = [
  '01-front-hero-4k.png',
  '02-three-quarter-4k.png',
  '03-side-angle-4k.png',
  '04-upper-skin-earrings-nails.png',
  '05-dress-body-detail.png',
  '06-left-hand-burgundy-nails.png',
  '07-right-hand-burgundy-nails.png',
  '08-gold-shoe-detail.png',
  '09-front-transparent-cutout-4k.png',
];

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

const createPack = async () => {
  const directory = mkdtempSync(join(tmpdir(), 'virtual-asset-studio-character-pack-'));
  directories.push(directory);
  const sourceDirectory = join(directory, 'source');
  mkdirSync(sourceDirectory);
  for (const [index, filename] of filenames.entries()) {
    await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 20 + index, g: 80, b: 140, alpha: 1 } } })
      .png().toFile(join(sourceDirectory, filename));
  }
  const zipPath = join(directory, 'character-asset-set-final.zip');
  execFileSync('zip', ['-q', zipPath, ...filenames], { cwd: sourceDirectory });
  const database = new StudioDatabase(join(directory, 'studio.sqlite'));
  const assets = new AssetRepository(database);
  const projects = new ProjectRepository(database);
  const characters = new CharacterProfileRepository(database);
  const collections = new AssetCollectionRepository(database);
  const importer = new CharacterAssetPackImporter(
    new ImportService(assets, new ManagedStore(join(directory, 'managed'))),
    characters,
    collections,
    projects,
  );
  return { directory, database, projects, importer, zipPath };
};

describe('CharacterAssetPackImporter', () => {
  it('把最终人物资产包登记为角色、资产包和带原始压缩包来源的素材证据', async () => {
    const { database, projects, importer, zipPath } = await createPack();
    const project = projects.create('人物生产验证', 'image');

    const result = await importer.import({ zipPath, projectId: project.id, rightsStatus: 'unknown' });

    expect(result.profile).toMatchObject({
      projectId: project.id,
      lifecycle: 'draft',
      name: '海军蓝缎面礼服角色（待命名）',
    });
    expect(result.collection).toMatchObject({
      projectId: project.id,
      characterProfileId: result.profile.id,
      kind: 'character',
      status: 'draft',
    });
    expect(result.assets).toHaveLength(9);
    expect(result.importedCount).toBe(9);
    expect(result.duplicateCount).toBe(0);
    expect(result.assets.every((asset) => asset.sourcePath === zipPath)).toBe(true);
    expect(result.assets.every((asset) => asset.confirmation === 'draft' && asset.rightsStatus === 'unknown')).toBe(true);
    expect(result.profile.card.bodyAndWardrobe).toContain('海军蓝缎面束身礼服');
    expect(result.profile.card.referenceAssetIds).toEqual([]);
    expect(result.warnings.join('；')).toMatch(/待确认|主参考/);
    expect(result.collection.assetCount).toBe(9);
    expect(result.profile.facts).toHaveLength(22);
    database.close();
  });

  it('相同压缩包再次导入复用素材但建立独立角色档案，并保留权利冲突保护', async () => {
    const { database, projects, importer, zipPath } = await createPack();
    const project = projects.create('人物生产验证', 'image');

    const first = await importer.import({ zipPath, projectId: project.id, rightsStatus: 'unknown' });
    const second = await importer.import({ zipPath, projectId: project.id, rightsStatus: 'unknown', name: '同一资产包的第二档案' });

    expect(second.profile.id).not.toBe(first.profile.id);
    expect(second.importedCount).toBe(0);
    expect(second.duplicateCount).toBe(9);
    expect(second.assets.map((asset) => asset.id)).toEqual(first.assets.map((asset) => asset.id));
    await expect(importer.import({ zipPath, projectId: project.id, rightsStatus: 'authorized', rightsReason: '另一套未经确认的授权' })).rejects.toThrow(/权利状态不一致/);
    database.close();
  });

  it('缺少任一必需文件时不创建角色档案', async () => {
    const { database, projects, importer, zipPath } = await createPack();
    const project = projects.create('人物生产验证', 'image');
    const brokenZip = join(dirname(zipPath), 'broken.zip');
    execFileSync('zip', ['-q', brokenZip, ...filenames.slice(1)], { cwd: join(dirname(zipPath), 'source') });

    await expect(importer.import({ zipPath: brokenZip, projectId: project.id })).rejects.toThrow(/缺少必需文件/);
    expect(database.database.prepare('SELECT COUNT(*) AS count FROM character_profiles').get()).toEqual({ count: 0 });
    database.close();
  });
});
