import type { CandidateVariation } from "./candidate-variations";

type SeriesPlanOverviewProps = {
  plan: CandidateVariation[];
  directionLabel?: string;
};

export function SeriesPlanOverview({ plan, directionLabel }: SeriesPlanOverviewProps) {
  return <section className="series-plan-panel" aria-label="系列整组计划">
    <header className="creation-candidate-heading">
      <div>
        <p className="eyebrow">整组方案</p>
        <h3>{plan.length} 个镜头已按顺序锁定</h3>
      </div>
      <span>{directionLabel ? `基于“${directionLabel}”方向` : "角色与造型保持不变"}</span>
    </header>
    <ol className="series-plan-list">
      {plan.map((shot, index) => <li key={`${shot.id}-${index}`} aria-label={`系列第 ${index + 1} 镜头：${shot.label}`}>
        <span>{String(index + 1).padStart(2, "0")}</span>
        <div>
          <strong>{shot.label}</strong>
          <small title={shot.directive}>{shot.directive}</small>
        </div>
        <em>第 {index + 1} 镜</em>
      </li>)}
    </ol>
    <footer>顺序已锁定；逐镜调整只替换镜头类型，其他镜头与角色造型保持不变。</footer>
  </section>;
}
