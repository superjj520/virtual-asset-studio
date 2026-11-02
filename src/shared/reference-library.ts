export const CLOUD_REFERENCE_SOURCE = {
  name: "POSE & CHARACTER Atlas",
  url: "https://ai-pose-gallery.anhao.app/",
  attribution: "anhao · 姿势 / 服装 / 人像云端参考库",
} as const;

export const CLOUD_REFERENCE_KINDS = ["portrait", "costume", "hair", "pose", "depth", "anime-costume"] as const;
export type CloudReferenceKind = (typeof CLOUD_REFERENCE_KINDS)[number];

export const CLOUD_REFERENCE_KIND_LABELS: Record<CloudReferenceKind, string> = {
  portrait: "人像",
  costume: "服装",
  pose: "姿势",
  hair: "发型",
  depth: "深度",
  "anime-costume": "动漫衣装",
};

export const DEPTH_REFERENCE_SOURCE = {
  name: "POSE-DB Depth",
  url: "https://ai-pose-depth-gallery.pages.dev/",
  attribution: "depth ポーズ集 POSE-DB-02 · 姿势深度图，供 ControlNet Depth 使用",
} as const;

export const ANIME_COSTUME_REFERENCE_SOURCE = {
  name: "COSTUME-ANIME-DB",
  url: "https://ai-costume-anime-gallery.pages.dev/",
  attribution: "衣装集 アニメ版 COSTUME-ANIME-DB · 动漫服装参考库",
} as const;

export type CloudReferenceVariant = {
  /** 视角条目自身的唯一标识，引用后写入资产元数据。 */
  id: string;
  /** 视角名称，例如“正面”“斜侧”。 */
  label: string;
  thumbUrl: string;
  imageUrl: string;
};

export type CloudReferenceItem = {
  id: string;
  kind: CloudReferenceKind;
  title: string;
  category: string;
  tags: string[];
  thumbUrl: string;
  imageUrl: string;
  lineUrl?: string;
  sourceName: string;
  sourceUrl: string;
  /**
   * 同一姿势的多个视角。仅在姿势存在一个以上视角时提供；
   * 首项与 item 的 thumbUrl / imageUrl 一致，作为默认选择。
   */
  variants?: CloudReferenceVariant[];
};

/** 素材库体检：每个源单独测，不会因为一个源坏了就看不到别的源的状态。 */
export type CloudSourceHealth = {
  key: string;
  label: string;
  /** 读到的条目数；失败时为 0，不等于「这个源是空的」。 */
  count: number;
  status: "ok" | "empty" | "error";
  /** 失败原因，直接给用户看，不做二次包装。 */
  error?: string;
  durationMs: number;
};

export type CloudHealthReport = {
  checkedAt: string;
  totalItems: number;
  totalImages: number;
  sources: CloudSourceHealth[];
};

export type CloudReferenceCatalog = {
  sourceName: string;
  sourceUrl: string;
  attribution: string;
  fetchedAt: string;
  counts: Record<CloudReferenceKind, number>;
  imageCounts?: Record<CloudReferenceKind, number>;
  totalImages?: number;
  items: CloudReferenceItem[];
};
