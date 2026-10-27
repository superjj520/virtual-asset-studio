export type SeriesShotLabel = { label: string };

export const seriesShotPosition = (
  label: string,
  plan: SeriesShotLabel[],
): number | undefined => {
  const index = plan.findIndex((shot) => shot.label === label);
  return index >= 0 ? index : undefined;
};

export const seriesCandidateLabel = (
  label: string,
  plan: SeriesShotLabel[],
): string => {
  const index = seriesShotPosition(label, plan);
  return index === undefined ? label : `第 ${index + 1} 镜 · ${label}`;
};

export const orderSeriesCandidates = <T,>(
  items: T[],
  plan: SeriesShotLabel[],
  labelOf: (item: T) => string,
): T[] => [...items].sort((left, right) => {
  const leftIndex = seriesShotPosition(labelOf(left), plan) ?? Number.MAX_SAFE_INTEGER;
  const rightIndex = seriesShotPosition(labelOf(right), plan) ?? Number.MAX_SAFE_INTEGER;
  return leftIndex - rightIndex;
});
