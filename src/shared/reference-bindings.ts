import type {
  ReferenceAssetBinding,
  ReferenceAssetRole,
} from "./types";

export const REFERENCE_ROLE_LABELS: Record<ReferenceAssetRole, string> = {
  identity: "身份",
  face: "脸部",
  wardrobe: "服装",
  pose: "姿势",
  material: "材质",
  scene: "场景",
};

const REFERENCE_ROLES = Object.keys(REFERENCE_ROLE_LABELS) as ReferenceAssetRole[];

const validRole = (value: unknown): value is ReferenceAssetRole =>
  typeof value === "string" && REFERENCE_ROLES.includes(value as ReferenceAssetRole);

export const normalizeReferenceBindings = (
  referenceAssetIds: unknown,
  bindings?: unknown,
): { referenceAssetIds: string[]; referenceBindings: ReferenceAssetBinding[] } => {
  const ids = Array.isArray(referenceAssetIds)
    ? [...new Set(referenceAssetIds.filter((value): value is string => typeof value === "string" && Boolean(value.trim())))]
    : [];
  const bindingList = Array.isArray(bindings) ? bindings : [];
  const byAssetId = new Map<string, ReferenceAssetBinding>();

  for (const value of bindingList) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.assetId !== "string" || !ids.includes(candidate.assetId)) continue;
    if (!validRole(candidate.role)) continue;
    byAssetId.set(candidate.assetId, {
      assetId: candidate.assetId,
      role: candidate.role,
      priority: candidate.priority === "primary" ? "primary" : "support",
    });
  }

  const requestedPrimary = ids.find((id) => byAssetId.get(id)?.priority === "primary") ?? ids[0];
  const orderedIds = requestedPrimary
    ? [requestedPrimary, ...ids.filter((id) => id !== requestedPrimary)]
    : [];
  const referenceBindings = orderedIds.map((assetId, index) => ({
    assetId,
    role: byAssetId.get(assetId)?.role ?? "identity",
    priority: index === 0 ? "primary" as const : "support" as const,
  }));

  return { referenceAssetIds: orderedIds, referenceBindings };
};

export const updateReferenceBinding = (
  referenceAssetIds: string[],
  bindings: ReferenceAssetBinding[] | undefined,
  assetId: string,
  patch: Partial<Pick<ReferenceAssetBinding, "role" | "priority">>,
) => {
  const normalized = normalizeReferenceBindings(referenceAssetIds, bindings);
  const next = normalized.referenceBindings.map((binding) =>
    binding.assetId === assetId
      ? { ...binding, ...patch }
      : patch.priority === "primary"
        ? { ...binding, priority: "support" as const }
        : binding,
  );
  return normalizeReferenceBindings(normalized.referenceAssetIds, next);
};

export const addReferenceBinding = (
  referenceAssetIds: string[],
  bindings: ReferenceAssetBinding[] | undefined,
  assetId: string,
  role: ReferenceAssetRole = "identity",
) => normalizeReferenceBindings(
  [...referenceAssetIds, assetId],
  [...(bindings ?? []), { assetId, role, priority: referenceAssetIds.length ? "support" : "primary" }],
);

export const removeReferenceBinding = (
  referenceAssetIds: string[],
  bindings: ReferenceAssetBinding[] | undefined,
  assetId: string,
) => normalizeReferenceBindings(
  referenceAssetIds.filter((id) => id !== assetId),
  (bindings ?? []).filter((binding) => binding.assetId !== assetId),
);
