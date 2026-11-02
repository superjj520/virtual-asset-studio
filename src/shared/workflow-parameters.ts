/**
 * ComfyUI 工作流的参数级编辑：从 API 格式 JSON 里找出「用户能改的字段」。
 *
 * 为什么需要：现在设置里只能整段粘贴或导入工作流 JSON，改一个步数都得重新导出一遍。
 * 对标插件的做法是从节点定义里认出可编辑参数，生成控件，提交时只替换这些值。
 *
 * 判断规则（与 ComfyUI 前端一致）：
 * - 输入值是数组 [来源节点, 输出序号] → 这是一根连线，不能手改
 * - 输入值是对象且带 `__value__` → 强制连接，也不能改
 * - 其余标量（字符串 / 数字 / 布尔）→ 可编辑
 */

export type WorkflowControlKind = "boolean" | "number" | "string" | "enum";

export type WorkflowControlOption = { value: string | number; label: string };

/** `_meta.studio.controls` 里声明的推荐参数；只描述已存在的字段，不创造字段。 */
export type WorkflowControlHint = {
  input: string;
  /** 声明的字段属于哪个节点；写在一起声明别的节点的参数时必填。 */
  node?: string | number;
  label?: string;
  description?: string;
  group?: string;
  options?: WorkflowControlOption[];
};

export type WorkflowParameter = {
  /** 节点编号，例如 "3"。 */
  nodeId: string;
  /** 节点标题，用于分组显示。 */
  nodeTitle: string;
  /** 输入字段名，例如 "steps"。 */
  input: string;
  kind: WorkflowControlKind;
  value: string | number | boolean;
  label: string;
  description?: string;
  group: string;
  /** kind 为 enum 时的候选值。 */
  options?: WorkflowControlOption[];
  /** 是否在 `_meta.studio.controls` 里被推荐过。 */
  recommended: boolean;
  /** 声明顺序；没有声明时是 Infinity，排序用。 */
  order: number;
};

export type WorkflowParameterReport = {
  parameters: WorkflowParameter[];
  /** 连线或强制连接的字段，仅供说明，不可编辑。 */
  linkedInputs: number;
  /** 声明了推荐参数、但工作流里并不存在的字段——说明作者的元数据过期了。 */
  staleHints: string[];
  /** 值是纯占位符（`{{seed}}` 这类）而被系统注入的字段数——改了也会被覆盖，不给控件。 */
  placeholderInputs: number;
};

/** 整串就是一个 `{{占位符}}`：提交前由 buildWorkflow 注入，不能当手动参数。 */
const PLACEHOLDER_ONLY = /^\{\{[A-Za-z0-9_]+\}\}$/;

const isLink = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length === 2 &&
  (typeof value[0] === "string" || typeof value[0] === "number") &&
  typeof value[1] === "number";

const isForcedConnection = (value: unknown): boolean =>
  typeof value === "object" && value !== null && "__value__" in (value as Record<string, unknown>);

/** 一个值能生成什么控件；返回 undefined 表示这个字段不可编辑。 */
const kindOf = (value: unknown): WorkflowControlKind | undefined => {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  return undefined;
};

/**
 * 扫描工作流，列出所有可编辑参数。
 *
 * 命名优先用 `_meta.studio.controls` 里的 label；没有就用 `节点标题 / 字段名`，
 * 这样即使工作流没写 studio 元数据，普通 API 也能被认出来。
 */
export const listWorkflowParameters = (workflow: unknown): WorkflowParameterReport => {
  const parameters: WorkflowParameter[] = [];
  const staleHints: string[] = [];
  let linkedInputs = 0;

  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow))
    return { parameters, linkedInputs, staleHints, placeholderInputs: 0 };

  let placeholderInputs = 0;

  // 先收集全部控件声明：`node` 字段允许把别的节点的参数写在一起声明，
  // 只按字段名匹配会把它们误判成「元数据过期」。
  const hintsByKey = new Map<string, { hint: WorkflowControlHint; order: number }>();
  const titleByNode = new Map<string, string>();
  for (const [nodeId, rawNode] of Object.entries(workflow as Record<string, unknown>)) {
    if (!rawNode || typeof rawNode !== "object") continue;
    const node = rawNode as Record<string, unknown>;
    const meta = (node._meta ?? {}) as Record<string, unknown>;
    titleByNode.set(nodeId, typeof meta.title === "string" && meta.title ? meta.title : nodeId);
    const studio = (meta.studio ?? {}) as Record<string, unknown>;
    const hints = Array.isArray(studio.controls) ? (studio.controls as WorkflowControlHint[]) : [];
    hints.forEach((hint, index) => {
      if (!hint || typeof hint.input !== "string") return;
      const owner =
        typeof hint.node === "string" || typeof hint.node === "number" ? String(hint.node) : nodeId;
      hintsByKey.set(`${owner}/${hint.input}`, { hint, order: index });
    });
  }

  for (const [nodeId, rawNode] of Object.entries(workflow as Record<string, unknown>)) {
    if (!rawNode || typeof rawNode !== "object") continue;
    const node = rawNode as Record<string, unknown>;
    const inputs = node.inputs;
    if (!inputs || typeof inputs !== "object") continue;

    const meta = (node._meta ?? {}) as Record<string, unknown>;
    const nodeTitle = titleByNode.get(nodeId) ?? nodeId;
    const studio = (meta.studio ?? {}) as Record<string, unknown>;
    const hidden = new Set(
      Array.isArray(studio.hiddenInputs)
        ? (studio.hiddenInputs as unknown[]).filter((name): name is string => typeof name === "string")
        : [],
    );

    for (const [input, value] of Object.entries(inputs as Record<string, unknown>)) {
      if (isLink(value) || isForcedConnection(value)) {
        linkedInputs += 1;
        continue;
      }
      if (hidden.has(input)) continue;
      // 纯占位符字段由系统在提交时注入，给出控件只会被覆盖，用户改了也不生效。
      if (typeof value === "string" && PLACEHOLDER_ONLY.test(value)) {
        placeholderInputs += 1;
        continue;
      }
      const kind = kindOf(value);
      if (!kind) continue;

      const declared = hintsByKey.get(`${nodeId}/${input}`);
      const hint = declared?.hint;
      if (declared) hintsByKey.delete(`${nodeId}/${input}`);

      const options = hint?.options?.filter((option) => typeof option.value !== "undefined");
      parameters.push({
        nodeId,
        nodeTitle,
        input,
        kind: options && options.length > 0 ? "enum" : kind,
        value: value as string | number | boolean,
        label: hint?.label?.trim() || `${nodeTitle} / ${input}`,
        description: hint?.description,
        group: hint?.group?.trim() || "其他参数",
        options: options && options.length > 0 ? options : undefined,
        recommended: Boolean(hint),
        order: declared?.order ?? Number.POSITIVE_INFINITY,
      });
    }
  }

  // 声明了但字段不存在：元数据过期，提示出来而不是静默忽略。
  for (const [key, entry] of hintsByKey) {
    const [owner, input] = key.split("/");
    staleHints.push(`${titleByNode.get(owner ?? "") ?? owner} / ${input ?? entry.hint.input}`);
  }

  // 推荐参数排前面，同组内按节点编号稳定排序。
  parameters.sort((left, right) => {
    if (left.recommended !== right.recommended) return left.recommended ? -1 : 1;
    if (left.group !== right.group) return left.group.localeCompare(right.group, "zh-Hans-CN");
    // 同组内按作者声明的顺序，没声明的排后面按字段名。
    if (left.order !== right.order) return left.order - right.order;
    if (left.nodeId !== right.nodeId) return left.nodeId.localeCompare(right.nodeId, "numeric");
    return left.input.localeCompare(right.input);
  });

  return { parameters, linkedInputs, staleHints, placeholderInputs };
};

/** 参数覆盖值的键：`节点编号 / 字段名`，换工作流时不会串到别的节点上。 */
export const parameterKey = (nodeId: string, input: string): string => `${nodeId}/${input}`;

/**
 * 把覆盖值写回工作流，返回新对象，不改原工作流。
 *
 * 只覆盖「仍然存在且仍然可编辑」的字段：工作流换了、字段被连线了、类型对不上，
 * 都跳过——宁可少改一个值，也不要把别人的工作流改坏。
 */
export const applyWorkflowOverrides = (
  workflow: unknown,
  overrides: Record<string, string | number | boolean>,
  report: WorkflowParameterReport = listWorkflowParameters(workflow),
): { workflow: unknown; applied: string[]; skipped: string[] } => {
  const applied: string[] = [];
  const skipped: string[] = [];
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow))
    return { workflow, applied, skipped };

  const clone = JSON.parse(JSON.stringify(workflow)) as Record<string, Record<string, unknown>>;
  const editable = new Map(report.parameters.map((item) => [parameterKey(item.nodeId, item.input), item]));

  for (const [key, raw] of Object.entries(overrides)) {
    const target = editable.get(key);
    if (!target) {
      skipped.push(key);
      continue;
    }
    const inputs = clone[target.nodeId]?.inputs as Record<string, unknown> | undefined;
    if (!inputs) {
      skipped.push(key);
      continue;
    }
    // 类型必须和原值一致，避免把 "20" 写进本来就是数字的步数。
    if (typeof inputs[target.input] !== typeof raw) {
      skipped.push(key);
      continue;
    }
    inputs[target.input] = raw;
    applied.push(key);
  }

  return { workflow: clone, applied, skipped };
};

/** 把工作流恢复成导入时的样子：清掉所有覆盖值。 */
export const resetWorkflowOverrides = (): Record<string, string | number | boolean> => ({});
