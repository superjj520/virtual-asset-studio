import { expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioDatabase } from '../../db/client';
import { ProjectRepository } from '../projects/repository';
import { ShotPlanRepository } from './repository';

it('保存项目镜头合同，并可按项目顺序读取', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-shots-')), 'db.sqlite'));
  const project = new ProjectRepository(database).create('第一集', 'comic_drama');
  const repository = new ShotPlanRepository(database);
  const item = repository.create({ projectId: project.id, name: '镜头 01', compiledPrompt: '唯一动作：回头', shot: { subjectAnchor: '黑发角色', referenceAssetIds: [], startFrame: '夜景', action: '回头', cameraMotion: '缓慢推近', durationSeconds: 4, frameRate: 24, keep: ['脸部不变'], avoid: ['闪烁'], output: { aspectRatio: '9:16', resolution: '1080p' } } });
  expect(repository.list(project.id)).toEqual([expect.objectContaining({ id: item.id, name: '镜头 01', compiledPrompt: '唯一动作：回头' })]);
  database.close();
});
