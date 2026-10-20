import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { exportProject } from './project-exporter';

it('导出可迁移的项目清单和资产副本', () => {
  const root = mkdtempSync(join(tmpdir(), 'vas-export-'));
  const source = join(root, 'source.png');
  writeFileSync(source, 'asset');
  const output = exportProject({ id: 'p1', name: '测试项目', medium: 'image', brief: { goal: '角色资产', audience: '', visualWorld: '', delivery: '', acceptance: '' }, createdAt: '2026-01-01', updatedAt: '2026-01-01' }, [{ id: 'a1', type: 'image', name: '成图', managedPath: source, sha256: 'abc', mediaType: 'image/png', rightsStatus: 'original', confirmation: 'confirmed', metadata: {}, createdAt: '2026-01-01', updatedAt: '2026-01-01' }], root, { characters: [{ id: 'c1', name: '主角' }], collections: [{ id: 'pack-1', name: '主角包', parentId: 'root', members: [{ assetId: 'a1', moduleKey: 'face' }] }], shots: [{ id: 's1', name: '镜头 01' }], recipes: [{ id: 'r1', name: '夜景配方', status: 'validated' }] });
  expect(existsSync(join(output, 'manifest.json'))).toBe(true);
  const manifest = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8'));
  expect(manifest.production).toEqual({ characters: [{ id: 'c1', name: '主角' }], collections: [{ id: 'pack-1', name: '主角包', parentId: 'root', members: [{ assetId: 'a1', moduleKey: 'face' }] }], shots: [{ id: 's1', name: '镜头 01' }], recipes: [{ id: 'r1', name: '夜景配方', status: 'validated' }], tasks: [] });
});

it('权利未明的已审片图不能进入推荐母版清单', () => {
  const root = mkdtempSync(join(tmpdir(), 'vas-export-'));
  const source = join(root, 'candidate.png');
  writeFileSync(source, 'candidate');
  const output = exportProject({ id: 'p1', name: '测试项目', medium: 'image', createdAt: '', updatedAt: '' }, [
    { id: 'a2', type: 'image', name: '待核权利', managedPath: source, sha256: 'hash', mediaType: 'image/png', rightsStatus: 'unknown', confirmation: 'confirmed', metadata: {}, createdAt: '', updatedAt: '' },
  ], root);
  const manifest = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8'));
  expect(manifest.release.confirmedAssetIds).toEqual([]);
  expect(manifest.release.pendingRightsAssetIds).toEqual(['a2']);
});

it('导出角色证据与资产均不暴露本机原始或管理绝对路径', () => {
  const root = mkdtempSync(join(tmpdir(), 'vas-export-'));
  const source = join(root, 'private.png'); writeFileSync(source, 'sample');
  const asset = { id: 'a3', type: 'image' as const, name: '肖像', managedPath: source, sourcePath: '/Users/private/Downloads/original.png', sha256: 'hash-3', mediaType: 'image/png', rightsStatus: 'authorized' as const, confirmation: 'confirmed' as const, metadata: {}, createdAt: '', updatedAt: '' };
  const output = exportProject({ id: 'p1', name: '私有路径测试', medium: 'image', createdAt: '', updatedAt: '' }, [asset], root, { characters: [{ id: 'c3', name: '主角', evidenceAssets: [asset], facts: [{ slotKey: 'face.shape', evidence: [{ assetId: asset.id }] }] }] });
  const contents = readFileSync(join(output, 'manifest.json'), 'utf8');
  expect(contents).not.toContain(source);
  expect(contents).not.toContain('/Users/private/Downloads/original.png');
  const manifest = JSON.parse(contents);
  expect(manifest.production.characters[0].evidenceAssets[0].exportedFile).toMatch(/^assets\//);
  expect(manifest.production.characters[0].facts[0].evidence[0].assetId).toBe('a3');
});
