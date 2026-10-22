import { expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioDatabase } from '../../db/client';
import { ProjectRepository } from '../projects/repository';
import { CharacterProfileRepository } from '../characters/repository';
import { CharacterWorkspaceRepository } from '../characters/workspace-repository';
import { SceneWorkspaceRepository } from '../scenes/workspace-repository';
import { ShotPlanRepository } from './repository';

const shot = { subjectAnchor: '黑发角色', referenceAssetIds: [], startFrame: '夜景', action: '回头', cameraMotion: '缓慢推近', durationSeconds: 4, frameRate: 24 as const, keep: ['脸部不变'], avoid: ['闪烁'], output: { aspectRatio: '9:16' as const, resolution: '1080p' as const } };

it('保存项目镜头合同，并可按项目顺序读取', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-shots-')), 'db.sqlite'));
  const project = new ProjectRepository(database).create('第一集', 'comic_drama');
  const repository = new ShotPlanRepository(database);
  const item = repository.create({ projectId: project.id, name: '镜头 01', compiledPrompt: '唯一动作：回头', shot });
  expect(repository.list(project.id)).toEqual([expect.objectContaining({ id: item.id, name: '镜头 01', compiledPrompt: '唯一动作：回头', purpose: 'image', status: 'ready' })]);
  database.close();
});

it('镜头合同锁定同项目的角色、场景、状态与已授权起始帧', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-shot-context-')), 'db.sqlite'));
  const project = new ProjectRepository(database).create('人物海报', 'image');
  const characters = new CharacterProfileRepository(database);
  const characterWorkspace = new CharacterWorkspaceRepository(database, characters);
  const scenes = new SceneWorkspaceRepository(database);
  const character = characters.create({ projectId: project.id, name: '蝶灵', card: {
    intent: '', subject: '成年东亚女性', identityAnchor: '黑色长发', bodyAndWardrobe: '', expressionAndPose: '',
    scene: '', lighting: '', camera: '', style: '真人摄影', avoid: '', aspectRatio: '9:16', referenceAssetIds: [],
  } });
  const characterVersion = characterWorkspace.createVersion(character.id);
  const characterState = characterWorkspace.createState(character.id, { versionId: characterVersion.id, name: '回眸', kind: 'performance' });
  const scene = scenes.createProfile({ projectId: project.id, name: '雨夜街角', kind: 'exterior', anchor: '红色电话亭与湿润石板路' });
  const sceneVersion = scenes.createVersion(scene.id);
  const sceneState = scenes.createState(scene.id, { versionId: sceneVersion.id, name: '雨夜', weather: '小雨' });
  database.database.prepare(`INSERT INTO assets
    (id, type, name, managed_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at)
    VALUES ('frame-1', 'image', '起始帧', '/tmp/frame-1.png', 'frame-1', 'image/png', 'authorized', 'confirmed', '{}', 'now', 'now')`).run();
  database.database.prepare("INSERT INTO project_assets (project_id, asset_id, created_at) VALUES (?, 'frame-1', 'now')").run(project.id);
  const repository = new ShotPlanRepository(database);
  const item = repository.create({
    projectId: project.id, name: '镜头 01', shot: { ...shot, referenceAssetIds: ['frame-1'] },
    compiledPrompt: '角色与场景连续', referenceAssetId: 'frame-1', purpose: 'image',
    characterProfileId: character.id, characterVersionId: characterVersion.id, characterStateId: characterState.id,
    sceneProfileId: scene.id, sceneVersionId: sceneVersion.id, sceneStateId: sceneState.id,
    continuityNotes: '发型、服装与电话亭位置不变',
  });
  expect(repository.get(item.id)).toMatchObject({
    characterProfileId: character.id, characterVersionId: characterVersion.id, characterStateId: characterState.id,
    sceneProfileId: scene.id, sceneVersionId: sceneVersion.id, sceneStateId: sceneState.id,
    continuityNotes: '发型、服装与电话亭位置不变',
  });
  const otherProject = new ProjectRepository(database).create('其他项目', 'image');
  expect(() => repository.create({ projectId: otherProject.id, name: '错误镜头', shot, compiledPrompt: '错误', characterProfileId: character.id })).toThrow(/角色不属于/);
  database.close();
});
