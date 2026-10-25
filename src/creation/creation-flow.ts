import type { CreationLaunchKind } from "./CreationLaunchpad";

export type CreationQuickStage = "direction" | "character" | "story" | "output";

export type CreationFlowContract = {
  eyebrow: string;
  title: string;
  rootAriaLabel: string;
  previewAriaLabel: string;
  sourceGroupLabel: string;
  sourceHeading: string;
  sourceHint: string;
  stages: Array<{ id: CreationQuickStage; label: string; short: string }>;
  characterHeading: string;
  characterHint: string;
  storyHeading: string;
  storyHint: string;
  outputHeading: string;
  outputHint: string;
  readyLabel: string;
  readyTitle: string;
  readyHint: string;
  finalAction: string;
  previewPrimaryLabel: string;
  previewSecondaryLabel: string;
};

export const CREATION_FLOW_CONTRACTS: Record<CreationLaunchKind, CreationFlowContract> = {
  character: {
    eyebrow: "角色塑造",
    title: "选一个方向，建立角色资产",
    rootAriaLabel: "角色塑造工作台",
    previewAriaLabel: "角色预览",
    sourceGroupLabel: "角色来源",
    sourceHeading: "从哪里开始",
    sourceHint: "新建、复用或参考",
    stages: [
      { id: "direction", label: "起点", short: "角色来源与视觉方向" },
      { id: "character", label: "人物", short: "身份、造型与角色内核" },
      { id: "story", label: "世界", short: "角色所在的场景世界" },
      { id: "output", label: "确认", short: "检查并保存角色资产" },
    ],
    characterHeading: "锁定角色内核",
    characterHint: "身份、造型与性格会进入同一角色档案",
    storyHeading: "选择角色世界",
    storyHint: "场景会成为角色后续延展的默认环境",
    outputHeading: "确认角色方案",
    outputHint: "检查角色身份、造型与后续扩展基础",
    readyLabel: "角色资产已就绪",
    readyTitle: "人物设定将沉淀为可复用角色",
    readyHint: "保存后直接进入角色中枢，继续扩展造型、表情、动作与剧情。",
    finalAction: "保存为角色资产",
    previewPrimaryLabel: "角色",
    previewSecondaryLabel: "交付",
  },
  image: {
    eyebrow: "单张画面",
    title: "选主体和画面，建立单张方案",
    rootAriaLabel: "单张画面工作台",
    previewAriaLabel: "单张画面预览",
    sourceGroupLabel: "主角来源",
    sourceHeading: "选择画面主角",
    sourceHint: "原创、已有角色或参考图",
    stages: [
      { id: "direction", label: "主体", short: "主角来源与视觉方向" },
      { id: "character", label: "造型", short: "身份、服装、动作与表情" },
      { id: "story", label: "场景", short: "环境与画面气质" },
      { id: "output", label: "输出", short: "镜头、画幅、质感与候选" },
    ],
    characterHeading: "确定主体造型",
    characterHint: "选择人物在这张画面中的身份、服装与表演",
    storyHeading: "选择画面环境",
    storyHint: "场景与气质共同决定光线和氛围",
    outputHeading: "确认单张画面",
    outputHint: "锁定镜头、画幅、质感与候选数量",
    readyLabel: "单张方案已就绪",
    readyTitle: "所有选择已保存为一张图的创作条件",
    readyHint: "建立方案后进入创作画布继续调整与生成。",
    finalAction: "建立单张画面方案",
    previewPrimaryLabel: "主体",
    previewSecondaryLabel: "画幅",
  },
  scene: {
    eyebrow: "剧情场景",
    title: "选演员和事件，搭出剧情瞬间",
    rootAriaLabel: "剧情场景工作台",
    previewAriaLabel: "剧情场景预览",
    sourceGroupLabel: "演员来源",
    sourceHeading: "选择场景演员",
    sourceHint: "原创、已有角色或参考图",
    stages: [
      { id: "direction", label: "演员", short: "演员来源与视觉方向" },
      { id: "character", label: "表演", short: "造型、动作与表情" },
      { id: "story", label: "剧情", short: "关系、事件、节拍与氛围" },
      { id: "output", label: "输出", short: "镜头、画幅、质感与候选" },
    ],
    characterHeading: "确定演员表演",
    characterHint: "造型、动作和表情服务于这一剧情瞬间",
    storyHeading: "搭出剧情瞬间",
    storyHint: "选择关系、事件与节拍，系统写入场景方案",
    outputHeading: "确认剧情场景",
    outputHint: "锁定镜头、画幅、质感与候选数量",
    readyLabel: "剧情方案已就绪",
    readyTitle: "演员、事件与空间已经组成一个场景",
    readyHint: "建立方案后进入创作画布继续调整与生成。",
    finalAction: "建立剧情场景方案",
    previewPrimaryLabel: "演员",
    previewSecondaryLabel: "画幅",
  },
  series: {
    eyebrow: "系列镜头",
    title: "锁定角色，规划连续镜头",
    rootAriaLabel: "系列镜头工作台",
    previewAriaLabel: "连续镜头预览",
    sourceGroupLabel: "连续角色来源",
    sourceHeading: "锁定系列主角",
    sourceHint: "后续镜头沿用同一身份",
    stages: [
      { id: "direction", label: "角色", short: "角色来源与系列方向" },
      { id: "character", label: "连续性", short: "身份、造型与表演基线" },
      { id: "story", label: "分镜", short: "镜头变化与顺序" },
      { id: "output", label: "交付", short: "画幅、质感、质量与数量" },
    ],
    characterHeading: "锁定连续性基线",
    characterHint: "角色身份和造型在整组镜头中保持一致",
    storyHeading: "规划连续镜头",
    storyHint: "选择每个镜头的任务并调整顺序",
    outputHeading: "确认系列交付",
    outputHint: "锁定统一画幅、质感、质量与候选数量",
    readyLabel: "系列方案已就绪",
    readyTitle: "角色连续性与镜头顺序已写入同一方案",
    readyHint: "建立方案后进入创作画布继续调整与生成。",
    finalAction: "建立系列镜头方案",
    previewPrimaryLabel: "连续性",
    previewSecondaryLabel: "镜头数",
  },
};

export function getCreationFlowContract(kind: CreationLaunchKind): CreationFlowContract {
  return CREATION_FLOW_CONTRACTS[kind];
}
