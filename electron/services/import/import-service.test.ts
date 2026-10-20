import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { StudioDatabase } from '../../db/client';
import { AssetRepository } from '../assets/repository';
import { ManagedStore } from '../files/managed-store';
import { ImportService } from './import-service';

const directories: string[] = [];
const setup = async () => {
  const directory = mkdtempSync(join(tmpdir(), 'virtual-asset-studio-import-'));
  directories.push(directory);
  const inputPath = join(directory, 'reference.png');
  await sharp({ create: { width: 8, height: 8, channels: 4, background: '#a66e58' } }).png().toFile(inputPath);
  const database = new StudioDatabase(join(directory, 'studio.sqlite'));
  const store = new ManagedStore(join(directory, 'managed'));
  const assets = new AssetRepository(database);
  return { inputPath, store, assets, service: new ImportService(assets, store) };
};

afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe('ImportService', () => {
  it('复制图片到受管库，保留来源并生成缩略图与可编辑理解建议', async () => {
    const { inputPath, store, service } = await setup();
    await expect(service.import({ filePath: inputPath, type: 'reference_image', rightsStatus: 'authorized' })).rejects.toThrow(/依据/);
    const result = await service.import({ filePath: inputPath, type: 'reference_image', rightsStatus: 'authorized', rightsReason: '本人拍摄并授权在此项目使用' });

    expect(result.duplicateOf).toBeUndefined();
    expect(result.asset.sourcePath).toBe(inputPath);
    expect(result.asset.managedPath).not.toBe(inputPath);
    expect(readFileSync(result.asset.managedPath).length).toBeGreaterThan(0);
    expect(result.thumbnailPath).toContain('thumbnail.webp');
    expect(store.exists(result.thumbnailPath!)).toBe(true);
    expect(result.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'person', editable: true }),
      expect.objectContaining({ category: 'risk', value: '已标记为用户授权素材', editable: true })
    ]));

    const duplicate = await service.import({ filePath: inputPath, type: 'reference_image', rightsStatus: 'authorized', rightsReason: '本人拍摄并授权在此项目使用' });
    expect(duplicate.duplicateOf?.id).toBe(result.asset.id);
  });

  it('导入时保存二级分类，供素材库按用途组织', async () => {
    const { inputPath, service } = await setup();
    const result = await service.import({
      filePath: inputPath,
      type: 'wardrobe',
      rightsStatus: 'authorized',
      rightsReason: '已经取得可使用的授权',
      secondaryCategory: '礼服与正装',
    });

    expect(result.asset.metadata.secondaryCategory).toBe('礼服与正装');
  });

  it('相同文件再次导入若权利声明冲突，不会静默继承旧授权', async () => {
    const { inputPath, service } = await setup();
    const first = await service.import({ filePath: inputPath, rightsStatus: 'authorized', rightsReason: '仅用于项目甲' });
    await expect(service.import({ filePath: inputPath, rightsStatus: 'restricted' })).rejects.toThrow(/权利.*不一致/);
    await expect(service.import({ filePath: inputPath, rightsStatus: 'authorized', rightsReason: '仅用于项目乙' })).rejects.toThrow(/依据.*不一致/);
    expect(first.asset.rightsStatus).toBe('authorized');
  });

  it('哈希首次查询后出现并发同文件资产，仍要复核事务性去重返回的权利依据', async () => {
    const { inputPath, assets, service } = await setup();
    await service.import({ filePath: inputPath, rightsStatus: 'authorized', rightsReason: '仅供项目甲使用' });
    const findByHash = assets.findByHash.bind(assets);
    vi.spyOn(assets, 'findByHash').mockImplementationOnce(() => undefined).mockImplementation(findByHash);
    await expect(service.import({ filePath: inputPath, rightsStatus: 'authorized', rightsReason: '仅供项目乙使用' })).rejects.toThrow(/依据.*不一致/);
  });
});
