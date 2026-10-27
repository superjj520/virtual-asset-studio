// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { LOCAL_IMAGE_DEFAULT_MODEL, LocalImageProvider } from './local-image-provider';

/** 1×1 RGBA PNG：用来验证适配器把 b64_json 还原成真实图片字节。 */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

type MockRequest = { method?: string; url?: string; body: any };
type MockServer = {
  url: string;
  requests: MockRequest[];
  close: () => Promise<void>;
};

const openServers: MockServer[] = [];

afterEach(async () => {
  while (openServers.length) await openServers.pop()!.close();
});

const startMock = async (
  respond: (request: MockRequest, response: ServerResponse) => void,
): Promise<MockServer> => {
  const requests: MockRequest[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const captured: MockRequest = {
        method: request.method,
        url: request.url,
        body: raw ? JSON.parse(raw) : undefined,
      };
      requests.push(captured);
      respond(captured, response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const handle: MockServer = {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
  openServers.push(handle);
  return handle;
};

const json = (response: ServerResponse, status: number, payload: unknown) => {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
};

it('未填写地址时视为未配置，并且不发起任何本地请求', async () => {
  const provider = new LocalImageProvider({ baseUrl: () => undefined });
  expect(provider.isConfigured()).toBe(false);
  await expect(
    provider.generateImage({ prompt: '角色肖像', size: '1024x1024' }),
  ).rejects.toThrow('尚未配置本地图像服务地址。');
});

it('把当前画幅、种子、画质与模型名一起发给本地服务，并还原出图片字节', async () => {
  const server = await startMock((_request, response) =>
    json(response, 200, { data: [{ b64_json: ONE_PIXEL_PNG.toString('base64') }] }),
  );
  // 地址带多余空格与尾斜杠时仍然拼出唯一的 /v1/images/generations。
  const provider = new LocalImageProvider({
    baseUrl: () => ` ${server.url}/ `,
    model: () => undefined,
  });
  expect(provider.isConfigured()).toBe(true);

  const image = await provider.generateImage({
    prompt: '固定脸型的成年角色，夜晚街头',
    size: '1024x1536',
    seed: 424242,
    quality: 'high',
  });

  expect(server.requests).toHaveLength(1);
  expect(server.requests[0].method).toBe('POST');
  expect(server.requests[0].url).toBe('/v1/images/generations');
  expect(server.requests[0].body).toMatchObject({
    model: LOCAL_IMAGE_DEFAULT_MODEL,
    size: '1024x1536',
    seed: 424242,
    quality: 'high',
    n: 1,
    response_format: 'b64_json',
  });
  // 画幅必须是创作页选中的真实像素尺寸，而不是被服务端猜出来的比例。
  expect(server.requests[0].body.size).toBe('1024x1536');
  expect(image.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(image.equals(ONE_PIXEL_PNG)).toBe(true);
});

it('保存的模型名优先，避免项折进提示词而不是另造字段', async () => {
  const server = await startMock((_request, response) =>
    json(response, 200, { data: [{ b64_json: ONE_PIXEL_PNG.toString('base64') }] }),
  );
  const provider = new LocalImageProvider({
    baseUrl: () => server.url,
    model: () => ' moss-image-v2 ',
  });

  await provider.generateImage({
    prompt: '角色肖像',
    negative: '多余的肢体',
    size: '1536x864',
    quality: 'medium',
  });

  const body = server.requests[0].body;
  expect(body.model).toBe('moss-image-v2');
  expect(body.prompt).toBe('角色肖像\n\n避免：多余的肢体');
  expect(body).not.toHaveProperty('negative');
  expect(body).not.toHaveProperty('seed');
  expect(body.size).toBe('1536x864');
});

it('服务只返回图片链接时按链接取回图片字节', async () => {
  const server = await startMock((request, response) => {
    if (request.url === '/v1/images/generations') {
      json(response, 200, { data: [{ url: '/file/one-pixel.png' }] });
      return;
    }
    response.writeHead(200, { 'Content-Type': 'image/png' });
    response.end(ONE_PIXEL_PNG);
  });
  const provider = new LocalImageProvider({ baseUrl: () => server.url });

  // 相对链接按服务地址补全，本地服务不必知道自己被哪个主机名访问。
  const image = await provider.generateImage({ prompt: '角色肖像', size: '1024x1024' });
  expect(image.equals(ONE_PIXEL_PNG)).toBe(true);
  expect(server.requests.map((request) => request.url)).toEqual([
    '/v1/images/generations',
    '/file/one-pixel.png',
  ]);
});

it('本地服务返回错误状态时抛出带状态码的信息，不假装生成成功', async () => {
  const server = await startMock((_request, response) =>
    json(response, 500, { error: { message: 'CUDA out of memory' } }),
  );
  const provider = new LocalImageProvider({ baseUrl: () => server.url });

  await expect(
    provider.generateImage({ prompt: '角色肖像', size: '1024x1024' }),
  ).rejects.toThrow(/本地图像服务失败（500）/);
});

it('返回体缺少图片数据时明确报错，避免把空结果当成一张图', async () => {
  const server = await startMock((_request, response) => json(response, 200, { data: [] }));
  const provider = new LocalImageProvider({ baseUrl: () => server.url });

  await expect(
    provider.generateImage({ prompt: '角色肖像', size: '1024x1024' }),
  ).rejects.toThrow('本地图像服务没有返回图片数据。');
});
