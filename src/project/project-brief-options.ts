import type { ProjectBrief } from "../shared/types";

export type ProjectBriefSingleKey = "goal" | "audience" | "visualWorld" | "delivery";

export const PROJECT_BRIEF_OPTIONS: Record<ProjectBriefSingleKey, {
  label: string;
  options: string[];
}> = {
  goal: {
    label: "项目目标",
    options: ["建立可复用角色", "生成单张主视觉", "制作连续场景", "完成角色设定板", "制作宣传封面"],
  },
  audience: {
    label: "使用方向",
    options: ["个人创作", "内容配图", "竖屏漫剧", "游戏资产", "客户交付"],
  },
  visualWorld: {
    label: "视觉世界",
    options: ["写实东方幻想", "现代现实", "古风写实", "时尚编辑", "动漫风格"],
  },
  delivery: {
    label: "交付结果",
    options: ["1 张主图", "3 张候选", "角色设定板", "多场景组图", "镜头起始帧"],
  },
};

export const PROJECT_ACCEPTANCE_OPTIONS = [
  "人物一致",
  "真人质感",
  "场景准确",
  "服装细节",
  "构图氛围",
];

export const isCustomBriefValue = (key: ProjectBriefSingleKey, value: string) =>
  Boolean(value) && value !== "自定义" && !PROJECT_BRIEF_OPTIONS[key].options.includes(value);

export const toggleAcceptance = (current: string, value: string) => {
  const values = current.split("；").map((item) => item.trim()).filter(Boolean);
  return values.includes(value)
    ? values.filter((item) => item !== value).join("；")
    : [...values, value].join("；");
};

export const hasAcceptance = (brief: ProjectBrief, value: string) =>
  brief.acceptance.split("；").map((item) => item.trim()).includes(value);
