import type { CreativeAspectRatio, ImageGenerationSize, ProviderStatus } from "../shared/types";
import {
  listGenerationModels,
  preflightGeneration,
  type GenerationTaskKind,
} from "../shared/generation-models";

type GenerationModelPickerProps = {
  providers?: ProviderStatus["providers"];
  task: GenerationTaskKind;
  referenceCount: number;
  value?: string;
  onChange: (modelId: string | undefined) => void;
  size?: ImageGenerationSize | { width: number; height: number };
  aspectRatio?: CreativeAspectRatio;
  qualityTier?: "draft" | "standard" | "premium";
};

const formatCost = (value: number | undefined) =>
  value === undefined ? "按量计费" : `官方估算 $${value.toFixed(3)}/张`;

export function GenerationModelPicker({
  providers,
  task,
  referenceCount,
  value,
  onChange,
  size,
  aspectRatio,
  qualityTier = "standard",
}: GenerationModelPickerProps) {
  const options = listGenerationModels(providers).filter((model) =>
    model.tasks.includes(task) || model.id === value,
  );
  const preflight = preflightGeneration({
    task,
    referenceCount,
    preferredModelId: value,
    providers,
    size,
    aspectRatio,
  });
  const selected = options.find((model) => model.id === value && preflight.model?.id === model.id);
  const selectValue = selected ? value ?? "" : value ? "" : preflight.model?.id ?? "";
  return (
    <div className="generation-model-picker">
      <label>
        图像模型
        <select
          value={selectValue}
          onChange={(event) => onChange(event.target.value || undefined)}
        >
          <option value="">自动选择</option>
          {options.map((model) => {
            const referenceIncompatible = referenceCount > 0 && !model.supportsReference;
            const ratioIncompatible = Boolean(aspectRatio && !model.supportedAspectRatios.includes(aspectRatio));
            return <option
              value={model.id}
              key={model.id}
              disabled={!model.available || referenceIncompatible || ratioIncompatible}
            >
              {model.label}
              {!model.available ? "（未配置）" : referenceIncompatible ? "（不支持参考图）" : ratioIncompatible ? `（不支持 ${aspectRatio}）` : ""}
            </option>;
          })}
        </select>
      </label>
      <small className={preflight.ok || !preflight.model ? "warn" : ""}>
        {selected
          ? `${formatCost(preflight.estimatedCostUsd)} · ${selected.costNote ?? selected.description}`
          : preflight.model
            ? `自动：${preflight.model.label} · ${formatCost(preflight.estimatedCostUsd)}`
            : preflight.issues[0] ?? "尚未选择可用模型"}
      </small>
      {preflight.model?.qualityMode === "fixed" && <small className="generation-model-quality-note">
        固定输出：切换画质档不会改变请求像素。
      </small>}
      {preflight.model?.providerId === "fal" && <small className="generation-model-quality-note">
        实际扣费以 fal 账单为准；当前只显示官方单价估算。
      </small>}
    </div>
  );
}
