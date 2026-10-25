import type { CreationQuickStage } from "./creation-flow";
import type { SingleImageChoice } from "./single-image-flow";

type SingleImageContractStripProps = {
  choices: SingleImageChoice[];
  activeStage: CreationQuickStage;
  onJump: (stage: CreationQuickStage) => void;
};

const STAGE_LABELS: Record<CreationQuickStage, string> = {
  direction: "主体",
  character: "造型",
  story: "场景",
  output: "确认",
};

/**
 * 即时预览已选约束：固定在主操作上方，宽屏横向排布，窄屏换行。
 * 每一项都可点回对应步骤，所以“已选什么”和“去哪改”是同一个动作。
 */
export function SingleImageContractStrip({ choices, activeStage, onJump }: SingleImageContractStripProps) {
  return <nav className="creator-contract-strip" aria-label="已选约束">
    <div className="creator-contract-strip-heading">
      <span>已选约束</span>
      <small>点任一项返回对应步骤</small>
    </div>
    <div className="creator-contract-strip-items" role="group" aria-label="已选约束清单">
      {choices.map((choice) => <button
        type="button"
        key={choice.id}
        className={choice.stage === activeStage ? "creator-contract-chip active" : "creator-contract-chip"}
        aria-current={choice.stage === activeStage ? "step" : undefined}
        aria-label={`已选${choice.label}：${choice.value}，返回${STAGE_LABELS[choice.stage]}步骤`}
        title={`${choice.label}：${choice.value}`}
        onClick={() => onJump(choice.stage)}
      >
        <small>{choice.label}</small>
        <strong>{choice.value}</strong>
      </button>)}
    </div>
  </nav>;
}
