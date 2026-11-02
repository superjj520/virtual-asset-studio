export const CLOUD_REFERENCE_SOURCE = {
  name: "POSE & CHARACTER Atlas",
  url: "https://ai-pose-gallery.anhao.app/",
  attribution: "anhao · 姿势 / 服装 / 人像云端参考库",
} as const;

export const CLOUD_REFERENCE_KINDS = ["portrait", "costume", "hair", "pose"] as const;
export type CloudReferenceKind = (typeof CLOUD_REFERENCE_KINDS)[number];

export const CLOUD_REFERENCE_KIND_LABELS: Record<CloudReferenceKind, string> = {
  portrait: "人像",
  costume: "服装",
  pose: "姿势",
  hair: "发型",
};

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
