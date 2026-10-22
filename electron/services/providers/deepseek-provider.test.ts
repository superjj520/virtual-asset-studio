import { afterEach, expect, it, vi } from 'vitest';
import { DeepSeekProvider } from './deepseek-provider';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

it('DeepSeek 以结构化 JSON 补全创作卡', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ scene: '雨后玻璃温室', reasoning: '补足场景基线' }) } }] }), { status: 200 }));
  globalThis.fetch = fetchMock as typeof fetch;
  const provider = new DeepSeekProvider({ apiKey: () => 'deepseek-test-key-with-enough-length' });
  await expect(provider.enrichCreativeCard({ intent: '人物创作', subject: '成年女性', identityAnchor: '', bodyAndWardrobe: '', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '', avoid: '', aspectRatio: '9:16', referenceAssetIds: [] })).resolves.toMatchObject({ scene: '雨后玻璃温室' });
  expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.deepseek.com/chat/completions');
  expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ model: 'deepseek-flash' });
});

it('DeepSeek 可以为 Gemini 图片与参考图编辑路由适配提示词', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ positive: '保持角色身份的写实夜景人像', negative: '文字、水印', notes: ['保留身份锚点'] }) } }],
  }), { status: 200 }));
  globalThis.fetch = fetchMock as typeof fetch;
  const provider = new DeepSeekProvider({ apiKey: () => 'deepseek-test-key-with-enough-length' });

  await expect(provider.translatePrompt({
    prompt: '角色夜景人像', negative: '水印', providerId: 'gemini', qualityTier: 'premium',
  })).resolves.toMatchObject({ providerId: 'gemini', qualityTier: 'premium', positive: '保持角色身份的写实夜景人像' });
});
