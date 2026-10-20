import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GeminiProvider } from './gemini-provider';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const imagePayload = (value = 'gemini-image') => ({ interaction: { output_image: { data: Buffer.from(value).toString('base64'), mime_type: 'image/png' } } });

it('Gemini 可按质量档位生成图片并解析 inlineData', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(imagePayload()), { status: 200 }));
  globalThis.fetch = fetchMock as typeof fetch;
  const provider = new GeminiProvider({ apiKey: () => 'gemini-test-key-with-enough-length' });
  await expect(provider.generateImage({ prompt: '写实人物', size: '1024x1536', quality: 'high' })).resolves.toEqual(Buffer.from('gemini-image'));
  expect(fetchMock.mock.calls[0]?.[0]).toContain('/v1beta/interactions');
  expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ model: 'gemini-3.1-flash-image', response_format: { type: 'image', aspect_ratio: '2:3', image_size: '2K' } });
});

it('Gemini 支持把已授权参考图作为修订输入', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'gemini-provider-test-'));
  try {
    const referencePath = join(directory, 'reference.png');
    writeFileSync(referencePath, Buffer.from('reference-image'));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(imagePayload('edited')), { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;
    const provider = new GeminiProvider({ apiKey: () => 'gemini-test-key-with-enough-length' });
    await expect(provider.refineImage({ prompt: '保持人物身份，只优化光线', size: '1024x1024', referencePath, referenceMediaType: 'image/png' })).resolves.toEqual(Buffer.from('edited'));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ input: [{ type: 'text', text: '保持人物身份，只优化光线' }, { type: 'image', mime_type: 'image/png' }] });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('Gemini API 错误和无图片响应会明确失败', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), { status: 429 })) as typeof fetch;
  const provider = new GeminiProvider({ apiKey: () => 'gemini-test-key-with-enough-length' });
  await expect(provider.generateImage({ prompt: '写实人物', size: '1024x1024' })).rejects.toThrow(/Gemini 请求失败.*quota exceeded/);
  globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '只有文字' }] } }] }), { status: 200 })) as typeof fetch;
  await expect(provider.generateImage({ prompt: '写实人物', size: '1024x1024' })).rejects.toThrow(/未返回图片数据/);
});

it('Gemini 主图片模型在 Free Tier 限额为 0 时只回退一次到轻量图片模型', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Rate limit exceeded for model (limit: 0 input tokens per minute on Free Tier)' } }), { status: 429 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(imagePayload('lite-image')), { status: 200 }));
  globalThis.fetch = fetchMock as typeof fetch;
  const provider = new GeminiProvider({ apiKey: () => 'gemini-test-key-with-enough-length' });
  await expect(provider.generateImage({ prompt: '静物', size: '1024x1024', quality: 'medium' })).resolves.toEqual(Buffer.from('lite-image'));
  expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ model: 'gemini-3.1-flash-lite-image' });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('未配置 Gemini 密钥时不会发出请求', async () => {
  const fetchMock = vi.fn();
  globalThis.fetch = fetchMock as typeof fetch;
  const provider = new GeminiProvider({ apiKey: () => undefined });
  await expect(provider.generateImage({ prompt: '写实人物', size: '1024x1024' })).rejects.toThrow(/尚未配置 Gemini/);
  expect(fetchMock).not.toHaveBeenCalled();
});
