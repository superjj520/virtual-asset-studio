import characterArtwork from "../assets/character-creator/oriental-moon-v2.webp";
import imageArtwork from "../assets/character-creator/city-couture-v2.webp";
import sceneArtwork from "../assets/character-creator/rain-noir-v2.webp";
import seriesArtwork from "../assets/character-creator/natural-day-v2.webp";

export type CreationLaunchKind = "character" | "image" | "scene" | "series";

type CreationLaunchpadProps = {
  characterCount: number;
  sceneCount: number;
  referenceCount: number;
  onSelect: (kind: CreationLaunchKind) => void;
  onExit: () => void;
  embedded?: boolean;
};

const LAUNCH_OPTIONS: Array<{
  id: CreationLaunchKind;
  label: string;
  description: string;
  result: string;
  artwork: string;
}> = [
  {
    id: "character",
    label: "角色塑造",
    description: "从外观、形体到性格，建立可持续使用的角色。",
    result: "角色档案 · 设定图 · 身份锁定",
    artwork: characterArtwork,
  },
  {
    id: "image",
    label: "单张画面",
    description: "选择角色、造型、场景和镜头，快速完成一张图。",
    result: "人物写真 · 封面 · 宣传图",
    artwork: imageArtwork,
  },
  {
    id: "scene",
    label: "剧情场景",
    description: "围绕人物关系与环境，设计一个可读的剧情瞬间。",
    result: "场景图 · 动作关键帧 · 情绪画面",
    artwork: sceneArtwork,
  },
  {
    id: "series",
    label: "系列镜头",
    description: "锁定同一角色，批量规划连续场景与变化方向。",
    result: "漫剧镜头 · 游戏素材 · 连续内容",
    artwork: seriesArtwork,
  },
];

export function CreationLaunchpad({ characterCount, sceneCount, referenceCount, onSelect, onExit, embedded = false }: CreationLaunchpadProps) {
  return <section className={`creation-launchpad${embedded ? " creation-launchpad-embedded" : ""}`} aria-label="新建创作">
    <header className="creation-launchpad-header">
      {!embedded && <button type="button" className="creator-exit" onClick={onExit} aria-label="退出新建创作">←</button>}
      <div>
        <p className="eyebrow">{embedded ? "创作中心" : "新建创作"}</p>
        <h2>{embedded ? "现在想做什么？" : "这次要做什么？"}</h2>
        <p>先选结果，人物、场景和画面都可以继续点选。</p>
      </div>
      <div className="creation-launchpad-assets" aria-label="可复用资产概况">
        <span><b>{characterCount}</b> 角色</span>
        <span><b>{sceneCount}</b> 场景</span>
        <span><b>{referenceCount}</b> 参考</span>
      </div>
    </header>
    <div className="creation-launch-grid">
      {LAUNCH_OPTIONS.map((option, index) => <button
        type="button"
        key={option.id}
        className={index === 0 ? "creation-launch-card primary" : "creation-launch-card"}
        aria-label={option.label}
        onClick={() => onSelect(option.id)}
      >
        <img src={option.artwork} alt="" />
        <span className="creation-launch-number">0{index + 1}</span>
        <span className="creation-launch-copy">
          <strong>{option.label}</strong>
          <small>{option.description}</small>
          <em>{option.result}</em>
        </span>
        <span className="creation-launch-arrow" aria-hidden="true">→</span>
      </button>)}
    </div>
    <footer className="creation-launchpad-footer">
      <span>已有角色、场景和参考图会在下一步自动出现。</span>
      <div>
        {embedded && <button type="button" className="creation-launchpad-manage" onClick={onExit}>项目与历史</button>}
        <button type="button" onClick={() => onSelect("image")}>直接做一张图</button>
      </div>
    </footer>
  </section>;
}
