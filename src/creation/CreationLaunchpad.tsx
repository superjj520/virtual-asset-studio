import { useEffect, useState } from "react";
import characterArtwork from "../assets/character-creator/oriental-moon-v2.webp";
import imageArtwork from "../assets/character-creator/city-couture-v2.webp";
import sceneArtwork from "../assets/character-creator/rain-noir-v2.webp";
import seriesArtwork from "../assets/character-creator/natural-day-v2.webp";
import type { Asset } from "../shared/types";

export type CreationLaunchKind = "character" | "image" | "scene" | "series";

type CreationLaunchpadProps = {
  characterCount: number;
  sceneCount: number;
  referenceCount: number;
  onSelect: (kind: CreationLaunchKind) => void;
  onExit: () => void;
  onOpenAssets?: () => void;
  onComposeReference?: () => void;
  recipes?: Asset[];
  onUseRecipe?: (asset: Asset) => void;
  embedded?: boolean;
  onDiscardResume?: () => void;
  resume?: { kindLabel: string; updatedAt: string; onResume: () => void };
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

function RecipeThumb({ asset }: { asset: Asset }) {
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    let current = true;
    window.studio.assets.preview(asset.id)
      .then((source) => { if (current) setPreview(source); })
      .catch(() => undefined);
    return () => { current = false; };
  }, [asset.id]);
  return preview ? <img src={preview} alt="" /> : <span className="creation-recipe-placeholder" aria-hidden="true">格</span>;
}

export function CreationLaunchpad({ characterCount, sceneCount, referenceCount, onSelect, onExit, onOpenAssets, onComposeReference, recipes = [], onUseRecipe, embedded = false, resume, onDiscardResume }: CreationLaunchpadProps) {
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
    {!resume && !characterCount && !sceneCount && !referenceCount && <div className="creation-first-run" role="note">
      <strong>第一次使用</strong>
      <span>先选一个结果；不需要先建项目，也不会自动上传素材。</span>
    </div>}
    {resume && <div className="creation-resume-banner" role="status">
      <span className="creation-resume-pill">继续上次创作</span>
      <strong>{resume.kindLabel}</strong>
      <span>上次保存在 {new Date(resume.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
      <button type="button" onClick={resume.onResume}>继续</button>
      {onDiscardResume && <button type="button" className="creation-resume-discard" onClick={onDiscardResume}>重新开始</button>}
    </div>}
    {recipes.length > 0 && <section className="creation-recipe-dock" aria-label="最近配方">
      <div className="creation-recipe-dock-head">
        <strong>最近配方</strong>
        <span>已保存的四格参考卡，一键继续</span>
      </div>
      <div className="creation-recipe-dock-list">
        {recipes.map((recipe) => <button
          type="button"
          key={recipe.id}
          className="creation-recipe-card"
          onClick={() => onUseRecipe?.(recipe)}
          title={`用「${recipe.name}」开始创作`}
        >
          <RecipeThumb asset={recipe} />
          <span>
            <strong>{recipe.name}</strong>
            <small>四格参考卡 · 已确认</small>
          </span>
        </button>)}
        {onComposeReference && <button type="button" className="creation-recipe-new" onClick={onComposeReference}>+ 新建配方</button>}
      </div>
    </section>}
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
      <div className="creation-launchpad-links">
        {onComposeReference && <button type="button" className="creation-launchpad-reference" onClick={onComposeReference}>参考卡组合</button>}
        {onOpenAssets && <button type="button" className="creation-launchpad-manage" onClick={onOpenAssets}>从资产开始</button>}
        {embedded && <button type="button" className="creation-launchpad-manage" onClick={onExit}>项目与历史</button>}
      </div>
    </footer>
  </section>;
}
