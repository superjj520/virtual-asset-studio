import { describe, expect, it, vi } from 'vitest';
import { importWebPromptSource } from './web-source-importer';

describe('importWebPromptSource', () => {
  it('只提取公开页面的最小来源信息，不保存页面正文', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(`
      <html><head><title>人物摄影提示词</title><meta name="description" content="可复用的人像提示词案例" /></head></html>
    `, { status: 200, headers: { 'content-type': 'text/html' } }));

    const source = await importWebPromptSource('https://example.com/prompts/portrait', fetchImpl);

    expect(source).toMatchObject({
      url: 'https://example.com/prompts/portrait',
      repository: 'example.com',
      title: '人物摄影提示词',
      summary: '可复用的人像提示词案例',
      sourceType: 'web',
      status: 'needs_review',
    });
    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/prompts/portrait', expect.objectContaining({ redirect: 'error' }));
  });

  it('拒绝本机和内网地址', async () => {
    await expect(importWebPromptSource('http://127.0.0.1/prompts')).rejects.toThrow('仅支持公开 HTTPS 页面');
    await expect(importWebPromptSource('https://localhost/prompts')).rejects.toThrow('不能读取本机或内网地址');
  });
});
