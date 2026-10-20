export type FluxProviderOptions = { apiKey: () => string | undefined };
import { fetchProvider } from "./request";

type FluxRequest = { id?: string; polling_url?: string };
type FluxResult = { status?: string; result?: { sample?: string }; error?: string };

export class FluxProvider {
  readonly id = 'flux' as const;
  constructor(private readonly options: FluxProviderOptions) {}

  isConfigured(): boolean { return Boolean(this.options.apiKey()); }

  private async call(path: string, init: RequestInit): Promise<Response> {
    const apiKey = this.options.apiKey();
    if (!apiKey) throw new Error('尚未配置 FLUX API 密钥。');
    const response = await fetchProvider("FLUX", `https://api.bfl.ai/v1${path}`, { ...init, headers: { 'x-key': apiKey, ...(init.headers ?? {}) } });
    if (!response.ok) throw new Error(`FLUX 请求失败（${response.status}）：${(await response.text()).slice(0, 500)}`);
    return response;
  }

  async generateImage(input: { prompt: string; size: '1024x1024' | '1024x1536' | '1536x1024' }): Promise<Buffer> {
    const [width, height] = input.size === '1024x1536' ? [960, 1440] : input.size === '1536x1024' ? [1440, 960] : [1024, 1024];
    const created = await this.call('/flux-pro-1.1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: input.prompt, width, height, output_format: 'png' }) });
    const task = await created.json() as FluxRequest;
    if (!task.polling_url) throw new Error('FLUX 未返回可查询的生成任务。');
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const polled = await fetchProvider("FLUX", task.polling_url, { headers: { 'x-key': this.options.apiKey()! } }, 15_000);
      if (!polled.ok) throw new Error(`FLUX 任务查询失败（${polled.status}）。`);
      const result = await polled.json() as FluxResult;
      if (result.status === 'Ready' && result.result?.sample) {
        const file = await fetchProvider("FLUX", result.result.sample, {}, 60_000);
        if (!file.ok) throw new Error('FLUX 成图下载失败。');
        return Buffer.from(await file.arrayBuffer());
      }
      if (result.status === 'Error' || result.status === 'Failed') throw new Error(result.error || 'FLUX 成图失败。');
    }
    throw new Error('FLUX 生成超时，请稍后在任务队列重试。');
  }
}
