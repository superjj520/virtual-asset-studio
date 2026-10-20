import { afterEach, expect, it, vi } from 'vitest';
import { fetchProvider } from './request';

afterEach(() => vi.restoreAllMocks());

it('响应体读取超时会中止并返回可解释错误', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: () => new Promise(() => undefined),
  }));
  const response = await fetchProvider('测试服务', 'https://example.test', {}, 5);
  await expect(response.json()).rejects.toThrow(/响应内容读取超时/);
});
