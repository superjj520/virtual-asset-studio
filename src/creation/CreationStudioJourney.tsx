export type CreationStudioStage = "plan" | "candidates" | "refine" | "asset";

export type CreationStudioKind = "character" | "image" | "scene" | "series";

const STAGES: Record<CreationStudioKind, Array<{ id: CreationStudioStage; label: string; hint: string }>> = {
  character: [
    { id: "plan", label: "确认角色", hint: "身份与造型" },
    { id: "candidates", label: "选择方向", hint: "比较并确认" },
    { id: "refine", label: "局部调整", hint: "一次只改一项" },
    { id: "asset", label: "角色资产", hint: "归档与复用" },
  ],
  image: [
    { id: "plan", label: "确认画面", hint: "人物与构图" },
    { id: "candidates", label: "选择方向", hint: "比较并确认" },
    { id: "refine", label: "局部调整", hint: "一次只改一项" },
    { id: "asset", label: "画面归档", hint: "保存与复用" },
  ],
  scene: [
    { id: "plan", label: "确认剧情", hint: "人物与事件" },
    { id: "candidates", label: "选择方向", hint: "比较并确认" },
    { id: "refine", label: "场景调整", hint: "一次只改一项" },
    { id: "asset", label: "场景资产", hint: "空间与状态" },
  ],
  series: [
    { id: "plan", label: "确认系列", hint: "角色与镜头" },
    { id: "candidates", label: "镜头方向", hint: "逐项确认" },
    { id: "refine", label: "连续性调整", hint: "锁定不变项" },
    { id: "asset", label: "系列归档", hint: "顺序与复用" },
  ],
};

type CreationStudioJourneyProps = {
  kind?: CreationStudioKind;
  active: CreationStudioStage;
  available: CreationStudioStage[];
  completed?: CreationStudioStage[];
  onChange: (stage: CreationStudioStage) => void;
};

export function CreationStudioJourney({
  kind = "character",
  active,
  available,
  completed = [],
  onChange,
}: CreationStudioJourneyProps) {
  return <nav className="creation-journey" aria-label="创作进度">
    {STAGES[kind].map((stage, index) => {
      const enabled = available.includes(stage.id);
      const isActive = active === stage.id;
      const isComplete = completed.includes(stage.id);
      return <button
        type="button"
        key={stage.id}
        className={`${isActive ? "active" : ""}${isComplete ? " complete" : ""}`}
        aria-current={isActive ? "step" : undefined}
        disabled={!enabled}
        onClick={() => onChange(stage.id)}
      >
        <span>{isComplete ? "✓" : index + 1}</span>
        <strong>{stage.label}</strong>
        <small>{stage.hint}</small>
      </button>;
    })}
  </nav>;
}
