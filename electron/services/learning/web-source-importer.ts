import type { PromptSource } from '../../../src/shared/types';

type Fetcher = typeof fetch;

const decodeEntities = (value: string) => value
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>');

const textFrom = (value: string) => decodeEntities(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());

const pageTitle = (html: string) => {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? textFrom(title).slice(0, 160) : undefined;
};

const pageDescription = (html: string) => {
  const meta = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*>/i);
  return meta?.[1] ? decodeEntities(meta[1]).trim().slice(0, 360) : undefined;
};

const isPrivateHost = (host: string) => host === 'localhost'
  || host.endsWith('.local')
  || /^127\./.test(host)
  || /^10\./.test(host)
  || /^192\.168\./.test(host)
  || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  || host === '::1';

/** 只登记用户明确提供的公开页面元信息，不抓取正文、图片或受限内容。 */
export const importWebPromptSource = async (
  rawUrl: string,
  fetchImpl: Fetcher = fetch,
): Promise<Omit<PromptSource, 'id' | 'importedAt'>> => {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error('请输入完整的公开 HTTPS 页面链接。');
  }
  if (url.protocol !== 'https:') throw new Error('仅支持公开 HTTPS 页面。');
  if (isPrivateHost(url.hostname.toLowerCase())) throw new Error('不能读取本机或内网地址。');
  const response = await fetchImpl(url.toString(), {
    headers: { Accept: 'text/html,application/xhtml+xml' },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`公开页面读取失败（${response.status}）。请确认页面可匿名访问。`);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) throw new Error('该链接不是可解析的网页。');
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > 512_000) throw new Error('页面过大，请粘贴具体提示词页面而不是整站入口。');
  const html = await response.text();
  if (html.length > 512_000) throw new Error('页面过大，请粘贴具体提示词页面而不是整站入口。');
  const title = pageTitle(html) ?? `${url.hostname} 公开提示词页面`;
  const summary = pageDescription(html) ?? '已登记公开页面；请在确认使用权后选择具体提示词导入为候选模块。';
  return {
    url: url.toString(),
    repository: url.hostname,
    title,
    summary,
    sourceType: 'web',
    status: 'needs_review',
  };
};
