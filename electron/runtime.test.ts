import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IpcMain } from 'electron';
import type { Asset, RightsStatus } from '../src/shared/types';
import { StudioDatabase } from './db/client';
import { AssetRepository } from './services/assets/repository';
import { ProjectRepository } from './services/projects/repository';
import { hashBuffer } from './services/files/hash';
import { createStudioRuntime } from './runtime';

type Handler = (...args: any[]) => unknown;

let harness: {
  directory: string;
  database: StudioDatabase;
  assets: AssetRepository;
  projects: ProjectRepository;
  runtime: ReturnType<typeof createStudioRuntime>;
  handlers: Map<string, Handler>;
  invoke: (channel: string, input: unknown) => Promise<any>;
};

beforeEach(() => {
  const directory = mkdtempSync(join(tmpdir(), 'studio-generation-intake-'));
  const handlers = new Map<string, Handler>();
  const runtime = createStudioRuntime(directory, {
    isAvailable: () => true,
    encrypt: (value) => value,
    decrypt: (value) => value,
  });
  runtime.register({ handle: (channel: string, handler: Handler) => { handlers.set(channel, handler); } } as IpcMain);
  const database = new StudioDatabase(join(directory, 'virtual-asset-studio.sqlite'));
  harness = {
    directory,
    database,
    assets: new AssetRepository(database),
    projects: new ProjectRepository(database),
    runtime,
    handlers,
    invoke: async (channel, input) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`缺失测试处理器：${channel}`);
      return handler({}, input);
    },
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  harness.database.close();
  harness.runtime.close();
});

const addAsset = (input: {
  mediaType?: string;
  rightsStatus?: RightsStatus;
  confirmation?: Asset['confirmation'];
  projectId?: string;
} = {}) => {
  const hash = randomUUID();
  const managedPath = join(harness.directory, `${hash}.png`);
  writeFileSync(managedPath, Buffer.from('image-fixture'));
  const { asset } = harness.assets.createOrGet({
    type: input.mediaType?.startsWith('video/') ? 'video' : 'image',
    name: '参考素材',
    managedPath,
    sha256: hash,
    mediaType: input.mediaType ?? 'image/png',
    rightsStatus: input.rightsStatus ?? 'authorized',
    confirmation: input.confirmation ?? 'confirmed',
    metadata: {},
  });
  if (input.projectId) harness.projects.attachAsset(input.projectId, asset.id);
  return asset;
};

const imageInput = (referenceAssetIds: string[], projectId?: string) => ({
  prompt: '角色肖像', aspectRatio: '1:1' as const, referenceAssetIds, projectId,
});
const refineInput = (assetId: string, projectId?: string) => ({
  prompt: '仅调整灯光', aspectRatio: '1:1' as const, assetId, projectId,
});
const videoInput = (referenceAssetId: string, projectId?: string) => ({
  prompt: '镜头推进', aspectRatio: '16:9' as const, seconds: 4 as const,
  referenceAssetId, projectId,
});

it('生图不能静默丢弃不存在的参考素材', async () => {
  await expect(harness.invoke('generation:image', imageInput(['missing']))).rejects.toThrow(/参考素材.*不存在/);
});

it('敏感文件 IPC 拒绝相对路径，避免 renderer 伪造未校验的文件位置', async () => {
  await expect(harness.invoke('assets:import', { filePath: 'relative.png', rightsStatus: 'unknown' })).rejects.toThrow(/绝对路径/);
  const project = harness.projects.create('导出路径校验', 'image');
  await expect(harness.invoke('projects:export', project.id, 'relative-output')).rejects.toThrow(/绝对路径/);
  await expect(harness.invoke('data:create-backup', 'relative-backup')).rejects.toThrow(/绝对路径/);
});

it('运行时注册人物资产包导入桥，供界面把外部压缩包接入角色档案', () => {
  expect(harness.handlers.has('character-pack:import')).toBe(true);
});

it('首次配置 Gemini 后图片与修图路由自动切到已配置的 Gemini', async () => {
  await harness.handlers.get('settings:save-provider-key')!({}, 'gemini', 'gemini-test-key-12345678901234567890');

  const status = await harness.invoke('settings:provider-status');

  expect(status.providers.find((provider: any) => provider.id === 'gemini')).toMatchObject({ configured: true });
  expect(status.routes.image).toBe('gemini');
  expect(status.routes.image_edit).toBe('gemini');
  expect(status.routes.vision).toBe('openai');
});

it('视觉理解不能把权利未明的参考图外传', async () => {
  const reference = addAsset({ rightsStatus: 'unknown' });
  await expect(harness.invoke('vision:analyze', reference.id)).rejects.toThrow(/使用权|授权/);
});

it.each([
  ['非图片', { mediaType: 'video/mp4' }, /参考素材.*图片/],
  ['草稿', { confirmation: 'draft' as const }, /参考素材.*确认/],
  ['未知权利', { rightsStatus: 'unknown' as const }, /参考素材.*权利/],
  ['受限权利', { rightsStatus: 'restricted' as const }, /参考素材.*权利/],
])('生图拒绝%s参考素材', async (_name, assetInput, message) => {
  const reference = addAsset(assetInput);
  await expect(harness.invoke('generation:image', imageInput([reference.id]))).rejects.toThrow(message);
});

it.each([
  ['generation:refine-image', refineInput],
  ['generation:video', videoInput],
])('%s 拒绝不存在的参考素材', async (channel, makeInput) => {
  await expect(harness.invoke(channel, makeInput('missing'))).rejects.toThrow(/参考素材.*不存在/);
});

it.each([
  ['generation:refine-image', refineInput],
  ['generation:video', videoInput],
])('%s 拒绝权利未明的参考素材', async (channel, makeInput) => {
  const reference = addAsset({ rightsStatus: 'unknown' });
  await expect(harness.invoke(channel, makeInput(reference.id))).rejects.toThrow(/参考素材.*权利/);
});

it.each([
  ['generation:image', (id: string, projectId: string) => imageInput([id], projectId)],
  ['generation:refine-image', refineInput],
  ['generation:video', videoInput],
])('%s 拒绝跨项目引用', async (channel, makeInput) => {
  const projectA = harness.projects.create('甲', 'image');
  const projectB = harness.projects.create('乙', 'image');
  const reference = addAsset({ projectId: projectA.id });
  await expect(harness.invoke(channel, makeInput(reference.id, projectB.id))).rejects.toThrow(/参考素材.*项目/);
});

it('明确项目不能将未归属的素材直接当作参考', async () => {
  const project = harness.projects.create('肖像项目', 'image');
  const reference = addAsset();
  await expect(harness.invoke('generation:image', imageInput([reference.id], project.id))).rejects.toThrow(/参考素材.*项目/);
});

it('生图参考必须为数组，不能把意外输入解释成无参考', async () => {
  await expect(harness.invoke('generation:image', { ...imageInput([]), referenceAssetIds: 'missing' })).rejects.toThrow(/参考素材.*列表/);
});

it('未选项目时不能引用只归属于其他项目的素材', async () => {
  const project = harness.projects.create('肖像项目', 'image');
  const reference = addAsset({ projectId: project.id });
  await expect(harness.invoke('generation:image', imageInput([reference.id]))).rejects.toThrow(/参考素材.*项目/);
});

it('有参考图却选择不支持参考编辑的模型时拒绝生成', async () => {
  const reference = addAsset();
  const saveKey = harness.handlers.get('settings:save-provider-key')!;
  saveKey({}, 'flux', 'flux-test-key-placeholder-123456');
  harness.handlers.get('settings:save-route')!({}, 'image', 'flux');
  await expect(harness.invoke('generation:image', imageInput([reference.id]))).rejects.toThrow(/参考图.*模型/);
});

it('生成结果待复核权利，且仅记录实际送入模型的参考素材', async () => {
  const first = addAsset();
  const second = addAsset();
  const saveKey = harness.handlers.get('settings:save-provider-key')!;
  saveKey({}, 'openai', 'openai-test-key-placeholder-123456');
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ data: [{ b64_json: Buffer.from('generated-image').toString('base64') }] }),
  })));

  const job = await harness.invoke('generation:image', imageInput([first.id, second.id]));
  const result = harness.assets.findById(job.result.assetId)!;
  expect(result.rightsStatus).toBe('unknown');
  expect(result.metadata).toMatchObject({
    provenance: 'ai_generated',
    rightsReview: 'pending',
    sourceAssetIds: [first.id],
  });
  expect(harness.database.database.prepare('SELECT to_asset_id FROM asset_relationships WHERE from_asset_id = ?').all(result.id))
    .toEqual([{ to_asset_id: first.id }]);
  expect(job.request.referenceAssetIds).toEqual([first.id, second.id]);
  expect(job.request.appliedReferenceAssetIds).toEqual([first.id]);
});

it('已确认且归档到当前项目的授权图片可以进入修订通道', async () => {
  const project = harness.projects.create('角色项目', 'image');
  const reference = addAsset({ projectId: project.id });
  harness.handlers.get('settings:save-provider-key')!({}, 'openai', 'openai-test-key-placeholder-123456');
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ data: [{ b64_json: Buffer.from('project-image').toString('base64') }] }),
  }));
  vi.stubGlobal('fetch', fetchMock);

  const job = await harness.invoke('generation:image', imageInput([reference.id], project.id));
  expect(job.status).toBe('completed');
  expect(fetchMock).toHaveBeenCalledWith(
    'https://api.openai.com/v1/images/edits',
    expect.objectContaining({ method: 'POST' }),
  );
  expect(harness.assets.findById(job.result.assetId)).toMatchObject({ rightsStatus: 'unknown' });
  expect(harness.projects.listAssets(project.id)).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: job.result.assetId }),
  ]));
});

it('无参考图的文本生图仍可在素材库启动', async () => {
  harness.handlers.get('settings:save-provider-key')!({}, 'openai', 'openai-test-key-placeholder-123456');
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ data: [{ b64_json: Buffer.from('text-only-image').toString('base64') }] }),
  }));
  vi.stubGlobal('fetch', fetchMock);

  const job = await harness.invoke('generation:image', imageInput([]));
  expect(job.status).toBe('completed');
  expect(job.request).toMatchObject({ requestedAspectRatio: '1:1', actualAspectRatio: '1:1', size: '1024x1024' });
  expect(fetchMock).toHaveBeenCalledWith(
    'https://api.openai.com/v1/images/generations',
    expect.objectContaining({ method: 'POST' }),
  );
  expect(harness.assets.findById(job.result.assetId)?.metadata).toMatchObject({
    sourceAssetIds: [],
    rightsReview: 'pending',
  });
});

it('角色工作室生成会话把角色版本、状态、参考与候选结果串成同一条生产记录', async () => {
  const profile = await harness.invoke('characters:create', {
    name: '动态角色',
    card: {
      intent: '角色连续创作', subject: '成年角色', identityAnchor: '固定脸部结构',
      bodyAndWardrobe: '', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '',
      avoid: '身份漂移', aspectRatio: '1:1', referenceAssetIds: [],
    },
  });
  const version = await harness.handlers.get('character-versions:create')!({}, profile.id, { label: '初始版本' });
  const state = await harness.handlers.get('character-states:create')!({}, profile.id, {
    versionId: version.id, name: '夜景状态', kind: 'scene', status: 'active', scene: '夜晚街头',
  });
  const reference = addAsset();
  const session = await harness.handlers.get('generation-sessions:create')!({}, {
    characterProfileId: profile.id,
    characterVersionId: version.id,
    characterStateId: state.id,
    title: '夜景肖像',
    mode: 'text_to_image',
    prompt: '同一角色夜景肖像',
    negativePrompt: '身份漂移',
    aspectRatio: '1:1',
    referenceAssetIds: [reference.id],
    settings: {},
  });
  await harness.handlers.get('settings:save-provider-key')!({}, 'openai', 'openai-test-key-placeholder-123456');
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ data: [{ b64_json: Buffer.from('character-session-image').toString('base64') }] }),
  })));

  const job = await harness.invoke('generation:image', {
    ...imageInput([reference.id]),
    generationSessionId: session.id,
  });
  const snapshot = await harness.handlers.get('character-workspace:get')!({}, profile.id);
  expect(snapshot.sessions[0]).toMatchObject({ id: session.id, status: 'review' });
  expect(snapshot.media).toEqual(expect.arrayContaining([
    expect.objectContaining({ assetId: reference.id, role: 'reference' }),
    expect.objectContaining({ assetId: job.result.assetId, role: 'candidate', parentAssetId: reference.id }),
  ]));
});

it('图片生成保留避免项和原任务关联，重试信息不会丢失', async () => {
  harness.handlers.get('settings:save-provider-key')!({}, 'openai', 'openai-test-key-placeholder-123456');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ b64_json: Buffer.from('retry-image').toString('base64') }] }) })));
  const task = await harness.invoke('tasks:create', { name: '重试关联任务', objective: '验证关联', card: { intent: '', subject: '成年女性', identityAnchor: '', bodyAndWardrobe: '', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '', avoid: '文字、水印', aspectRatio: '16:9', referenceAssetIds: [] }, collectionIds: [] });
  const job = await harness.invoke('generation:image', { ...imageInput([]), creativeTaskId: task.id, aspectRatio: '16:9', negative: '文字、水印' });
  expect(job.request).toMatchObject({ creativeTaskId: task.id, negative: '文字、水印', requestedAspectRatio: '16:9', actualAspectRatio: '3:2', size: '1536x1024' });
});

it('生成内容撞上已有资产时不把旧资产冒充新的待复核结果', async () => {
  const reusedBytes = Buffer.from('existing-image');
  const original = harness.assets.createOrGet({
    type: 'image', name: '旧资产', managedPath: join(harness.directory, 'old.png'),
    sha256: hashBuffer(reusedBytes), mediaType: 'image/png',
    rightsStatus: 'original', confirmation: 'confirmed', metadata: { source: 'user' },
  }).asset;
  harness.handlers.get('settings:save-provider-key')!({}, 'openai', 'openai-test-key-placeholder-123456');
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ data: [{ b64_json: reusedBytes.toString('base64') }] }),
  })));

  await expect(harness.invoke('generation:image', imageInput([]))).rejects.toThrow(/重复.*复核/);
  expect(harness.assets.findById(original.id)).toMatchObject({
    rightsStatus: 'original', metadata: { source: 'user' },
  });
});

it('视频下载完成后再次轮询不会因同一内容去重而把任务改成失败', async () => {
  harness.handlers.get('settings:save-provider-key')!({}, 'openai', 'openai-test-key-placeholder-123456');
  const videoBytes = Buffer.from('video-result');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/videos') && init.method === 'POST')
      return { ok: true, json: async () => ({ id: 'remote-video', status: 'queued' }) };
    if (url.endsWith('/videos/remote-video/content'))
      return { ok: true, arrayBuffer: async () => videoBytes.buffer.slice(videoBytes.byteOffset, videoBytes.byteOffset + videoBytes.byteLength) };
    return { ok: true, json: async () => ({ id: 'remote-video', status: 'completed' }) };
  }));

  const started = await harness.invoke('generation:video', {
    prompt: '镜头推进', aspectRatio: '16:9', seconds: 4,
  });
  const first = await harness.invoke('generation:poll-video', started.id);
  const second = await harness.invoke('generation:poll-video', started.id);
  expect(first).toMatchObject({ status: 'completed', result: { assetId: expect.any(String) } });
  expect(second).toMatchObject({ status: 'completed', result: { assetId: first.result.assetId } });
});

it('视频提交网络失败进入未知状态，不能作为普通失败盲目重试', async () => {
  harness.handlers.get('settings:save-provider-key')!({}, 'openai', 'openai-test-key-placeholder-123456');
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
  await expect(harness.invoke('generation:video', { prompt: '网络边界测试', aspectRatio: '16:9', seconds: 4 })).rejects.toThrow(/网络请求失败/);
  const [job] = await harness.invoke('jobs:list');
  expect(job).toMatchObject({ kind: 'image_to_video', status: 'unknown' });
  expect(job.result).toBeUndefined();
});

it('未知视频安全查询遇到本地 provider 不可用时仍保留 unknown 与远程编号', async () => {
  const project = harness.projects.getOrCreateLibraryProject();
  harness.database.database.prepare("INSERT INTO jobs (id, project_id, kind, provider_id, status, request_json, result_json, error, retry_count, created_at, updated_at) VALUES ('query-boundary', ?, 'image_to_video', 'openai', 'unknown', ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)").run(project.id, JSON.stringify({ prompt: '查询边界', size: '1280x720', seconds: 4 }), JSON.stringify({ remoteId: 'remote-query-id', progress: 12 }), '先前状态未知');
  const queried = await harness.invoke('generation:poll-video', 'query-boundary');
  expect(queried).toMatchObject({ status: 'unknown', result: { remoteId: 'remote-query-id' } });
});
