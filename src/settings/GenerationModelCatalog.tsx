import type { ProviderStatus } from "../shared/types";
import {
  estimateGenerationCostUsd,
  listGenerationModels,
  type GenerationModel,
  type GenerationTaskKind,
} from "../shared/generation-models";

type Props = {
  providers?: ProviderStatus["providers"];
  selectedModelId?: string;
  onSelect: (modelId: string | undefined) => void;
};

const taskLabels: Record<GenerationTaskKind, string> = {
  portrait: "人像",
  scene: "场景",
  series: "连续镜头",
  text_layout: "文字版式",
  edit: "参考图修订",
};

const costLabel = (model: GenerationModel) => {
  const cost = estimateGenerationCostUsd(model);
  return cost === undefined ? "按量计费" : `约 $${cost.toFixed(3)}/张`;
};

const providerLabel = (providerId: GenerationModel["providerId"]) =>
  providerId === "fal" ? "fal" : providerId === "gemini" ? "Gemini" : providerId === "openai" ? "OpenAI" : "FLUX";

export function GenerationModelCatalog({ providers, selectedModelId, onSelect }: Props) {
  const models = listGenerationModels(providers);
  return <section className="form-panel generation-model-catalog" aria-label="图像模型能力">
    <div className="generation-model-catalog-heading">
      <div>
        <p className="eyebrow">图像模型能力</p>
        <p className="result-note">按任务、参考图和成本选择；默认模型会随创作任务一起保存。</p>
      </div>
      <button type="button" className={selectedModelId ? "subtle-button" : "primary-button"} onClick={() => onSelect(undefined)}>
        {selectedModelId ? "恢复自动选择" : "当前为自动选择"}
      </button>
    </div>
    <div className="generation-model-catalog-grid">
      {models.map((model) => <article key={model.id} className={`generation-model-card${selectedModelId === model.id ? " selected" : ""}`}>
        <header>
          <div><strong>{model.label}</strong><small>{providerLabel(model.providerId)} · {model.model}</small></div>
          <span className={model.available ? "model-ready" : "model-unconfigured"}>{model.available ? "可用" : "未配置"}</span>
        </header>
        <p>{model.description}</p>
        <dl>
          <div><dt>擅长</dt><dd>{model.tasks.map((task) => taskLabels[task]).join(" · ")}</dd></div>
          <div><dt>参考图</dt><dd>{model.supportsReference ? `支持，最多 ${model.maxReferences} 张` : "纯文本生成"}</dd></div>
          <div><dt>画质</dt><dd>{model.qualityMode === "tiered" ? "支持画质档位" : "按画幅固定输出"}</dd></div>
          <div><dt>成本</dt><dd>{costLabel(model)}</dd></div>
        </dl>
        <button type="button" className={selectedModelId === model.id ? "secondary-button" : "primary-button"} disabled={!model.available} onClick={() => onSelect(model.id)}>
          {selectedModelId === model.id ? "已设为默认" : model.available ? "设为默认" : "配置后可用"}
        </button>
      </article>)}
    </div>
  </section>;
}
