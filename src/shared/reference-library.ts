export const CLOUD_REFERENCE_SOURCE = {
  name: "POSE & CHARACTER Atlas",
  url: "https://ai-pose-gallery.anhao.app/",
  attribution: "anhao · 姿势 / 服装 / 人像云端参考库",
} as const;

export const CLOUD_REFERENCE_KINDS = ["portrait", "costume", "pose"] as const;
export type CloudReferenceKind = (typeof CLOUD_REFERENCE_KINDS)[number];

export const CLOUD_REFERENCE_KIND_LABELS: Record<CloudReferenceKind, string> = {
  portrait: "人像",
  costume: "服装",
  pose: "姿势",
};

export type CloudReferenceItem = {
  id: string;
  kind: CloudReferenceKind;
  title: string;
  category: string;
  tags: string[];
  thumbUrl: string;
  imageUrl: string;
  sourceName: string;
  sourceUrl: string;
};

export type CloudReferenceCatalog = {
  sourceName: string;
  sourceUrl: string;
  attribution: string;
  fetchedAt: string;
  counts: Record<CloudReferenceKind, number>;
  items: CloudReferenceItem[];
};
