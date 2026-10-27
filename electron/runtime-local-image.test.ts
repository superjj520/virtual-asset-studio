// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import type { IpcMain } from 'electron';
import { createStudioRuntime } from './runtime';

/** 1×1 RGBA PNG：本地 mock 服务返回它，用来验证真实落盘的图片字节。 */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

type Handler = (...args: any[]) => unknown;
type Harness = {
  handlers: Map<string, Handler>;
  invoke: (channel: string, input?: unknown) => Promise<any>;
  close: () => void;
};

const openHarnesses: Harness[] = [];
const openServers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  while (openHarnesses.length) openHarnesses.pop()!.close();
  while (openServers.length) await openServers.pop()!.close();
});

const startRuntime = (directory: string): Harness => {
  const handlers = new Map<string, Handler>();
  const runtime = createStudioRuntime(directory, {
    isAvailable: () => true,
    encrypt: (value: string) => value,
    decrypt: (value: string) => value,
  });
  runtime.register({
    handle: (channel: string, handler: Handler) => {
      handlers.set(channel, handler);
    },
  } as unknown as IpcMain);
  let closed = false;
  const harness: Harness = {
    handlers,
    invoke: async (channel, input) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`缺失测试处理器：${channel}`);
      return handler({}, input);
    },
    close: () => {
      if (closed) return;
      closed = true;
      runtime.close();
    },
  };
  openHarnesses.push(harness);
  return harness;
};

const startMock = async (
  onRequest: (body: any, response: ServerResponse) => void,
): Promise<{ url: string; bodies: any[]; close: () => Promise<void> }> => {
  const bodies: any[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = raw ? JSON.parse(raw) : undefined;
      if (request.url === '/v1/images/generations') bodies.push(body);
      onRequest(body, response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const handle = {
    url: `http://127.0.0.1:${port}`,
    bodies,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
  openServers.push(handle);
  return handle;
};

const pngResponse = (body: any, response: ServerResponse) => {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ data: [{ b64_json: ONE_PIXEL_PNG.toString('base64') }] }));
};

it('未填写地址时本地模型报出清晰错误，也不会把图片路由切到本机', async () => {
  const harness = startRuntime(mkdtempSync(join(tmpdir(), 'studio-local-image-idle-')));

  const status = await harness.invoke('settings:provider-status');
  expect(status.localImage).toEqual({ baseUrl: '', model: '' });
  expect(status.providers.find((provider: any) => provider.id === 'local')).toMatchObject({
    configured: false,
    capabilities: ['image'],
  });
  expect(status.routes.image).not.toBe('local');

  await expect(
    harness.invoke('generation:image', {
      prompt: '角色肖像',
      aspectRatio: '1:1',
      referenceAssetIds: [],
      modelId: 'local-moss-image',
    }),
  ).rejects.toThrow(/本地图像服务地址/);

  // 未配置时不允许把图片路由指向本机服务，避免界面上选中一个永远失败的连接。
  expect(() => harness.handlers.get('settings:save-route')!({}, 'image', 'local')).toThrow(
    '请先在模型连接页填写本地图像服务地址，再把它设为能力路由。',
  );
});

it('批量生产也能选本地模型，未配置时同样给出地址提示', async () => {
  const idle = startRuntime(mkdtempSync(join(tmpdir(), 'studio-local-image-batch-idle-')));
  await expect(
    idle.invoke('batches:create', {
      name: '本地批次',
      aspectRatio: '9:16',
      modelId: 'local-moss-image',
      variants: [{ label: 'A', prompt: '第一版' }],
    }),
  ).rejects.toThrow(/本地图像服务地址/);

  const server = await startMock(pngResponse);
  const harness = startRuntime(mkdtempSync(join(tmpdir(), 'studio-local-image-batch-')));
  await harness.invoke('settings:save-local-image', { baseUrl: server.url, model: '' });

  const batch = await harness.invoke('batches:create', {
    name: '本地批次',
    aspectRatio: '9:16',
    modelId: 'local-moss-image',
    seed: 88,
    qualityTier: 'draft',
    variants: [
      { label: 'A', prompt: '第一版' },
      { label: 'B', prompt: '第二版' },
    ],
  });

  expect(batch.providerId).toBe('local');
  expect(batch.modelId).toBe('local-moss-image');
  expect(batch.aspectRatio).toBe('9:16');
  expect(batch.seed).toBe(88);
  // 本机服务不计费，批量预算不会被本地模型抬高。
  expect(batch.estimatedCostUsd).toBe(0);
});

it('保存地址后本地图像服务成为默认图片路由，并按当前画幅与种子真实出图', async () => {
  const server = await startMock(pngResponse);
  const directory = mkdtempSync(join(tmpdir(), 'studio-local-image-run-'));
  const harness = startRuntime(directory);

  const saved = await harness.invoke('settings:save-local-image', {
    baseUrl: `${server.url}/`,
    model: 'moss-image',
  });
  expect(saved.localImage).toEqual({ baseUrl: server.url, model: 'moss-image' });
  expect(saved.providers.find((provider: any) => provider.id === 'local')).toMatchObject({
    configured: true,
  });
  expect(saved.routes.image).toBe('local');
  // 本地服务不需要密钥，保存地址不能要求系统钥匙串授权。
  expect(saved.routes.image_edit).not.toBe('local');

  const job = await harness.invoke('generation:image', {
    prompt: '固定脸型的成年角色，夜晚街头',
    aspectRatio: '2:3',
    referenceAssetIds: [],
    qualityTier: 'standard',
    seed: 20261028,
    modelId: 'local-moss-image',
  });

  expect(job.status).toBe('completed');
  expect(job.request).toMatchObject({
    size: '1024x1536',
    requestedAspectRatio: '2:3',
    actualAspectRatio: '2:3',
    modelId: 'local-moss-image',
    providerModel: 'moss-image',
  });
  expect(server.bodies).toHaveLength(1);
  expect(server.bodies[0]).toMatchObject({
    model: 'moss-image',
    size: '1024x1536',
    seed: 20261028,
    quality: 'high',
    n: 1,
    response_format: 'b64_json',
  });
  const assets = await harness.invoke('assets:list', { type: 'image' });
  const asset = assets.find((item: any) => item.id === job.result.assetId);
  expect(asset?.mediaType).toBe('image/png');
  expect(readFileSync(asset.managedPath).equals(ONE_PIXEL_PNG)).toBe(true);
});

it('重启应用后本地图像服务地址、模型名与图片路由仍然保留', async () => {
  const server = await startMock(pngResponse);
  const directory = mkdtempSync(join(tmpdir(), 'studio-local-image-restart-'));

  const first = startRuntime(directory);
  await first.invoke('settings:save-local-image', {
    baseUrl: server.url,
    model: 'moss-image',
  });
  first.close();

  const second = startRuntime(directory);
  const status = await second.invoke('settings:provider-status');
  expect(status.localImage).toEqual({ baseUrl: server.url, model: 'moss-image' });
  expect(status.routes.image).toBe('local');

  // 重启后直接用本地模型出图，不需要重新填写地址。
  const job = await second.invoke('generation:image', {
    prompt: '重启后的第一张',
    aspectRatio: '3:2',
    referenceAssetIds: [],
    modelId: 'local-moss-image',
  });
  expect(job.status).toBe('completed');
  expect(server.bodies.at(-1)).toMatchObject({ size: '1536x1024' });
});

it('已配置云端服务时填写本地地址不会静默接管图片路由，用户手动切换才生效', async () => {
  const server = await startMock(pngResponse);
  const harness = startRuntime(mkdtempSync(join(tmpdir(), 'studio-local-image-priority-')));

  await harness.handlers.get('settings:save-provider-key')!(
    {},
    'openai',
    'openai-test-key-placeholder-123456',
  );
  expect((await harness.invoke('settings:provider-status')).routes.image).toBe('openai');

  const saved = await harness.invoke('settings:save-local-image', {
    baseUrl: server.url,
    model: 'moss-image',
  });
  // 已花钱配好的云端路由不能被一个随手填写的地址替换掉。
  expect(saved.routes.image).toBe('openai');

  const switched = await harness.handlers.get('settings:save-route')!({}, 'image', 'local');
  expect(switched.routes.image).toBe('local');
});

it('清空地址即关闭本地图像服务，避免继续向本机发起请求', async () => {
  const server = await startMock(pngResponse);
  const harness = startRuntime(mkdtempSync(join(tmpdir(), 'studio-local-image-clear-')));

  await harness.invoke('settings:save-local-image', { baseUrl: server.url, model: 'moss-image' });
  const cleared = await harness.invoke('settings:save-local-image', { baseUrl: '', model: '' });

  expect(cleared.localImage).toEqual({ baseUrl: '', model: '' });
  expect(cleared.providers.find((provider: any) => provider.id === 'local')).toMatchObject({
    configured: false,
  });
  expect(cleared.routes.image).not.toBe('local');
  expect(server.bodies).toHaveLength(0);
});

it('地址不是 http(s) 时拒绝保存，避免把密钥或路径拼进非法协议', async () => {
  const harness = startRuntime(mkdtempSync(join(tmpdir(), 'studio-local-image-invalid-')));

  await expect(
    harness.invoke('settings:save-local-image', { baseUrl: 'file:///tmp/model', model: '' }),
  ).rejects.toThrow('本地图像服务只支持 http 或 https 地址。');
  await expect(
    harness.invoke('settings:save-local-image', { baseUrl: '127.0.0.1:7860', model: '' }),
  ).rejects.toThrow(/完整地址/);
  const status = await harness.invoke('settings:provider-status');
  expect(status.localImage?.baseUrl).toBe('');
});
