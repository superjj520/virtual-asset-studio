// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CustomImageProvider } from './custom-image-provider';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const servers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (servers.length) await servers.pop()!();
});

const start = async (respond: (body: any, response: ServerResponse) => void) => {
  const requests: any[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      requests.push(body);
      respond(body, response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  servers.push(() => new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));
  return { baseUrl: `http://127.0.0.1:${port}/v1`, requests };
};

it('按 OpenAI 兼容协议发送模型、尺寸、种子与负面词，并解码 b64 图片', async () => {
  const mock = await start((_body, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ data: [{ b64_json: ONE_PIXEL_PNG.toString('base64') }] }));
  });
  const provider = new CustomImageProvider({
    baseUrl: () => mock.baseUrl,
    apiKey: () => 'sk-test-12345678',
    model: () => 'qwen-image',
  });
  const image = await provider.generateImage({
    prompt: '一张单幅人像',
    negative: '拼贴、分屏',
    size: '1024x1536',
    seed: 42,
  });
  expect(image.subarray(1, 4).toString()).toBe('PNG');
  expect(mock.requests[0]).toMatchObject({
    model: 'qwen-image',
    size: '1024x1536',
    seed: 42,
    n: 1,
    response_format: 'b64_json',
  });
  expect(mock.requests[0].prompt).toContain('避免：拼贴、分屏');
});

it('未配置地址或密钥时拒绝请求', async () => {
  const provider = new CustomImageProvider({
    baseUrl: () => undefined,
    apiKey: () => undefined,
    model: () => 'qwen-image',
  });
  await expect(provider.generateImage({ prompt: 'x', size: '1024x1024' })).rejects.toThrow('接口地址');
});
