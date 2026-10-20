import { afterEach, expect, it, vi } from 'vitest';
import { importGitHubPromptSource } from './github-source-importer';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

it('只接受公开 GitHub 仓库首页并读取许可元数据', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: '提示词库', description: '可复用的图像模板', license: { spdx_id: 'MIT' } }), { status: 200 })) as typeof fetch;
  await expect(importGitHubPromptSource('https://github.com/example/prompt-library')).resolves.toMatchObject({ repository: 'example/prompt-library', license: 'MIT', status: 'imported' });
  await expect(importGitHubPromptSource('https://example.com/unsafe')).rejects.toThrow('GitHub');
});
