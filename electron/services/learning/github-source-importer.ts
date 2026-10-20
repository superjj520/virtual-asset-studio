export type GitHubPromptSource = { url: string; repository: string; title: string; license?: string; summary: string; status: 'imported' | 'needs_review' };

export const importGitHubPromptSource = async (url: string): Promise<GitHubPromptSource> => {
  const match = url.trim().match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?(?:#.*)?$/);
  if (!match) throw new Error('目前仅支持公开 GitHub 仓库首页地址，例如 https://github.com/组织/仓库。');
  const repository = `${match[1]}/${match[2]}`;
  const response = await fetch(`https://api.github.com/repos/${repository}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'virtual-asset-studio' } });
  if (!response.ok) throw new Error(`GitHub 仓库读取失败（${response.status}）。请确认地址公开且有效。`);
  const payload = await response.json() as { name?: string; description?: string; license?: { spdx_id?: string | null; name?: string | null } | null; archived?: boolean; fork?: boolean };
  const summary = [payload.description?.trim() || '未提供仓库说明。', payload.archived ? '仓库已归档。' : '', payload.fork ? '此仓库是 Fork，请核对上游来源。' : ''].filter(Boolean).join(' ');
  return { url: `https://github.com/${repository}`, repository, title: payload.name || repository, license: payload.license?.spdx_id || payload.license?.name || undefined, summary, status: payload.archived || payload.fork ? 'needs_review' : 'imported' };
};
