import type { CreativeCard } from "./types";
import type { ReferenceStyle } from "./reference-styles";

/**
 * 参考卡把“身份、服装、姿态、场景”从多张参考图压缩成一张本地合成的参考板。
 * 模型只接收一张图，但提示词明确每个分区只提供一种信息，避免把参考板本身画进成图。
 */
export const REFERENCE_SHEET_ROLES = [
  "identity",
  "wardrobe",
  "pose",
  "scene",
] as const;

export const REFERENCE_SHEET_EXTRA_ROLES = ["extra1", "extra2"] as const;

export const REFERENCE_SHEET_ALL_ROLES = [
  ...REFERENCE_SHEET_ROLES,
  ...REFERENCE_SHEET_EXTRA_ROLES,
] as const;

export type ReferenceSheetRole = (typeof REFERENCE_SHEET_ALL_ROLES)[number];
export type ReferenceSheetExtraRole = (typeof REFERENCE_SHEET_EXTRA_ROLES)[number];

export const REFERENCE_SHEET_ROLE_LABELS: Record<ReferenceSheetRole, string> = {
  identity: "身份",
  wardrobe: "服装",
  pose: "姿态",
  scene: "场景",
  extra1: "补充 1",
  extra2: "补充 2",
};

export type ReferenceSheetSlotInput = {
  role: ReferenceSheetRole;
  assetId: string;
};

export type ReferenceSheetSlot = ReferenceSheetSlotInput & {
  name: string;
  sha256?: string;
};

export type ReferenceSheetPanel = {
  role: ReferenceSheetRole;
  column: 0 | 1 | 2;
  row: 0 | 1;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
};

export type ReferenceSheetLayout = {
  kind: "1x2" | "2x2" | "3x2";
  width: number;
  height: number;
  gap: number;
  panels: ReferenceSheetPanel[];
};

export type ReferenceSheetPrompt = {
  positive: string;
  negative: string;
  modules: Array<{ label: string; value: string }>;
};

export type ReferenceSheetRecipe = {
  version: 1;
  layout: ReferenceSheetLayout;
  slots: ReferenceSheetSlot[];
  prompt: ReferenceSheetPrompt;
  style?: ReferenceStyle;
  rightsBasis: string;
  createdAt: string;
};

const ROLE_ORDER = new Map(
  REFERENCE_SHEET_ALL_ROLES.map((role, index) => [role, index]),
);

const clean = (value: string) => value.trim().replace(/\s+/g, " ");

export const isReferenceSheetRole = (
  value: unknown,
): value is ReferenceSheetRole =>
  typeof value === "string" &&
  REFERENCE_SHEET_ALL_ROLES.includes(value as ReferenceSheetRole);

export const normalizeReferenceSheetSlots = (
  input: unknown,
): ReferenceSheetSlotInput[] => {
  if (!Array.isArray(input)) return [];
  const seenRoles = new Set<ReferenceSheetRole>();
  const seenAssets = new Set<string>();
  const result: Array<ReferenceSheetSlotInput & { name?: string; sha256?: string }> = [];
  for (const value of input) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const candidate = value as Record<string, unknown>;
    if (!isReferenceSheetRole(candidate.role)) continue;
    if (typeof candidate.assetId !== "string" || !candidate.assetId.trim())
      continue;
    if (seenRoles.has(candidate.role) || seenAssets.has(candidate.assetId))
      continue;
    seenRoles.add(candidate.role);
    seenAssets.add(candidate.assetId);
    result.push({
      role: candidate.role,
      assetId: candidate.assetId,
      ...(typeof candidate.name === "string" ? { name: candidate.name } : {}),
      ...(typeof candidate.sha256 === "string" ? { sha256: candidate.sha256 } : {}),
    });
  }
  return result
    .sort(
      (left, right) =>
        (ROLE_ORDER.get(left.role) ?? 99) - (ROLE_ORDER.get(right.role) ?? 99),
    )
    .map((slot) => ({
      role: slot.role,
      assetId: slot.assetId,
      ...(slot.name ? { name: slot.name } : {}),
      ...(slot.sha256 ? { sha256: slot.sha256 } : {}),
    }));
};

export const referenceSheetLayout = (
  slots: ReferenceSheetSlotInput[],
): ReferenceSheetLayout => {
  const count = normalizeReferenceSheetSlots(slots).length;
  const gap = 24;
  if (count <= 2) {
    const width = 1440;
    const height = 960;
    const panelWidth = (width - gap * 3) / 2;
    const panelHeight = height - gap * 2;
    return {
      kind: "1x2",
      width,
      height,
      gap,
      panels: normalizeReferenceSheetSlots(slots).map((slot, index) => ({
        role: slot.role,
        column: index as 0 | 1,
        row: 0,
        x: gap + index * (panelWidth + gap),
        y: gap,
        width: panelWidth,
        height: panelHeight,
        label: index === 0 ? "左格" : "右格",
      })),
    };
  }
  const width = 1440;
  const height = 1440;
  const panelSize = (width - gap * 3) / 2;
  const normalized = normalizeReferenceSheetSlots(slots);
  if (normalized.length === 3) {
    const bottomY = gap + panelSize + gap;
    const bottomHeight = height - bottomY - gap;
    return {
      kind: "2x2",
      width,
      height,
      gap,
      panels: normalized.map((slot, index) => ({
        role: slot.role,
        column: (index === 1 ? 1 : 0) as 0 | 1,
        row: (index === 2 ? 1 : 0) as 0 | 1,
        x: index === 2 ? gap : gap + index * (panelSize + gap),
        y: index === 2 ? bottomY : gap,
        width: index === 2 ? width - gap * 2 : panelSize,
        height: index === 2 ? bottomHeight : panelSize,
        label: index === 0 ? "左上格" : index === 1 ? "右上格" : "下方整行",
      })),
    };
  }
  if (normalized.length >= 5) {
    const width = 1440;
    const height = 960;
    const panelWidth = (width - gap * 4) / 3;
    const panelHeight = (height - gap * 3) / 2;
    const labels = ["左上格", "中上格", "右上格", "左下格", "中下格", "右下格"];
    return {
      kind: "3x2",
      width,
      height,
      gap,
      panels: normalized.map((slot, index) => ({
        role: slot.role,
        column: (index % 3) as 0 | 1 | 2,
        row: (index < 3 ? 0 : 1) as 0 | 1,
        x: gap + (index % 3) * (panelWidth + gap),
        y: gap + (index < 3 ? 0 : 1) * (panelHeight + gap),
        width: panelWidth,
        height: panelHeight,
        label: labels[index] ?? `第 ${index + 1} 格`,
      })),
    };
  }
  const positions = [
    { column: 0 as const, row: 0 as const, label: "左上格" },
    { column: 1 as const, row: 0 as const, label: "右上格" },
    { column: 0 as const, row: 1 as const, label: "左下格" },
    { column: 1 as const, row: 1 as const, label: "右下格" },
  ];
  return {
    kind: "2x2",
    width,
    height,
    gap,
    panels: normalized.map((slot, index) => ({
      role: slot.role,
      ...positions[index],
      x: gap + positions[index].column * (panelSize + gap),
      y: gap + positions[index].row * (panelSize + gap),
      width: panelSize,
      height: panelSize,
    })),
  };
};

const panelFor = (
  layout: ReferenceSheetLayout,
  role: ReferenceSheetRole,
) => layout.panels.find((panel) => panel.role === role);

const roleInstruction: Record<
  ReferenceSheetRole,
  (label: string) => string
> = {
  identity: (label) =>
    `${label}只提供人物身份：严格沿用其脸型、五官、肤色、年龄感与发型，不重新设计。`,
  wardrobe: (label) =>
    `${label}只提供服装与配饰：采用其款式、材质、颜色和配饰，穿在身份人物身上。`,
  pose: (label) =>
    `${label}只提供姿态与身体朝向：采用其站位、重心、手部位置和镜头角度，不要复制成第二个人。`,
  scene: (label) =>
    `${label}只提供场景、光线与色调：沿用其空间、环境、光源方向和色彩气氛，人物仍须清晰可辨。`,
  extra1: (label) =>
    `${label}只提供补充细节：只提取其材质、配饰或光影等明确细节；发色、发型、肤色、脸型、年龄、服装结构、姿态和场景必须严格沿用身份/服装/姿态/场景参考，补充参考不得覆盖。`,
  extra2: (label) =>
    `${label}只提供补充细节：只提取其材质、配饰或光影等明确细节；发色、发型、肤色、脸型、年龄、服装结构、姿态和场景必须严格沿用身份/服装/姿态/场景参考，补充参考不得覆盖。`,
};

export const buildReferenceSheetPrompt = (
  slots: ReferenceSheetSlotInput[],
  style?: ReferenceStyle,
): ReferenceSheetPrompt => {
  const normalized = normalizeReferenceSheetSlots(slots);
  const layout = referenceSheetLayout(normalized);
  const modules = normalized.map((slot) => {
    const panel = panelFor(layout, slot.role);
    return {
      label: `${REFERENCE_SHEET_ROLE_LABELS[slot.role]}参考`,
      value: roleInstruction[slot.role](panel?.label ?? "参考板"),
    };
  });
  if (style) modules.push({ label: "画风", value: style.positive });
  const negative = [
    "拼贴画、分屏、四宫格、六宫格、参考板边框、分格线、文字、水印、多个主体、身份漂移、服装不一致、肢体畸形",
    style?.negative,
  ]
    .filter(Boolean)
    .join("、");
    const references = normalized.map(
    (slot) =>
      `${REFERENCE_SHEET_ROLE_LABELS[slot.role]}以${REFERENCE_SHEET_ROLE_LABELS[slot.role]}参考为准`,
  );
  const positive = [
    "任务：生成一张完整的单幅新画面，不是拼贴图，也不是参考板的复制。",
    `参考图是一张${
      normalized.length === 3
        ? "上方两格、下方整行的三格"
        : layout.kind === "3x2"
          ? "2 行 3 列的六格"
          : layout.kind === "2x2"
            ? "2×2 四格"
            : "左右两格"
    }素材参考板，每个分区只读取对应信息，不复制版式。`,
    ...modules.map((module) => `${module.label}：${module.value}`),
    `输出约束：单个人物、单幅构图、无分屏、无边框、无分格线、无文字、无水印${references.length ? `；${references.join("，")}` : ""}。`,
  ].join("\n");
  return { positive, negative, modules };
};

const mergeText = (left: string | undefined, right: string | undefined) =>
  [left?.trim(), right?.trim()].filter(Boolean).join("；");

/**
 * 把参考卡的分区语义写入现有创作卡，保证真正送模时模型知道每个分区是什么。
 * 只改提示词字段，不改变参考图选择与生成链路。
 */
export const applyReferenceSheetToCard = (
  card: CreativeCard,
  recipe: ReferenceSheetRecipe,
): CreativeCard => {
  const layout = recipe.layout;
  const slot = (role: ReferenceSheetRole) => {
    const item = recipe.slots.find((candidate) => candidate.role === role);
    return item ? panelFor(layout, role)?.label ?? "参考板" : "";
  };
  const identityLabel = slot("identity");
  const wardrobeLabel = slot("wardrobe");
  const poseLabel = slot("pose");
  const sceneLabel = slot("scene");
  const extraLabels = recipe.slots
    .filter((item) => item.role === "extra1" || item.role === "extra2")
    .map((item) => item.name);
  return {
    ...card,
    identityAnchor: identityLabel
      ? `${identityLabel}人物身份：沿用参考板中的脸型、五官、肤色、年龄感、发色与发型走向，不重新设计`
      : card.identityAnchor,
    bodyAndWardrobe: wardrobeLabel
      ? `${wardrobeLabel}服装与配饰：沿用参考板中的款式、材质、颜色和配饰`
      : card.bodyAndWardrobe,
    expressionAndPose: poseLabel
      ? `${poseLabel}姿态与身体朝向：沿用参考板中的站位、重心、手部位置和镜头角度`
      : card.expressionAndPose,
    scene: sceneLabel
      ? `${sceneLabel}场景、光线与色调：沿用参考板中的空间、环境、光源方向和色彩气氛`
      : card.scene,
    mustKeep: mergeText(
      mergeText(
        mergeText(card.mustKeep, "参考图是素材参考板：只读取各分区信息，不把分格线、边框或拼贴版式画进成图"),
        recipe.prompt.positive,
      ),
      extraLabels.length
        ? `补充参考 ${extraLabels.join("、")}：只提取材质、配饰或光影等明确细节；发色、发型、肤色、脸型、年龄、服装结构、姿态和场景必须严格沿用身份/服装/姿态/场景参考，补充参考不得覆盖。`
        : "",
    ),
    avoid: mergeText(card.avoid, recipe.prompt.negative),
  };
};

const referenceSheetLayoutLine = /参考板|四格|四宫格|六格|六宫格|左上格|中上格|右上格|左下格|中下格|右下格|分格线|分屏|拼贴|2×2|3×2|下方整行/;

/**
 * 单参考模型只接收一张图。参考卡用于人类整理与追溯，
 * 不能把带分格的合成图直接送进去，否则模型会复刻版式。
 * 这里删除只有“看参考板”才成立的句子，保留人物、风格与画质约束。
 */
export const stripReferenceSheetLayoutLanguage = (prompt: string): string =>
  prompt
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && (!referenceSheetLayoutLine.test(line) || /无分屏|无边框|无分格线|不要复制/.test(line)))
    .join("\n")
    .trim();
