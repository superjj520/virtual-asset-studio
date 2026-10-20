import { randomUUID } from "node:crypto";
import type {
  ParadigmComposition,
  VisualParadigm,
  VisualParadigmRole,
} from "../../../src/shared/types";
import { StudioDatabase } from "../../db/client";

type Row = {
  id: string;
  name: string;
  role: VisualParadigmRole;
  description: string;
  prompt_module: string;
  compatible_roles_json: string;
  conflicts_json: string;
  status: VisualParadigm["status"];
  usage_count: number;
  created_at: string;
  updated_at: string;
};

const map = (row: Row): VisualParadigm => ({
  ...row,
  promptModule: row.prompt_module,
  compatibleRoles: JSON.parse(row.compatible_roles_json),
  conflictsWith: JSON.parse(row.conflicts_json),
  usageCount: row.usage_count,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
const allRoles: VisualParadigmRole[] = [
  "主体表达",
  "摄影与媒介",
  "版式与构图",
  "作品用途",
  "世界观与气质",
];

const defaults: Array<
  Omit<VisualParadigm, "id" | "usageCount" | "createdAt" | "updatedAt">
> = [
  {
    name: "编辑式人像",
    role: "摄影与媒介",
    description: "让人物进入杂志编辑拍摄的造型、景别、表情与背景关系。",
    promptModule:
      "编辑式人像摄影，人物造型完整，克制表情，明确视觉重心，真实皮肤、头发与面料细节",
    compatibleRoles: allRoles,
    conflictsWith: [],
    status: "validated",
  },
  {
    name: "极简时尚封面",
    role: "版式与构图",
    description: "用留白、少色彩和明确主体位置建立封面级视觉层级。",
    promptModule:
      "极简时尚封面构图，低信息密度，充足留白，人物为视觉中心，无文字、无标志、无水印",
    compatibleRoles: allRoles,
    conflictsWith: ["复杂角色设定板"],
    status: "validated",
  },
  {
    name: "独立艺术企划主视觉",
    role: "作品用途",
    description: "把人物放进独立艺术项目的统一视觉身份中。",
    promptModule:
      "独立艺术企划主视觉，具有统一的概念身份、节制的符号感和非对称视觉节奏",
    compatibleRoles: allRoles,
    conflictsWith: [],
    status: "candidate",
  },
  {
    name: "角色设定板",
    role: "作品用途",
    description: "服务于角色资产沉淀，突出可辨识特征、服装和道具。",
    promptModule:
      "角色设定板，清晰展示人物外观、服装层次、辨识物与可复用设计信息",
    compatibleRoles: allRoles,
    conflictsWith: ["极简时尚封面"],
    status: "validated",
  },
  {
    name: "电影感人像",
    role: "摄影与媒介",
    description: "强调电影画面中的自然光影、空间关系与真实镜头感。",
    promptModule:
      "电影感真人肖像摄影，自然光影，细腻动态范围，真实皮肤纹理和环境空间感",
    compatibleRoles: allRoles,
    conflictsWith: ["数字水粉"],
    status: "validated",
  },
  {
    name: "奢侈香水广告",
    role: "作品用途",
    description: "以高级材质、克制姿态与精确光线塑造奢侈广告感。",
    promptModule:
      "奢侈香水广告视觉语言，高级材质，精确轮廓光，克制而有张力的造型",
    compatibleRoles: allRoles,
    conflictsWith: [],
    status: "candidate",
  },
  {
    name: "史诗概念艺术",
    role: "世界观与气质",
    description: "建立宏大尺度、强叙事暗示和统一世界观。",
    promptModule:
      "史诗概念艺术，强空间尺度与叙事暗示，世界观统一，主体与环境关系清晰",
    compatibleRoles: allRoles,
    conflictsWith: ["极简时尚封面"],
    status: "validated",
  },
  {
    name: "数字水粉",
    role: "摄影与媒介",
    description: "用颗粒、半透明叠色与手绘材质承载角色视觉开发。",
    promptModule: "数字水粉绘制，半透明叠色，纸张颗粒和克制笔触，非摄影媒介",
    compatibleRoles: allRoles,
    conflictsWith: ["编辑式人像", "电影感人像"],
    status: "candidate",
  },
];

export class VisualParadigmRepository {
  constructor(private readonly db: StudioDatabase) {
    this.seed();
  }
  private seed() {
    const insert = this.db.database.prepare(
      "INSERT OR IGNORE INTO visual_paradigms (id, name, role, description, prompt_module, compatible_roles_json, conflicts_json, status, usage_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
    );
    const now = new Date().toISOString();
    for (const item of defaults)
      insert.run(
        randomUUID(),
        item.name,
        item.role,
        item.description,
        item.promptModule,
        JSON.stringify(item.compatibleRoles),
        JSON.stringify(item.conflictsWith),
        item.status,
        now,
        now,
      );
  }
  list(): VisualParadigm[] {
    return (
      this.db.database
        .prepare(
          "SELECT * FROM visual_paradigms WHERE status != 'rejected' ORDER BY CASE status WHEN 'validated' THEN 0 ELSE 1 END, role, name",
        )
        .all() as Row[]
    ).map(map);
  }
  compose(ids: string[]): ParadigmComposition {
    const unique = [...new Set(ids)].slice(0, 4);
    const paradigms = unique.length
      ? (
          this.db.database
            .prepare(
              `SELECT * FROM visual_paradigms WHERE id IN (${unique.map(() => "?").join(",")})`,
            )
            .all(...unique) as Row[]
        ).map(map)
      : [];
    const warnings: string[] = [];
    const roles = paradigms.map((item) => item.role);
    for (const role of [...new Set(roles)])
      if (roles.filter((item) => item === role).length > 1)
        warnings.push(
          `“${role}”选择了多个范式；建议只保留一个，避免它们争夺画面主导权。`,
        );
    for (const item of paradigms)
      for (const conflict of item.conflictsWith)
        if (paradigms.some((other) => other.name === conflict))
          warnings.push(`“${item.name}”与“${conflict}”的视觉惯例存在冲突。`);
    const acceptance = paradigms.length
      ? `观众应看到：以${paradigms.map((item) => item.name).join(" × ")}组织的${paradigms.find((item) => item.role === "主体表达")?.name ?? "人物"}视觉作品。`
      : "先选择一到四个视觉范式，确定这次要生产哪一种视觉作品。";
    return {
      paradigms,
      acceptance,
      promptModule: paradigms
        .map((item) => `[${item.role}] ${item.promptModule}`)
        .join("；"),
      warnings: [...new Set(warnings)],
      canApply: paradigms.length > 0 && warnings.length === 0,
    };
  }
  create(
    input: Pick<
      VisualParadigm,
      "name" | "role" | "description" | "promptModule"
    >,
  ): VisualParadigm {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db.database
      .prepare(
        "INSERT INTO visual_paradigms (id, name, role, description, prompt_module, compatible_roles_json, conflicts_json, status, usage_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
      )
      .run(
        id,
        input.name.trim(),
        input.role,
        input.description.trim(),
        input.promptModule.trim(),
        JSON.stringify(allRoles),
        "[]",
        "candidate",
        now,
        now,
      );
    return this.get(id)!;
  }
  get(id: string): VisualParadigm | undefined {
    const row = this.db.database
      .prepare("SELECT * FROM visual_paradigms WHERE id = ?")
      .get(id) as Row | undefined;
    return row ? map(row) : undefined;
  }
  recordUse(ids: string[]) {
    if (!ids.length) return;
    this.db.database
      .prepare(
        `UPDATE visual_paradigms SET usage_count = usage_count + 1, updated_at = ? WHERE id IN (${ids.map(() => "?").join(",")})`,
      )
      .run(new Date().toISOString(), ...ids);
  }
}
