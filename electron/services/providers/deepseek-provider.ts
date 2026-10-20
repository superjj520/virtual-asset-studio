import type {
  CreativeCard,
  CreativeCardSuggestion,
  GenerationQualityTier,
  PromptTranslation,
} from "../../../src/shared/types";
import { fetchProvider } from "./request";

export class DeepSeekProvider {
  readonly id = "deepseek" as const;
  constructor(private readonly options: { apiKey: () => string | undefined }) {}
  isConfigured(): boolean {
    return Boolean(this.options.apiKey());
  }
  async enrichCreativeCard(
    card: CreativeCard,
  ): Promise<CreativeCardSuggestion> {
    const apiKey = this.options.apiKey();
    if (!apiKey) throw new Error("尚未配置 DeepSeek API 密钥。");
    const response = await fetchProvider("DeepSeek", "https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-flash",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "你是影视人物资产策划师。只返回 JSON，不新增真实人物身份、不猜测敏感属性。仅补足用户已给出创作方向中缺失的视觉字段，避免堆砌形容词。",
          },
          { role: "user", content: JSON.stringify(card) },
        ],
      }),
    });
    if (!response.ok)
      throw new Error(
        `DeepSeek 请求失败（${response.status}）：${(await response.text()).slice(0, 500)}`,
      );
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek 未返回创作建议。");
    try {
      return JSON.parse(content) as CreativeCardSuggestion;
    } catch {
      throw new Error("DeepSeek 返回内容不是可用的结构化建议。");
    }
  }

  async translatePrompt(input: {
    prompt: string;
    negative?: string;
    providerId: "openai" | "flux" | "fal";
    qualityTier: GenerationQualityTier;
  }): Promise<PromptTranslation> {
    const apiKey = this.options.apiKey();
    if (!apiKey) throw new Error("尚未配置 DeepSeek API 密钥。");
    const response = await fetchProvider("DeepSeek", "https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-flash",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "你是图像生成提示词适配器。只返回 JSON，字段为 positive、negative、notes。保留原始创作意图与身份锚点，不新增真实人物身份或敏感属性；删除互相矛盾、模型无效的参数。positive 使用中文清晰描述；negative 只保留必要避免项；notes 是不超过三条的中文说明。",
          },
          { role: "user", content: JSON.stringify(input) },
        ],
      }),
    });
    if (!response.ok)
      throw new Error(
        `DeepSeek 请求失败（${response.status}）：${(await response.text()).slice(0, 500)}`,
      );
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek 未返回提示词适配结果。");
    try {
      const value = JSON.parse(content) as Pick<
        PromptTranslation,
        "positive" | "negative" | "notes"
      >;
      if (!value.positive?.trim()) throw new Error("empty");
      return {
        providerId: input.providerId,
        qualityTier: input.qualityTier,
        positive: value.positive.trim(),
        negative: value.negative?.trim() ?? "",
        notes: Array.isArray(value.notes)
          ? value.notes
              .filter((item): item is string => typeof item === "string")
              .slice(0, 3)
          : [],
      };
    } catch {
      throw new Error("DeepSeek 返回内容不是可用的提示词适配结果。");
    }
  }
}
