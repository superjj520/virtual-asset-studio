import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenAIProvider } from './openai-provider';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

it('未配置密钥时不发起远程生成', async () => {
  const provider = new OpenAIProvider({ apiKey: () => undefined });
  expect(provider.isConfigured()).toBe(false);
  await expect(provider.generateImage({ prompt: '测试', size: '1024x1024' })).rejects.toThrow('尚未配置');
});

it('用参考图发起高保真修订，并将编辑请求发送到图片编辑接口', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'studio-provider-'));
  const referencePath = join(directory, 'reference.png');
  writeFileSync(referencePath, Buffer.from([137, 80, 78, 71]));
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('edited-image').toString('base64') }] }), { status: 200 }));
  globalThis.fetch = fetchMock as typeof fetch;
  const provider = new OpenAIProvider({ apiKey: () => 'sk-test-key-with-enough-length' });
  await expect(provider.refineImage({ prompt: '只优化皮肤与发丝', size: '1024x1536', referencePath, referenceMediaType: 'image/png' })).resolves.toEqual(Buffer.from('edited-image'));
  expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/images/edits');
  const form = fetchMock.mock.calls[0]?.[1]?.body as FormData;
  expect(form.get('model')).toBe('gpt-image-2');
  expect(form.get('size')).toBe('1024x1536');
  expect(form.get('image')).toBeInstanceOf(Blob);
});

it('图生视频把起始帧、时长与尺寸一同提交给视频接口', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'studio-provider-video-'));
  const referencePath = join(directory, 'start.png');
  writeFileSync(referencePath, Buffer.from([137, 80, 78, 71]));
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'video_test', status: 'queued', progress: 0 }), { status: 200 }));
  globalThis.fetch = fetchMock as typeof fetch;
  const provider = new OpenAIProvider({ apiKey: () => 'sk-test-key-with-enough-length' });
  await expect(provider.createVideo({ prompt: '保持身份，只有发丝轻动', model: 'sora-2-pro', size: '720x1280', seconds: 4, referencePath, referenceMediaType: 'image/png' })).resolves.toMatchObject({ id: 'video_test', status: 'queued' });
  expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/videos');
  const form = fetchMock.mock.calls[0]?.[1]?.body as FormData;
  expect(form.get('seconds')).toBe('4');
  expect(form.get('size')).toBe('720x1280');
  expect(form.get('input_reference')).toBeInstanceOf(Blob);
});

it('视觉理解读取 Responses API 的 output 内容数组，不依赖 SDK 聚合字段', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'studio-provider-vision-'));
  const referencePath = join(directory, 'reference.png');
  writeFileSync(referencePath, Buffer.from([137, 80, 78, 71]));
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    output: [{ content: [{ type: 'output_text', text: '{"subject":"成年女性","editablePrompt":"人物肖像"}' }] }],
  }), { status: 200 }));
  globalThis.fetch = fetchMock as typeof fetch;
  const provider = new OpenAIProvider({ apiKey: () => 'sk-test-key-with-enough-length' });
  const report = await provider.analyzeImage({ filePath: referencePath, mediaType: 'image/png' });
  expect(report.subject).toBe('成年女性');
  expect(report.editablePrompt).toBe('人物肖像');
});
