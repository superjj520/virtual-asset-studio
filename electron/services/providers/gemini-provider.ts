import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fetchProvider } from './request';

export type GeminiProviderOptions = { apiKey: () => string | undefined };

type GeminiPart = { inlineData?: { data?: string; mimeType?: string }; inline_data?: { data?: string; mime_type?: string }; text?: string };
type GeminiResponse = {
  interaction?: { output_image?: { data?: string; mime_type?: string } };
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  error?: { code?: string; message?: string };
};

const primaryImageModel = 'gemini-3.1-flash-image';
const freeTierImageModel = 'gemini-3.1-flash-lite-image';

const aspectRatioFor = (size: '1024x1024' | '1024x1536' | '1536x1024') =>
  size === '1024x1024' ? '1:1' : size === '1536x1024' ? '3:2' : '2:3';

const extractImage = (payload: GeminiResponse): Buffer => {
  const interactionImage = payload.interaction?.output_image?.data;
  if (interactionImage) return Buffer.from(interactionImage, 'base64');
  const parts = payload.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];
  const image = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
  const encoded = image?.inlineData?.data ?? image?.inline_data?.data;
  if (!encoded) throw new Error('Gemini 未返回图片数据，请检查模型权限、配额和提示词。');
  return Buffer.from(encoded, 'base64');
};

export class GeminiProvider {
  readonly id = 'gemini' as const;
  constructor(private readonly options: GeminiProviderOptions) {}

  isConfigured(): boolean { return Boolean(this.options.apiKey()); }

  async verifyConnection(): Promise<void> {
    const apiKey = this.options.apiKey();
    if (!apiKey) throw new Error('尚未配置 Gemini API 密钥。请在设置中完成本机连接。');
    const response = await fetchProvider('Gemini', 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
      method: 'GET',
      headers: { 'x-goog-api-key': apiKey },
    }, 20_000);
    const payload = await response.json() as { models?: unknown[]; error?: { code?: number; message?: string } };
    if (!response.ok) {
      const code = payload.error?.code ? ` [${payload.error.code}]` : '';
      throw new Error(`Gemini 连接验证失败（${response.status}${code}）：${payload.error?.message ?? '请检查 API 密钥、网络和项目权限。'}`);
    }
    if (!Array.isArray(payload.models)) throw new Error('Gemini 连接成功，但没有返回可用模型列表。');
  }

  private async request(body: Record<string, unknown>): Promise<GeminiResponse> {
    const apiKey = this.options.apiKey();
    if (!apiKey) throw new Error('尚未配置 Gemini API 密钥。请在设置中完成本机连接。');
    const response = await fetchProvider('Gemini', 'https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as GeminiResponse;
    if (!response.ok) {
      const code = payload.error?.code ? ` [${payload.error.code}]` : '';
      throw new Error(`Gemini 请求失败（${response.status}${code}）：${payload.error?.message ?? '请检查 API 密钥、模型和配额。'}`);
    }
    return payload;
  }

  private async requestImage(body: Record<string, unknown>): Promise<GeminiResponse> {
    try {
      return await this.request(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (body.model === primaryImageModel && /Gemini 请求失败（429）.*limit: 0.*Free Tier/i.test(message))
        return this.request({ ...body, model: freeTierImageModel });
      throw error;
    }
  }

  async generateImage(input: { prompt: string; size: '1024x1024' | '1024x1536' | '1536x1024'; quality?: 'medium' | 'high' }): Promise<Buffer> {
    const payload = await this.requestImage({
      model: primaryImageModel,
      input: input.prompt,
      response_format: { type: 'image', aspect_ratio: aspectRatioFor(input.size), image_size: input.quality === 'high' ? '2K' : '1K' },
    });
    return extractImage(payload);
  }

  async refineImage(input: { prompt: string; size: '1024x1024' | '1024x1536' | '1536x1024'; referencePath: string; referenceMediaType: string }): Promise<Buffer> {
    const payload = await this.requestImage({
      model: primaryImageModel,
      input: [
        { type: 'text', text: input.prompt },
        { type: 'image', mime_type: input.referenceMediaType, data: readFileSync(input.referencePath).toString('base64') },
      ],
      response_format: { type: 'image', aspect_ratio: aspectRatioFor(input.size), image_size: '2K' },
    });
    return extractImage(payload);
  }
}
