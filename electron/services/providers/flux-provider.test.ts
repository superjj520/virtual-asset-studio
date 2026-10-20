import { afterEach, expect, it, vi } from 'vitest';
import { FluxProvider } from './flux-provider';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

it('FLUX 提交任务、轮询完成状态并下载成图', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ polling_url: 'https://poll.example/task-1' }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'Ready', result: { sample: 'https://result.example/image.png' } }), { status: 200 }))
    .mockResolvedValueOnce(new Response(Buffer.from('flux-image'), { status: 200 }));
  globalThis.fetch = fetchMock as typeof fetch;
  const provider = new FluxProvider({ apiKey: () => 'flux-test-key-with-enough-length' });
  await expect(provider.generateImage({ prompt: '夜色中的东方人像', size: '1024x1536' })).resolves.toEqual(Buffer.from('flux-image'));
  expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.bfl.ai/v1/flux-pro-1.1');
  expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ width: 960, height: 1440, output_format: 'png' });
});
