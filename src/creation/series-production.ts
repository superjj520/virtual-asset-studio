export type ProductionShot = { id: string; label: string; directive: string };

export const selectProductionShots = (
  plan: ProductionShot[],
  approvedLabels: string[] | undefined,
): ProductionShot[] => {
  if (!approvedLabels?.length) return [];
  const approved = new Set(approvedLabels);
  return plan.filter((shot) => approved.has(shot.label));
};

export const productionShotVariableLines = (shots: ProductionShot[]): string =>
  shots.map((shot) => `${shot.label}：${shot.directive}`).join("\n");
