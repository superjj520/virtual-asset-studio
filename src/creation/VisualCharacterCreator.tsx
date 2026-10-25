import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Armchair,
  Eye,
  PersonSimple,
  PersonSimpleRun,
  PersonSimpleTaiChi,
  PersonSimpleWalk,
  Smiley,
  SmileyMeh,
  SmileyNervous,
  Sparkle,
} from "@phosphor-icons/react";
import { CREATIVE_ASPECT_RATIOS, type Asset, type CharacterDetail, type CharacterProfile, type CharacterStateTracker, type CharacterVariantKind, type CreativeAspectRatio, type GenerationQualityTier, type SceneProfile } from "../shared/types";
import type { CharacterUseCase } from "../shared/character-slots";
import { CharacterTrackerEditor } from "../character/CharacterTrackerEditor";
import type { CreationLaunchKind } from "./CreationLaunchpad";
import { getCreationFlowContract, type CreationQuickStage } from "./creation-flow";
import orientalMoonArtwork from "../assets/character-creator/oriental-moon-v2.webp";
import cityCoutureArtwork from "../assets/character-creator/city-couture-v2.webp";
import rainNoirArtwork from "../assets/character-creator/rain-noir-v2.webp";
import naturalDayArtwork from "../assets/character-creator/natural-day-v2.webp";
import crystalFantasyArtwork from "../assets/character-creator/crystal-fantasy-v2.webp";
import animeHeroineArtwork from "../assets/character-creator/anime-heroine-v2.webp";
import ancientEastSceneArtwork from "../assets/character-creator/scene-ancient-east-v1.webp";
import modernCitySceneArtwork from "../assets/character-creator/scene-modern-city-v1.webp";
import fantasySceneArtwork from "../assets/character-creator/scene-fantasy-v1.webp";
import studioSceneArtwork from "../assets/character-creator/scene-studio-v1.webp";
import faceReferenceBoard from "../assets/character-creator/face-reference-board-v1.webp";
import hairReferenceBoard from "../assets/character-creator/hair-reference-board-v1.webp";
import bodyReferenceBoard from "../assets/character-creator/body-reference-board-v1.webp";
import wardrobeReferenceBoard from "../assets/character-creator/wardrobe-reference-board-v1.webp";
import ethnicityReferenceBoard from "../assets/character-creator/ethnicity-reference-board-v1.png";
import eyesReferenceBoard from "../assets/character-creator/eyes-reference-board-v1.png";
import {
  CREATION_DIRECTIONS,
  CREATION_PRESETS,
  GUIDED_AGES,
  GUIDED_ARCHETYPES,
  GUIDED_BODIES,
  GUIDED_CONFLICTS,
  GUIDED_CONSTRAINTS,
  GUIDED_DRIVES,
  GUIDED_ETHNICITIES,
  GUIDED_EYES,
  GUIDED_EYE_COLORS,
  GUIDED_EXPRESSIONS,
  GUIDED_FACES,
  GUIDED_HAIR,
  GUIDED_HAIR_COLORS,
  GUIDED_HEIGHTS,
  GUIDED_INTERESTS,
  GUIDED_LOWER_SHAPES,
  GUIDED_MOODS,
  GUIDED_OPENINGS,
  GUIDED_PERFORMANCES,
  GUIDED_POSES,
  GUIDED_PROPORTIONS,
  GUIDED_RELATIONSHIPS,
  GUIDED_ROLES,
  GUIDED_SCENES,
  GUIDED_SHOTS,
  GUIDED_SKIN_TONES,
  GUIDED_STORY_ATMOSPHERES,
  GUIDED_STORY_MOMENTS,
  GUIDED_STORY_PACING,
  GUIDED_STORY_RELATIONSHIPS,
  GUIDED_SUBJECTS,
  GUIDED_UPPER_VOLUMES,
  GUIDED_VOICES,
  GUIDED_VISUAL_STYLES,
  GUIDED_WARDROBES,
  type CreationDirection,
  type CreationPreset,
  type CreationPresetId,
  type GuidedAppearance,
  type GuidedConstraint,
  type GuidedMood,
  type GuidedExpression,
  type GuidedPose,
  type GuidedScene,
  type GuidedShot,
  type GuidedStoryPlan,
  type GuidedSubject,
  type GuidedOption,
  type GuidedVisualStyle,
} from "./creative-plan";
import {
  createDefaultSeriesPlan,
  moveCandidateVariation,
  replaceCandidateVariation,
  SERIES_VARIATION_LIBRARY,
  type CandidateVariation,
} from "./candidate-variations";
import {
  CHARACTER_TRACKER_PRESETS,
  DEFAULT_CHARACTER_TRACKER_IDS,
  buildCharacterStateTrackers,
  type CharacterTrackerPresetId,
} from "./character-tracker-presets";
import {
  loadCharacterCreatorProgress,
  saveCharacterCreatorProgress,
} from "./character-creation-draft";

type CreatorSection = "direction" | "identity" | "face" | "hair" | "body" | "world" | "details" | "output";
type SourceMode = "new" | "saved" | "reference";
type CreatorMode = "quick" | "fine";
type CharacterCorePanel = "identity" | "relationship" | "narrative" | "performance" | "state";

const CHARACTER_QUICK_STEPS: Array<{ id: CreatorSection; label: string; short: string }> = [
  { id: "direction", label: "起点", short: "角色来源与方向" },
  { id: "identity", label: "基础", short: "身份与肤色" },
  { id: "face", label: "外形", short: "面部与发型" },
  { id: "body", label: "形体", short: "比例与体态" },
  { id: "details", label: "内核", short: "性格、关系与场景" },
  { id: "output", label: "完成", short: "确认并保存" },
];

type VisualCharacterCreatorProps = {
  creationKind?: CreationLaunchKind;
  presetId: CreationPresetId;
  onPresetChange: (value: CreationPresetId) => void;
  direction: CreationDirection;
  onDirectionChange: (value: CreationDirection) => void;
  sourceMode: SourceMode;
  onSourceModeChange: (value: SourceMode) => void;
  subject: GuidedSubject;
  onSubjectChange: (value: GuidedSubject) => void;
  appearance: GuidedAppearance;
  onAppearanceChange: <K extends keyof GuidedAppearance>(key: K, value: GuidedAppearance[K]) => void;
  scene: GuidedScene;
  onSceneChange: (value: GuidedScene) => void;
  mood: GuidedMood;
  onMoodChange: (value: GuidedMood) => void;
  storyPlan?: GuidedStoryPlan;
  onStoryPlanChange?: <K extends keyof GuidedStoryPlan>(key: K, value: GuidedStoryPlan[K]) => void;
  shot: GuidedShot;
  onShotChange: (value: GuidedShot) => void;
  visualStyle: GuidedVisualStyle;
  onVisualStyleChange: (value: GuidedVisualStyle) => void;
  constraints: GuidedConstraint[];
  onConstraintToggle: (value: GuidedConstraint) => void;
  trackerIds?: CharacterTrackerPresetId[];
  onTrackerToggle?: (value: CharacterTrackerPresetId) => void;
  customTrackers?: CharacterStateTracker[];
  onCustomTrackersChange?: (value: CharacterStateTracker[]) => void;
  characters: CharacterProfile[];
  characterId: string;
  onCharacterChange: (value: string) => void;
  characterDetail?: CharacterDetail;
  purpose: CharacterUseCase;
  onPurposeChange: (value: CharacterUseCase) => void;
  variantSelections: Partial<Record<CharacterVariantKind, string>>;
  onVariantChange: (kind: CharacterVariantKind, value?: string) => void;
  referenceAssets: Asset[];
  referenceAssetId: string;
  onReferenceAssetChange: (value: string) => void;
  scenes: SceneProfile[];
  sceneProfileId: string;
  onSceneProfileChange: (value: string) => void;
  customSubject: string;
  onCustomSubjectChange: (value: string) => void;
  customScene: string;
  onCustomSceneChange: (value: string) => void;
  previewAssetId?: string;
  preparing?: boolean;
  canGenerate?: boolean;
  candidateCount: 1 | 2 | 4;
  onCandidateCountChange: (value: 1 | 2 | 4) => void;
  seriesPlan?: CandidateVariation[];
  onSeriesPlanChange?: (value: CandidateVariation[]) => void;
  qualityTier: GenerationQualityTier;
  onQualityTierChange: (value: GenerationQualityTier) => void;
  aspectRatio?: CreativeAspectRatio;
  onAspectRatioChange?: (value: CreativeAspectRatio) => void;
  onCreate: () => void;
  onSave: () => void;
  onSaveCharacter?: () => void;
  onExit?: () => void;
  draftRestoredAt?: string;
  onRestart?: () => void;
  onOpenSettings: () => void;
  notice?: string;
  onNoticeDismiss?: () => void;
};

const SECTIONS: Array<{ id: CreatorSection; label: string; short: string }> = [
  { id: "direction", label: "选择起点", short: "样片、角色或参考图" },
  { id: "identity", label: "身份", short: "年龄、特征与肤色" },
  { id: "face", label: "面部", short: "脸型与眼神" },
  { id: "hair", label: "发型", short: "发型与轮廓" },
  { id: "body", label: "形体", short: "全身比例" },
  { id: "world", label: "造型场景", short: "身份、造型与场景" },
  { id: "details", label: "角色细节", short: "声线、关系与表演" },
  { id: "output", label: "确认方案", short: "总览、交付与锁定" },
];

const SECTION_HEADLINES: Record<CreatorSection, string> = {
  direction: "先选一个完整方向",
  identity: "确定人物身份",
  face: "确定面部识别点",
  hair: "确定发型轮廓",
  body: "确定人物比例",
  world: "完成造型与场景",
  details: "补齐角色动态基础",
  output: "检查角色方案",
};

export const CREATION_PRESET_ARTWORKS: Record<CreationPresetId, string> = {
  oriental_moon: orientalMoonArtwork,
  city_couture: cityCoutureArtwork,
  rain_noir: rainNoirArtwork,
  natural_day: naturalDayArtwork,
  crystal_fantasy: crystalFantasyArtwork,
  anime_heroine: animeHeroineArtwork,
};

export const SCENE_ARTWORKS: Partial<Record<GuidedScene, string>> = {
  ancient_east: ancientEastSceneArtwork,
  modern_city: modernCitySceneArtwork,
  fantasy: fantasySceneArtwork,
  studio: studioSceneArtwork,
};

const EYE_COLORS = {
  dark_brown: "#55443f",
  black: "#242326",
  amber: "#b47635",
  gray: "#7f8388",
  blue: "#6f91ac",
  green: "#748b73",
} as const;

const HAIR_COLORS = {
  black: "#17171b",
  dark_brown: "#3a2b27",
  brown: "#68483a",
  auburn: "#754136",
  silver: "#b8b8bd",
  fantasy: "linear-gradient(135deg, #7785b8, #c39db8)",
} as const;

const POSE_CHOICE_HINTS: Record<GuidedPose, string> = {
  relaxed: "松肩 · 自然重心",
  confident: "立直 · 稳定重心",
  turning: "头肩错位 · 回望",
  leaning: "明确接触点 · 有支撑",
  dynamic: "运动方向 · 动态惯性",
};

const EXPRESSION_CHOICE_HINTS: Record<GuidedExpression, string> = {
  neutral: "稳定视线 · 放松唇部",
  soft_smile: "眼神同步 · 轻微笑意",
  cool: "直接凝视 · 情绪克制",
  surprised: "眼唇变化 · 不夸张",
  emotional: "微表情 · 呼吸张力",
};

const POSE_CHOICE_ICONS: Record<GuidedPose, ReactNode> = {
  relaxed: <PersonSimple size={30} weight="duotone" />,
  confident: <PersonSimpleTaiChi size={30} weight="duotone" />,
  turning: <PersonSimpleWalk size={30} weight="duotone" />,
  leaning: <Armchair size={30} weight="duotone" />,
  dynamic: <PersonSimpleRun size={30} weight="duotone" />,
};

const EXPRESSION_CHOICE_ICONS: Record<GuidedExpression, ReactNode> = {
  neutral: <SmileyMeh size={30} weight="duotone" />,
  soft_smile: <Smiley size={30} weight="duotone" />,
  cool: <Eye size={30} weight="duotone" />,
  surprised: <SmileyNervous size={30} weight="duotone" />,
  emotional: <Sparkle size={30} weight="duotone" />,
};

function PresetArtwork({ preset, className = "" }: { preset: CreationPreset; className?: string }) {
  return <span className={`preset-artwork ${className}`} aria-hidden="true">
    <img src={CREATION_PRESET_ARTWORKS[preset.id]} alt="" />
  </span>;
}

function VisualChoiceGrid<T extends string>({ label, options, value, onChange, artworkById, referenceArtwork, referenceLabel }: {
  label: string;
  options: GuidedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  artworkById?: Partial<Record<T, string>>;
  referenceArtwork?: string;
  referenceLabel?: string;
}) {
  const hasArtwork = Boolean(artworkById);
  return (
    <div className="visual-choice-group">
      <div className="visual-choice-heading"><strong>{label}</strong><span>点击应用</span></div>
      {referenceArtwork && <figure className="visual-choice-reference">
        <img src={referenceArtwork} alt={`${label}视觉对比参考`} />
        <figcaption><span>同一角色视觉参考</span><small>{referenceLabel ?? "选择后将按完整方案重新生成"}</small></figcaption>
      </figure>}
      <div className={hasArtwork ? "visual-choice-grid image-choice-grid" : "visual-choice-grid attribute-choice-grid"} role="group" aria-label={label}>
        {options.map((option) => (
          <button type="button" key={option.id} aria-pressed={value === option.id} className={value === option.id ? "visual-choice selected" : "visual-choice"} onClick={() => onChange(option.id)}>
            {artworkById?.[option.id] && <img className="visual-choice-artwork" src={artworkById[option.id]} alt="" aria-hidden="true" />}
            <span className="visual-choice-copy"><strong>{option.label}</strong>{!hasArtwork && <small aria-hidden="true">{value === option.id ? "已选择" : "选择"}</small>}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BoardArtwork({ src, index, count, className = "", layout = "portrait" }: {
  src: string;
  index: number;
  count: number;
  className?: string;
  layout?: "portrait" | "full-body";
}) {
  return <span
    className={`board-choice-window ${layout} ${className}`}
    style={{
      "--board-index": index,
      "--board-count": count,
    } as CSSProperties}
    aria-hidden="true"
  >
    <img src={src} alt="" />
  </span>;
}

function BoardChoiceGrid<T extends string>({ label, options, value, onChange, artwork, hint, layout = "portrait" }: {
  label: string;
  options: GuidedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  artwork: string;
  hint?: string;
  layout?: "portrait" | "full-body";
}) {
  return <div className="visual-choice-group">
    <div className="visual-choice-heading"><strong>{label}</strong><span>{hint ?? "看图选择"}</span></div>
    <div className="board-choice-grid" role="group" aria-label={label}>
      {options.map((option, index) => <button
        type="button"
        key={option.id}
        aria-pressed={value === option.id}
        className={value === option.id ? "board-choice selected" : "board-choice"}
        onClick={() => onChange(option.id)}
      >
        <BoardArtwork src={artwork} index={index} count={options.length} layout={layout} />
        <span><strong>{option.label}</strong>{value === option.id && <b>✓</b>}</span>
      </button>)}
    </div>
  </div>;
}

function SemanticChoiceGrid<T extends string>({ label, hint, options, value, onChange, icons, descriptions }: {
  label: string;
  hint: string;
  options: GuidedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  icons: Record<T, ReactNode>;
  descriptions: Record<T, string>;
}) {
  return <div className="visual-choice-group semantic-choice-group">
    <div className="visual-choice-heading"><strong>{label}</strong><span>{hint}</span></div>
    <div className="semantic-choice-grid" role="group" aria-label={label}>
      {options.map((option) => <button
        type="button"
        key={option.id}
        aria-pressed={value === option.id}
        className={value === option.id ? "semantic-choice selected" : "semantic-choice"}
        onClick={() => onChange(option.id)}
      >
        <i aria-hidden="true">{icons[option.id]}</i>
        <span><strong>{option.label}</strong><small>{descriptions[option.id]}</small></span>
        <b aria-hidden="true">{value === option.id ? "✓" : ""}</b>
      </button>)}
    </div>
  </div>;
}

function ColorChoiceGrid<T extends string>({ label, options, value, onChange, colors }: {
  label: string;
  options: GuidedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  colors: Record<T, string>;
}) {
  return <div className="visual-choice-group">
    <div className="visual-choice-heading"><strong>{label}</strong><span>点击色样选择</span></div>
    <div className="color-choice-grid" role="group" aria-label={label}>
      {options.map((option) => <button
        type="button"
        key={option.id}
        aria-pressed={value === option.id}
        className={value === option.id ? "selected" : ""}
        onClick={() => onChange(option.id)}
      ><i style={{ background: colors[option.id] }} /><span>{option.label}</span>{value === option.id && <b aria-hidden="true">✓</b>}</button>)}
    </div>
  </div>;
}

function ReviewTile({ label, value, artwork, index, count }: {
  label: string;
  value: string;
  artwork?: string;
  index?: number;
  count?: number;
}) {
  return <div className={artwork ? "creator-review-tile" : "creator-review-tile no-art"}>
    {artwork && typeof index === "number" && count && <BoardArtwork src={artwork} index={index} count={count} className="review" />}
    <span><small>{label}</small><strong>{value}</strong></span>
  </div>;
}

function GeneratedCharacterPreview({ preset, note }: { preset: CreationPreset; note: string }) {
  return (
    <div className="creator-direction-preview" aria-label="方向样片预览">
      <PresetArtwork preset={preset} className="creator-direction-backdrop" />
      <div className="creator-direction-frame"><PresetArtwork preset={preset} /></div>
      <span className="character-photo-note">{note}</span>
    </div>
  );
}

function AssetPreview({ assetId, fallback, alt = "资产预览", className = "creator-source-preview" }: {
  assetId?: string;
  fallback: ReactNode;
  alt?: string;
  className?: string;
}) {
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    let mounted = true;
    setPreview(undefined);
    const previewAsset = window.studio?.assets?.preview;
    if (!assetId || !previewAsset) return () => { mounted = false; };
    Promise.resolve(previewAsset(assetId))
      .then((value) => { if (mounted) setPreview(value); })
      .catch(() => { if (mounted) setPreview(undefined); });
    return () => { mounted = false; };
  }, [assetId]);
  return preview ? <img className={className} src={preview} alt={alt} /> : fallback;
}

function CharacterSourceCard({ character, selected, onSelect, compact = false }: {
  character: CharacterProfile;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  return <button
    type="button"
    role="option"
    aria-selected={selected}
    aria-label={`使用角色 ${character.name}`}
    className={`${compact ? "creator-asset-choice compact" : "creator-asset-choice"}${selected ? " selected" : ""}`}
    onClick={onSelect}
  >
    {compact ? <span className="creator-asset-compact-mark" aria-hidden="true">{character.name.slice(0, 1)}</span> : <span className="creator-asset-thumb">
      <AssetPreview assetId={character.masterAssetId} alt={`${character.name}主参考`} className="creator-asset-image" fallback={<span />} />
      <span className="creator-asset-state">主参考</span>
    </span>}
    <span className="creator-asset-copy">
      <strong>{character.name}</strong>
      <small>{compact ? "待补主参考" : character.lifecycle === "confirmed" ? "已确认角色" : "草稿角色"}</small>
    </span>
    {compact && <span className="creator-asset-compact-action">仍可选用</span>}
  </button>;
}

function referenceAssetLabel(asset: Asset, index: number) {
  const metadataLabel = [asset.metadata.displayName, asset.metadata.title, asset.metadata.caption]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (metadataLabel) return metadataLabel.trim();

  const filename = asset.name.replace(/\.[^.]+$/, "").trim();
  if (/\p{Script=Han}/u.test(filename) && filename.length <= 24) return filename;
  return `参考图 ${String(index + 1).padStart(2, "0")}`;
}

function ReferenceSourceCard({ asset, index, selected, onSelect }: {
  asset: Asset;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const displayName = referenceAssetLabel(asset, index);
  const accessibleName = displayName.startsWith("参考图 ") ? `使用${displayName}` : `使用参考图 ${displayName}`;
  return <button
    type="button"
    role="option"
    aria-selected={selected}
    aria-label={accessibleName}
    title={asset.name}
    className={selected ? "creator-asset-choice selected" : "creator-asset-choice"}
    onClick={onSelect}
  >
    <span className="creator-asset-thumb">
      <AssetPreview
        assetId={asset.id}
        alt={asset.name}
        className="creator-asset-image"
        fallback={<span className="creator-asset-fallback image" aria-hidden="true">图</span>}
      />
      <span className="creator-asset-state">可用于身份锁定</span>
    </span>
    <span className="creator-asset-copy"><strong>{displayName}</strong><small>已审片 · 权利已确认</small></span>
  </button>;
}

function SceneSourceCard({ scene, selected, onSelect, compact = false }: {
  scene: SceneProfile;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  return <button
    type="button"
    role="option"
    aria-selected={selected}
    aria-label={`使用场景 ${scene.name}`}
    className={`${compact ? "creator-asset-choice compact" : "creator-asset-choice"}${selected ? " selected" : ""}`}
    onClick={onSelect}
  >
    {compact ? <span className="creator-asset-compact-mark scene" aria-hidden="true">景</span> : <span className="creator-asset-thumb scene">
      <AssetPreview
        assetId={scene.masterAssetId}
        alt={`${scene.name}场景主参考`}
        className="creator-asset-image scene"
        fallback={<span />}
      />
      <span className="creator-asset-state">场景主参考</span>
    </span>}
    <span className="creator-asset-copy">
      <strong>{scene.name}</strong>
      <small>{compact ? "待补场景主参考" : scene.lifecycle === "confirmed" ? "已确认场景" : "草稿场景"}</small>
    </span>
    {compact && <span className="creator-asset-compact-action">仍可选用</span>}
  </button>;
}

function SeriesShotArtwork({
  variationId,
  label,
  presetArtwork,
  sceneArtwork,
}: {
  variationId: string;
  label: string;
  presetArtwork: string;
  sceneArtwork?: string;
}) {
  const artwork = variationId === "environment_interaction" || variationId === "wide_scene"
    ? sceneArtwork ?? presetArtwork
    : presetArtwork;

  return <img
    className={`series-shot-artwork series-shot-artwork-${variationId}`}
    src={artwork}
    alt={`${label}镜头参考`}
  />;
}

export function VisualCharacterCreator(props: VisualCharacterCreatorProps) {
  const creationKind = props.creationKind ?? "character";
  const flow = getCreationFlowContract(creationKind);
  const initialProgress = useRef(creationKind === "character" ? loadCharacterCreatorProgress() : undefined);
  const previousCreationKind = useRef(creationKind);
  const [mode, setMode] = useState<CreatorMode>(initialProgress.current?.mode ?? "quick");
  const [section, setSection] = useState<CreatorSection>(initialProgress.current?.section ?? "direction");
  const [quickStage, setQuickStage] = useState<CreationQuickStage>(initialProgress.current?.quickStage ?? "direction");
  const [characterCorePanel, setCharacterCorePanel] = useState<CharacterCorePanel>(initialProgress.current?.corePanel ?? "identity");
  const [showSavedAssets, setShowSavedAssets] = useState(false);
  const [activeSeriesShotIndex, setActiveSeriesShotIndex] = useState(0);
  const availableCharacters = props.characters.filter((item) => item.lifecycle !== "archived");
  const visualCharacters = availableCharacters.filter((item) => item.masterAssetId);
  const incompleteCharacters = availableCharacters.filter((item) => !item.masterAssetId);
  const availableScenes = props.scenes.filter((item) => item.lifecycle !== "archived");
  const visualScenes = availableScenes.filter((item) => item.masterAssetId);
  const incompleteScenes = availableScenes.filter((item) => !item.masterAssetId);
  const selectedCharacter = props.characters.find((item) => item.id === props.characterId);
  const selectedReference = props.referenceAssets.find((item) => item.id === props.referenceAssetId);
  const selectedScene = props.scenes.find((item) => item.id === props.sceneProfileId);
  const selectedPreset = CREATION_PRESETS.find((item) => item.id === props.presetId) ?? CREATION_PRESETS[0];
  const sectionIndex = SECTIONS.findIndex((item) => item.id === section);
  const quickStages = flow.stages;
  const quickStageIndex = quickStages.findIndex((item) => item.id === quickStage);
  const currentQuickStage = quickStages[quickStageIndex];
  const seriesPlan = props.seriesPlan?.length ? props.seriesPlan : createDefaultSeriesPlan();
  const activeSeriesShot = seriesPlan[activeSeriesShotIndex] ?? seriesPlan[0];
  const activeSceneArtwork = props.sceneProfileId ? undefined : SCENE_ARTWORKS[props.scene];
  const trackerIds = props.trackerIds ?? DEFAULT_CHARACTER_TRACKER_IDS;
  const summary = useMemo(() => [
    GUIDED_AGES.find((item) => item.id === props.appearance.age)?.label,
    GUIDED_SUBJECTS.find((item) => item.id === props.subject)?.label,
    GUIDED_FACES.find((item) => item.id === props.appearance.face)?.label,
    GUIDED_HAIR.find((item) => item.id === props.appearance.hair)?.label,
    GUIDED_WARDROBES.find((item) => item.id === props.appearance.wardrobe)?.label,
  ].filter(Boolean).join(" · "), [props.appearance, props.subject]);
  const atmosphereSummary = useMemo(() => [
    GUIDED_ROLES.find((item) => item.id === props.appearance.role)?.label,
    GUIDED_MOODS.find((item) => item.id === props.mood)?.label,
    GUIDED_VISUAL_STYLES.find((item) => item.id === props.visualStyle)?.label,
  ].filter(Boolean).join(" · "), [props.appearance.role, props.mood, props.visualStyle]);
  const trackerPreview = useMemo(() => buildCharacterStateTrackers(trackerIds, {
    mood: props.mood,
    scene: props.scene,
    wardrobe: props.appearance.wardrobe,
  }), [props.appearance.wardrobe, props.mood, props.scene, trackerIds]);
  const allTrackerPreview = useMemo(
    () => [...trackerPreview, ...(props.customTrackers ?? [])],
    [props.customTrackers, trackerPreview],
  );
  const optionIndex = <T extends string>(options: GuidedOption<T>[], value: T) => Math.max(0, options.findIndex((item) => item.id === value));

  useEffect(() => {
    if (previousCreationKind.current === creationKind) return;
    previousCreationKind.current = creationKind;
    const progress = creationKind === "character" ? loadCharacterCreatorProgress() : undefined;
    setMode(progress?.mode ?? "quick");
    setQuickStage(progress?.quickStage ?? "direction");
    setSection(progress?.section ?? "direction");
    setCharacterCorePanel(progress?.corePanel ?? "identity");
  }, [creationKind]);

  useEffect(() => {
    if (creationKind !== "character") return;
    saveCharacterCreatorProgress({ mode, section, quickStage, corePanel: characterCorePanel });
  }, [characterCorePanel, creationKind, mode, quickStage, section]);

  const applyPreset = (preset: CreationPreset) => {
    props.onPresetChange(preset.id);
    props.onDirectionChange(preset.direction);
    props.onSubjectChange(preset.subject);
    (Object.entries(preset.appearance) as Array<[keyof GuidedAppearance, GuidedAppearance[keyof GuidedAppearance]]>)
      .forEach(([key, value]) => props.onAppearanceChange(key, value));
    props.onSceneChange(preset.scene);
    props.onMoodChange(preset.mood);
    props.onShotChange(preset.shot);
    props.onVisualStyleChange(preset.visualStyle);
    GUIDED_CONSTRAINTS.forEach((constraint) => {
      const shouldSelect = preset.constraints.includes(constraint.id);
      if (props.constraints.includes(constraint.id) !== shouldSelect) props.onConstraintToggle(constraint.id);
    });
  };

  const renderDirection = () => <>
    <div className="creator-source-block">
      <div className="visual-choice-heading"><strong>{flow.sourceHeading}</strong><span>{flow.sourceHint}</span></div>
      <div className="creator-source-switch" role="group" aria-label={flow.sourceGroupLabel}>
        {([['new', '原创角色'], ['saved', '角色资产'], ['reference', '参考图']] as const).map(([id, label]) => (
          <button type="button" key={id} aria-pressed={props.sourceMode === id} className={props.sourceMode === id ? "selected" : ""} onClick={() => props.onSourceModeChange(id)}>{label}</button>
        ))}
      </div>
    </div>
    {props.sourceMode === "new" && <>
      <div className="visual-choice-heading"><strong>选择完整方向</strong><span>一次确定一组视觉决策</span></div>
      <div className="creation-preset-grid" role="group" aria-label="创作方向样片">
        {CREATION_PRESETS.map((preset) => <button type="button" key={preset.id} aria-pressed={props.presetId === preset.id} className={props.presetId === preset.id ? "creation-preset selected" : "creation-preset"} onClick={() => applyPreset(preset)}>
          <PresetArtwork preset={preset} />
          <span><strong>{preset.label}</strong><small>{preset.description}</small></span>
        </button>)}
      </div>
    </>}
    {props.sourceMode === "saved" && <>
      <div className="source-library-summary"><strong>{availableCharacters.length}</strong><span>个角色资产 · {visualCharacters.length} 个可直接使用 · {incompleteCharacters.length} 个待完善</span></div>
      {visualCharacters.length > 0 && <>
        <div className="creator-library-section-heading"><strong>可直接使用</strong><span>已建立主参考</span></div>
        <div className="creator-asset-choice-grid" role="listbox" aria-label="可直接使用的角色资产">
        {visualCharacters.map((item) => <CharacterSourceCard
          key={item.id}
          character={item}
          selected={props.characterId === item.id}
          onSelect={() => props.onCharacterChange(item.id)}
        />)}
      </div></>}
      {incompleteCharacters.length > 0 && <>
        <div className="creator-library-section-heading incomplete"><strong>待补主参考</strong><span>角色设定可用，补图后进入视觉资产区</span></div>
        <div className="creator-asset-compact-list" role="listbox" aria-label="待补主参考角色">
          {incompleteCharacters.map((item) => <CharacterSourceCard
            key={item.id}
            character={item}
            compact
            selected={props.characterId === item.id}
            onSelect={() => props.onCharacterChange(item.id)}
          />)}
        </div>
      </>}
      {availableCharacters.length === 0 && <div className="creator-source-empty"><strong>还没有可复用角色</strong><span>先用“原创角色”完成一轮，确认后即可沉淀为角色资产。</span></div>}
      {props.characterId && <button type="button" className="creator-more-button" aria-expanded={showSavedAssets} onClick={() => setShowSavedAssets((value) => !value)}>{showSavedAssets ? "收起角色状态" : "选择造型、表情和动作"}</button>}
      {showSavedAssets && props.characterDetail?.id === props.characterId && <div className="creator-saved-assets">
        <label>用途<select aria-label="角色用途" value={props.purpose} onChange={(event) => props.onPurposeChange(event.target.value as CharacterUseCase)}><option value="portrait">肖像</option><option value="full_body">全身设定</option><option value="series">连续镜头</option></select></label>
        {(["look", "expression", "pose", "scene"] as CharacterVariantKind[]).map((kind) => <label key={kind}>{kind === "look" ? "造型" : kind === "expression" ? "表情" : kind === "pose" ? "动作" : "情境"}<select aria-label={`角色${kind}`} value={props.variantSelections[kind] ?? ""} onChange={(event) => props.onVariantChange(kind, event.target.value || undefined)}><option value="">使用角色默认</option>{props.characterDetail?.variants.filter((item) => item.kind === kind).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}
      </div>}
    </>}
    {props.sourceMode === "reference" && <>
      <div className="source-library-summary"><strong>{props.referenceAssets.length}</strong><span>张已确认参考图 · 看图选择</span></div>
      {props.referenceAssets.length > 0 ? <div className="creator-asset-choice-grid" role="listbox" aria-label="参考图资产">
        {props.referenceAssets.map((item, index) => <ReferenceSourceCard
          key={item.id}
          asset={item}
          index={index}
          selected={props.referenceAssetId === item.id}
          onSelect={() => props.onReferenceAssetChange(item.id)}
        />)}
      </div> : <div className="creator-source-empty"><strong>暂无可用参考图</strong><span>请先到资产库完成审片与权利确认。</span></div>}
    </>}
  </>;

  const renderIdentity = () => <>
    <div className="visual-choice-heading"><strong>角色类型</strong><span>全部为成年角色</span></div>
    <div className="compact-visual-grid" role="group" aria-label="人物主体">{GUIDED_SUBJECTS.map((option) => <button type="button" key={option.id} aria-pressed={props.subject === option.id} className={props.subject === option.id ? "selected" : ""} onClick={() => props.onSubjectChange(option.id)}>{option.label}</button>)}</div>
    {props.subject === "custom" && <input aria-label="自定义主体" value={props.customSubject} onChange={(event) => props.onCustomSubjectChange(event.target.value)} placeholder="只补充系统没有的角色类型" />}
    <div className="visual-choice-heading"><strong>年龄阶段</strong><span>只选择，不填写</span></div>
    <div className="compact-visual-grid" role="group" aria-label="年龄阶段">{GUIDED_AGES.map((option) => <button type="button" key={option.id} aria-pressed={props.appearance.age === option.id} className={props.appearance.age === option.id ? "selected" : ""} onClick={() => props.onAppearanceChange("age", option.id)}>{option.label}</button>)}</div>
    <BoardChoiceGrid label="人物特征" options={GUIDED_ETHNICITIES} value={props.appearance.ethnicity} onChange={(value) => props.onAppearanceChange("ethnicity", value)} artwork={ethnicityReferenceBoard} />
    <div className="visual-choice-heading"><strong>肤色</strong><span>选择自然肤色范围</span></div>
    <div className="skin-choice-grid" role="group" aria-label="肤色">{GUIDED_SKIN_TONES.map((option, index) => <button type="button" key={option.id} aria-pressed={props.appearance.skinTone === option.id} className={props.appearance.skinTone === option.id ? "selected" : ""} onClick={() => props.onAppearanceChange("skinTone", option.id)}><i style={{ "--skin-index": index } as CSSProperties} /><span>{option.label}</span></button>)}</div>
  </>;

  const renderFace = () => <>
    <BoardChoiceGrid label="脸部轮廓" options={GUIDED_FACES} value={props.appearance.face} onChange={(value) => props.onAppearanceChange("face", value)} artwork={faceReferenceBoard} hint="同一身份对比" />
    <BoardChoiceGrid label="眼神方向" options={GUIDED_EYES} value={props.appearance.eyes} onChange={(value) => props.onAppearanceChange("eyes", value)} artwork={eyesReferenceBoard} hint="同一身份对比" />
    <ColorChoiceGrid label="瞳孔颜色" options={GUIDED_EYE_COLORS} value={props.appearance.eyeColor} onChange={(value) => props.onAppearanceChange("eyeColor", value)} colors={EYE_COLORS} />
  </>;

  const renderHair = () => <>
    <BoardChoiceGrid label="发型轮廓" options={GUIDED_HAIR} value={props.appearance.hair} onChange={(value) => props.onAppearanceChange("hair", value)} artwork={hairReferenceBoard} hint="同一身份对比" />
    <ColorChoiceGrid label="发色" options={GUIDED_HAIR_COLORS} value={props.appearance.hairColor} onChange={(value) => props.onAppearanceChange("hairColor", value)} colors={HAIR_COLORS} />
  </>;

  const renderCharacterAppearance = () => <>
    {renderFace()}
    <div className="character-step-divider" aria-hidden="true" />
    {renderHair()}
  </>;

  const renderBody = () => <>
    <BoardChoiceGrid label="身体比例" options={GUIDED_BODIES} value={props.appearance.body} onChange={(value) => props.onAppearanceChange("body", value)} artwork={bodyReferenceBoard} hint="真实成年比例" layout="full-body" />
    <VisualChoiceGrid label="身高" options={GUIDED_HEIGHTS} value={props.appearance.height} onChange={(value) => props.onAppearanceChange("height", value)} />
    <VisualChoiceGrid label="体态比例" options={GUIDED_PROPORTIONS} value={props.appearance.proportion} onChange={(value) => props.onAppearanceChange("proportion", value)} />
    <VisualChoiceGrid label="上身量感" options={GUIDED_UPPER_VOLUMES} value={props.appearance.upperVolume} onChange={(value) => props.onAppearanceChange("upperVolume", value)} />
    <VisualChoiceGrid label="下身轮廓" options={GUIDED_LOWER_SHAPES} value={props.appearance.lowerShape} onChange={(value) => props.onAppearanceChange("lowerShape", value)} />
  </>;

  const renderWorld = () => <>
    <div className="visual-choice-heading"><strong>角色身份</strong><span>决定后续故事与资产延展</span></div>
    <div className="mood-choice-grid role-choice-grid" role="group" aria-label="角色身份">{GUIDED_ROLES.map((option) => <button type="button" key={option.id} aria-pressed={props.appearance.role === option.id} className={props.appearance.role === option.id ? "selected" : ""} onClick={() => props.onAppearanceChange("role", option.id)}><strong>{option.label}</strong><small>{option.prompt}</small></button>)}</div>
    <BoardChoiceGrid label="服装方向" options={GUIDED_WARDROBES} value={props.appearance.wardrobe} onChange={(value) => props.onAppearanceChange("wardrobe", value)} artwork={wardrobeReferenceBoard} layout="full-body" />
    <VisualChoiceGrid label="场景世界" options={GUIDED_SCENES.filter((item) => item.id !== "custom")} value={props.scene} onChange={props.onSceneChange} artworkById={SCENE_ARTWORKS} />
    <div className="compact-visual-grid creator-custom-scene"><button type="button" aria-pressed={props.scene === "custom"} className={props.scene === "custom" ? "selected" : ""} onClick={() => props.onSceneChange("custom")}>自定义场景</button></div>
    {props.scene === "custom" && <input aria-label="自定义场景" value={props.customScene} onChange={(event) => props.onCustomSceneChange(event.target.value)} placeholder="描述系统没有的场景" />}
    {availableScenes.length > 0 && <div className="creator-scene-library">
      <div className="visual-choice-heading"><strong>或使用已有场景</strong><button type="button" className={props.sceneProfileId ? "creator-inline-reset" : "creator-inline-reset selected"} onClick={() => props.onSceneProfileChange("")}>使用上方方向</button></div>
      {visualScenes.length > 0 && <div className="creator-asset-choice-grid" role="listbox" aria-label="可直接使用的场景资产">
        {visualScenes.map((item) => <SceneSourceCard
          key={item.id}
          scene={item}
          selected={props.sceneProfileId === item.id}
          onSelect={() => props.onSceneProfileChange(item.id)}
        />)}
      </div>}
      {incompleteScenes.length > 0 && <>
        <div className="creator-library-section-heading incomplete"><strong>待补场景主参考</strong><span>结构设定可用，补图后进入视觉资产区</span></div>
        <div className="creator-asset-compact-list" role="listbox" aria-label="待补主参考场景">
          {incompleteScenes.map((item) => <SceneSourceCard
            key={item.id}
            scene={item}
            compact
            selected={props.sceneProfileId === item.id}
            onSelect={() => props.onSceneProfileChange(item.id)}
          />)}
        </div>
      </>}
    </div>}
    <div className="visual-choice-heading"><strong>性格原型</strong><span>影响表情、动作、光线和色彩</span></div>
    <div className="mood-choice-grid" role="group" aria-label="性格原型">{GUIDED_MOODS.map((option) => <button type="button" key={option.id} aria-pressed={props.mood === option.id} className={props.mood === option.id ? "selected" : ""} onClick={() => props.onMoodChange(option.id)}><strong>{option.label}</strong><small>{option.prompt}</small></button>)}</div>
  </>;

  const renderDetails = () => <>
    <BoardChoiceGrid label="姿态动作" options={GUIDED_POSES} value={props.appearance.pose} onChange={(value) => props.onAppearanceChange("pose", value)} artwork={bodyReferenceBoard} hint="重心与动作" layout="full-body" />
    <BoardChoiceGrid label="表情状态" options={GUIDED_EXPRESSIONS} value={props.appearance.expression} onChange={(value) => props.onAppearanceChange("expression", value)} artwork={faceReferenceBoard} hint="同一身份表情" />
    <div className="visual-choice-heading"><strong>声线方向</strong><span>用于对白与动态内容</span></div>
    <div className="mood-choice-grid" role="group" aria-label="声线方向">{GUIDED_VOICES.map((option) => <button type="button" key={option.id} aria-pressed={props.appearance.voice === option.id} className={props.appearance.voice === option.id ? "selected" : ""} onClick={() => props.onAppearanceChange("voice", option.id)}><strong>{option.label}</strong><small>{option.prompt}</small></button>)}</div>
    <div className="visual-choice-heading"><strong>关系定位</strong><span>决定多人场景中的互动方式</span></div>
    <div className="compact-visual-grid" role="group" aria-label="关系定位">{GUIDED_RELATIONSHIPS.map((option) => <button type="button" key={option.id} aria-pressed={props.appearance.relationship === option.id} className={props.appearance.relationship === option.id ? "selected" : ""} onClick={() => props.onAppearanceChange("relationship", option.id)}>{option.label}</button>)}</div>
    <div className="visual-choice-heading"><strong>生活兴趣</strong><span>为场景和道具提供依据</span></div>
    <div className="compact-visual-grid" role="group" aria-label="生活兴趣">{GUIDED_INTERESTS.map((option) => <button type="button" key={option.id} aria-pressed={props.appearance.interest === option.id} className={props.appearance.interest === option.id ? "selected" : ""} onClick={() => props.onAppearanceChange("interest", option.id)}>{option.label}</button>)}</div>
    <div className="visual-choice-heading"><strong>表演方向</strong><span>角色未来可继续生成的内容类型</span></div>
    <div className="creator-direction-grid" role="group" aria-label="表演方向">{GUIDED_PERFORMANCES.map((option) => <button type="button" key={option.id} aria-pressed={props.appearance.performance === option.id} className={props.appearance.performance === option.id ? "selected" : ""} onClick={() => props.onAppearanceChange("performance", option.id)}><strong>{option.label}</strong><small>{option.prompt}</small></button>)}</div>
  </>;

  const renderOutput = () => <>
    <section className="creator-review-board" aria-label="角色方案总览">
      <header><div><span>角色方案总览</span><strong>所有选择都会保存为可复用角色方案</strong></div><b>20 项已设定</b></header>
      <div className="creator-review-grid">
        <ReviewTile label="年龄阶段" value={GUIDED_AGES.find((item) => item.id === props.appearance.age)?.label ?? ""} />
        <ReviewTile label="角色身份" value={GUIDED_ROLES.find((item) => item.id === props.appearance.role)?.label ?? ""} />
        <ReviewTile label="人物特征" value={GUIDED_ETHNICITIES.find((item) => item.id === props.appearance.ethnicity)?.label ?? ""} artwork={ethnicityReferenceBoard} index={optionIndex(GUIDED_ETHNICITIES, props.appearance.ethnicity)} count={GUIDED_ETHNICITIES.length} />
        <ReviewTile label="面部" value={`${GUIDED_FACES.find((item) => item.id === props.appearance.face)?.label} · ${GUIDED_EYES.find((item) => item.id === props.appearance.eyes)?.label} · ${GUIDED_EYE_COLORS.find((item) => item.id === props.appearance.eyeColor)?.label}`} artwork={faceReferenceBoard} index={optionIndex(GUIDED_FACES, props.appearance.face)} count={GUIDED_FACES.length} />
        <ReviewTile label="发型" value={`${GUIDED_HAIR.find((item) => item.id === props.appearance.hair)?.label} · ${GUIDED_HAIR_COLORS.find((item) => item.id === props.appearance.hairColor)?.label}`} artwork={hairReferenceBoard} index={optionIndex(GUIDED_HAIR, props.appearance.hair)} count={GUIDED_HAIR.length} />
        <ReviewTile label="形体" value={`${GUIDED_BODIES.find((item) => item.id === props.appearance.body)?.label} · ${GUIDED_HEIGHTS.find((item) => item.id === props.appearance.height)?.label} · ${GUIDED_PROPORTIONS.find((item) => item.id === props.appearance.proportion)?.label}`} artwork={bodyReferenceBoard} index={optionIndex(GUIDED_BODIES, props.appearance.body)} count={GUIDED_BODIES.length} />
        <ReviewTile label="造型" value={GUIDED_WARDROBES.find((item) => item.id === props.appearance.wardrobe)?.label ?? ""} artwork={wardrobeReferenceBoard} index={optionIndex(GUIDED_WARDROBES, props.appearance.wardrobe)} count={GUIDED_WARDROBES.length} />
        <ReviewTile label="场景与性格" value={`${sceneLabel} · ${GUIDED_MOODS.find((item) => item.id === props.mood)?.label}`} />
        <ReviewTile label="声线与关系" value={`${GUIDED_VOICES.find((item) => item.id === props.appearance.voice)?.label} · ${GUIDED_RELATIONSHIPS.find((item) => item.id === props.appearance.relationship)?.label}`} />
        <ReviewTile label="姿态与表情" value={`${GUIDED_POSES.find((item) => item.id === props.appearance.pose)?.label} · ${GUIDED_EXPRESSIONS.find((item) => item.id === props.appearance.expression)?.label}`} artwork={bodyReferenceBoard} index={Math.max(0, GUIDED_POSES.findIndex((item) => item.id === props.appearance.pose))} count={GUIDED_POSES.length} />
        <ReviewTile label="兴趣与表演" value={`${GUIDED_INTERESTS.find((item) => item.id === props.appearance.interest)?.label} · ${GUIDED_PERFORMANCES.find((item) => item.id === props.appearance.performance)?.label}`} />
      </div>
    </section>
    <div className="visual-choice-heading"><strong>交付结果</strong><span>决定构图和画幅</span></div>
    <div className="creator-direction-grid" role="group" aria-label="画面方向">{CREATION_DIRECTIONS.map((item) => <button type="button" key={item.id} aria-pressed={props.direction === item.id} className={props.direction === item.id ? "selected" : ""} onClick={() => props.onDirectionChange(item.id)}><strong>{item.label}</strong><small>{item.description}</small></button>)}</div>
    <div className="visual-choice-heading"><strong>镜头范围</strong><span>控制人物在画面中的比例</span></div>
    <div className="compact-visual-grid" role="group" aria-label="镜头范围">{GUIDED_SHOTS.map((option) => <button type="button" key={option.id} aria-pressed={props.shot === option.id} className={props.shot === option.id ? "selected" : ""} onClick={() => props.onShotChange(option.id)}>{option.label}</button>)}</div>
    <div className="visual-choice-heading"><strong>视觉质感</strong><span>控制最终媒介语言</span></div>
    <div className="compact-visual-grid" role="group" aria-label="视觉质感">{GUIDED_VISUAL_STYLES.map((option) => <button type="button" key={option.id} aria-pressed={props.visualStyle === option.id} className={props.visualStyle === option.id ? "selected" : ""} onClick={() => props.onVisualStyleChange(option.id)}>{option.label}</button>)}</div>
    <div className="visual-choice-heading"><strong>锁定项目</strong><span>可多选</span></div>
    <div className="constraint-choice-grid" role="group" aria-label="生成约束">{GUIDED_CONSTRAINTS.map((option) => <button type="button" key={option.id} aria-pressed={props.constraints.includes(option.id)} className={props.constraints.includes(option.id) ? "selected" : ""} onClick={() => props.onConstraintToggle(option.id)}><span aria-hidden="true">{props.constraints.includes(option.id) ? "✓" : "+"}</span>{option.label}</button>)}</div>
    {creationKind !== "character" && <div className="creator-output-controls">
      <div>
        <div className="visual-choice-heading"><strong>生成质量</strong><span>越高越重视细节</span></div>
        <div className="compact-visual-grid" role="group" aria-label="生成质量">
          {([['draft', '快速'], ['standard', '标准'], ['premium', '高质']] as const).map(([id, label]) => (
            <button type="button" key={id} aria-pressed={props.qualityTier === id} className={props.qualityTier === id ? "selected" : ""} onClick={() => props.onQualityTierChange(id)}>{label}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="visual-choice-heading"><strong>候选数量</strong><span>生成后并排挑选</span></div>
        <div className="compact-visual-grid" role="group" aria-label="候选数量">
          {([1, 2, 4] as const).map((count) => (
            <button type="button" key={count} aria-pressed={props.candidateCount === count} className={props.candidateCount === count ? "selected" : ""} onClick={() => props.onCandidateCountChange(count)}>{count} 张</button>
          ))}
        </div>
      </div>
    </div>}
    <div className="creator-ready-card ready">
      <span>{creationKind === "character" ? "角色资产已就绪" : "方案已就绪"}</span>
      <strong>{creationKind === "character" ? "人物设定将沉淀为可复用角色" : "进入创作台后继续挑选与调整"}</strong>
      <small>{creationKind === "character" ? "保存后直接进入角色中枢，继续扩展造型、表情、动作与剧情。" : "当前人物、造型、场景与画面选择都会保留。"}</small>
    </div>
  </>;

  const renderShotAndStyle = () => <>
    <div className="visual-choice-heading"><strong>镜头范围</strong><span>人物在画面中的比例</span></div>
    <div className="compact-visual-grid" role="group" aria-label="快速镜头范围">
      {GUIDED_SHOTS.filter((item) => creationKind !== "character" || item.id === "character_sheet" || item.id === "full_body").map((option) => <button type="button" key={option.id} aria-pressed={props.shot === option.id} className={props.shot === option.id ? "selected" : ""} onClick={() => props.onShotChange(option.id)}>{option.label}</button>)}
    </div>
    <div className="visual-choice-heading"><strong>视觉质感</strong><span>最终画面语言</span></div>
    <div className="compact-visual-grid" role="group" aria-label="快速视觉质感">
      {GUIDED_VISUAL_STYLES.map((option) => <button type="button" key={option.id} aria-pressed={props.visualStyle === option.id} className={props.visualStyle === option.id ? "selected" : ""} onClick={() => props.onVisualStyleChange(option.id)}>{option.label}</button>)}
    </div>
  </>;

  const renderQuickCharacterStage = () => <section className="creator-quick-adjustments compact-stage" aria-label={quickStages[1].short}>
      <header><strong>{flow.characterHeading}</strong><span>{flow.characterHint}</span></header>
      <div className="visual-choice-heading"><strong>人物身份</strong><span>决定角色气质</span></div>
      <div className="compact-visual-grid" role="group" aria-label="快速人物身份">
        {GUIDED_ROLES.map((option) => <button type="button" key={option.id} aria-pressed={props.appearance.role === option.id} className={props.appearance.role === option.id ? "selected" : ""} onClick={() => props.onAppearanceChange("role", option.id)}>{option.label}</button>)}
      </div>
      <BoardChoiceGrid label="造型方向" options={GUIDED_WARDROBES} value={props.appearance.wardrobe} onChange={(value) => props.onAppearanceChange("wardrobe", value)} artwork={wardrobeReferenceBoard} hint="看图选择" layout="full-body" />
      {creationKind !== "character" && <>
        <BoardChoiceGrid label="姿态动作" options={GUIDED_POSES} value={props.appearance.pose} onChange={(value) => props.onAppearanceChange("pose", value)} artwork={bodyReferenceBoard} hint="看图选择" layout="full-body" />
        <BoardChoiceGrid label="表情状态" options={GUIDED_EXPRESSIONS} value={props.appearance.expression} onChange={(value) => props.onAppearanceChange("expression", value)} artwork={faceReferenceBoard} hint="看图选择" />
      </>}
      {creationKind === "character" && <section className="creator-character-core" aria-label="角色内核">
        <header><div><span>角色内核</span><strong>性格、声音与关系</strong></div><b>用于后续剧情与动态</b></header>
        <div className="character-core-choice">
          <div className="visual-choice-heading"><strong>性格气质</strong><span>决定第一印象</span></div>
          <div className="compact-visual-grid" role="group" aria-label="性格气质">
            {GUIDED_MOODS.map((option) => <button type="button" key={option.id} aria-pressed={props.mood === option.id} className={props.mood === option.id ? "selected" : ""} onClick={() => props.onMoodChange(option.id)}>{option.label}</button>)}
          </div>
        </div>
        <div className="character-core-choice">
          <div className="visual-choice-heading"><strong>声线方向</strong><span>用于对话与配音</span></div>
          <div className="compact-visual-grid" role="group" aria-label="快速声线方向">
            {GUIDED_VOICES.map((option) => <button type="button" key={option.id} aria-pressed={props.appearance.voice === option.id} className={props.appearance.voice === option.id ? "selected" : ""} onClick={() => props.onAppearanceChange("voice", option.id)}>{option.label}</button>)}
          </div>
        </div>
        <div className="character-core-choice">
          <div className="visual-choice-heading"><strong>关系定位</strong><span>决定与他人如何互动</span></div>
          <div className="compact-visual-grid" role="group" aria-label="快速关系定位">
            {GUIDED_RELATIONSHIPS.map((option) => <button type="button" key={option.id} aria-pressed={props.appearance.relationship === option.id} className={props.appearance.relationship === option.id ? "selected" : ""} onClick={() => props.onAppearanceChange("relationship", option.id)}>{option.label}</button>)}
          </div>
        </div>
        <div className="character-core-choice">
          <div className="visual-choice-heading"><strong>生活兴趣</strong><span>决定日常内容延展</span></div>
          <div className="compact-visual-grid" role="group" aria-label="快速生活兴趣">
            {GUIDED_INTERESTS.map((option) => <button type="button" key={option.id} aria-pressed={props.appearance.interest === option.id} className={props.appearance.interest === option.id ? "selected" : ""} onClick={() => props.onAppearanceChange("interest", option.id)}>{option.label}</button>)}
          </div>
        </div>
        <div className="character-core-choice">
          <div className="visual-choice-heading"><strong>表演方向</strong><span>决定未来内容类型</span></div>
          <div className="compact-visual-grid" role="group" aria-label="快速表演方向">
            {GUIDED_PERFORMANCES.map((option) => <button type="button" key={option.id} aria-pressed={props.appearance.performance === option.id} className={props.appearance.performance === option.id ? "selected" : ""} onClick={() => props.onAppearanceChange("performance", option.id)}>{option.label}</button>)}
          </div>
        </div>
      </section>}
    </section>;

  const renderQuickStoryStage = () => <section className="creator-quick-adjustments compact-stage" aria-label={quickStages[2].short}>
      <header><strong>{flow.storyHeading}</strong><span>{flow.storyHint}</span></header>
      <VisualChoiceGrid label="场景世界" options={GUIDED_SCENES.filter((item) => item.id !== "custom")} value={props.scene} onChange={props.onSceneChange} artworkById={SCENE_ARTWORKS} />
      {creationKind === "scene" && <>
        <section className="creator-character-core creator-story-core" aria-label="剧情骨架">
          <header><div><span>剧情骨架</span><strong>关系、事件与节拍</strong></div><b>自动写入场景方案</b></header>
          <div className="character-core-choice">
            <div className="visual-choice-heading"><strong>人物关系</strong><span>决定站位与互动方式</span></div>
            <div className="compact-visual-grid" role="group" aria-label="剧情人物关系">
              {GUIDED_STORY_RELATIONSHIPS.map((option) => <button type="button" key={option.id} aria-pressed={(props.storyPlan?.relationship ?? "alone") === option.id} className={(props.storyPlan?.relationship ?? "alone") === option.id ? "selected" : ""} onClick={() => props.onStoryPlanChange?.("relationship", option.id)}>{option.label}</button>)}
            </div>
          </div>
          <div className="character-core-choice">
            <div className="visual-choice-heading"><strong>事件瞬间</strong><span>选择故事发生在哪一秒</span></div>
            <div className="compact-visual-grid" role="group" aria-label="剧情事件瞬间">
              {GUIDED_STORY_MOMENTS.map((option) => <button type="button" key={option.id} aria-pressed={(props.storyPlan?.moment ?? "discovery") === option.id} className={(props.storyPlan?.moment ?? "discovery") === option.id ? "selected" : ""} onClick={() => props.onStoryPlanChange?.("moment", option.id)}>{option.label}</button>)}
            </div>
          </div>
          <div className="character-core-choice">
            <div className="visual-choice-heading"><strong>叙事节拍</strong><span>控制动作与情绪强度</span></div>
            <div className="compact-visual-grid" role="group" aria-label="剧情叙事节拍">
              {GUIDED_STORY_PACING.map((option) => <button type="button" key={option.id} aria-pressed={(props.storyPlan?.pacing ?? "rising") === option.id} className={(props.storyPlan?.pacing ?? "rising") === option.id ? "selected" : ""} onClick={() => props.onStoryPlanChange?.("pacing", option.id)}>{option.label}</button>)}
            </div>
          </div>
          <div className="character-core-choice">
            <div className="visual-choice-heading"><strong>空间氛围</strong><span>影响光线与环境线索</span></div>
            <div className="compact-visual-grid" role="group" aria-label="剧情空间氛围">
              {GUIDED_STORY_ATMOSPHERES.map((option) => <button type="button" key={option.id} aria-pressed={(props.storyPlan?.atmosphere ?? "mysterious") === option.id} className={(props.storyPlan?.atmosphere ?? "mysterious") === option.id ? "selected" : ""} onClick={() => props.onStoryPlanChange?.("atmosphere", option.id)}>{option.label}</button>)}
            </div>
          </div>
        </section>
        <div className="visual-choice-heading"><strong>剧情气质</strong><span>影响表情、动作和光线</span></div>
        <div className="mood-choice-grid" role="group" aria-label="快速剧情气质">{GUIDED_MOODS.map((option) => <button type="button" key={option.id} aria-pressed={props.mood === option.id} className={props.mood === option.id ? "selected" : ""} onClick={() => props.onMoodChange(option.id)}><strong>{option.label}</strong><small>{option.prompt}</small></button>)}</div>
      </>}
      {creationKind === "series" && <section className="series-sequence-preview" aria-label="连续镜头规划">
        <header>
          <div><span>连续性锁定</span><strong>同一角色 · 同一造型 · 自定义镜头顺序</strong></div>
          <div className="series-sequence-actions">
            <button type="button" onClick={() => {
              props.onSeriesPlanChange?.(createDefaultSeriesPlan());
              setActiveSeriesShotIndex(0);
            }}>恢复推荐序列</button>
            <b>{seriesPlan.length} 镜头</b>
          </div>
        </header>
        <div className="series-shot-list">{seriesPlan.map((item, index) => <button
          type="button"
          key={`${index}-${item.id}`}
          aria-label={`第 ${index + 1} 镜头：${item.label}`}
          aria-pressed={activeSeriesShotIndex === index}
          className={activeSeriesShotIndex === index ? "selected" : ""}
          onClick={() => setActiveSeriesShotIndex(index)}
        >
          <span className="series-shot-thumb">
            <SeriesShotArtwork variationId={item.id} label={item.label} presetArtwork={CREATION_PRESET_ARTWORKS[selectedPreset.id]} sceneArtwork={activeSceneArtwork} />
            <i>{String(index + 1).padStart(2, "0")}</i>
          </span>
          <span><strong>{item.label}</strong></span>
        </button>)}</div>
        <div className="series-shot-editor">
          <div className="series-shot-editor-heading">
            <div><span>正在编辑</span><strong>第 {activeSeriesShotIndex + 1} 镜头</strong></div>
            <div className="series-shot-order-actions" role="group" aria-label="调整镜头顺序">
              <button type="button" disabled={activeSeriesShotIndex === 0} onClick={() => {
                props.onSeriesPlanChange?.(moveCandidateVariation(seriesPlan, activeSeriesShotIndex, -1));
                setActiveSeriesShotIndex((current) => Math.max(0, current - 1));
              }}>前移</button>
              <button type="button" disabled={activeSeriesShotIndex === seriesPlan.length - 1} onClick={() => {
                props.onSeriesPlanChange?.(moveCandidateVariation(seriesPlan, activeSeriesShotIndex, 1));
                setActiveSeriesShotIndex((current) => Math.min(seriesPlan.length - 1, current + 1));
              }}>后移</button>
            </div>
          </div>
          {activeSeriesShot && <div className="series-shot-active-preview" aria-live="polite">
            <SeriesShotArtwork variationId={activeSeriesShot.id} label={activeSeriesShot.label} presetArtwork={CREATION_PRESET_ARTWORKS[selectedPreset.id]} sceneArtwork={activeSceneArtwork} />
            <div><span>当前镜头</span><strong>{activeSeriesShot.label}</strong><small>{activeSeriesShot.directive}</small></div>
          </div>}
          <div className="visual-choice-heading series-shot-choice-heading"><strong>替换镜头类型</strong><span>角色、造型和世界保持不变</span></div>
          <div className="series-shot-type-grid" role="group" aria-label="镜头类型">
            {SERIES_VARIATION_LIBRARY.map((item) => <button
              type="button"
              key={item.id}
              aria-pressed={seriesPlan[activeSeriesShotIndex]?.id === item.id}
              className={seriesPlan[activeSeriesShotIndex]?.id === item.id ? "selected" : ""}
              onClick={() => props.onSeriesPlanChange?.(replaceCandidateVariation(seriesPlan, activeSeriesShotIndex, item.id))}
            >
              <SeriesShotArtwork variationId={item.id} label={item.label} presetArtwork={CREATION_PRESET_ARTWORKS[selectedPreset.id]} sceneArtwork={activeSceneArtwork} />
              <span><strong>{item.label}</strong></span>
            </button>)}
          </div>
        </div>
      </section>}
      {(creationKind === "image" || creationKind === "series") && <>
        <div className="visual-choice-heading"><strong>{creationKind === "series" ? "系列气质" : "画面气质"}</strong><span>影响光线、表情与色彩</span></div>
        <div className="mood-choice-grid" role="group" aria-label={creationKind === "series" ? "快速系列气质" : "快速画面气质"}>{GUIDED_MOODS.map((option) => <button type="button" key={option.id} aria-pressed={props.mood === option.id} className={props.mood === option.id ? "selected" : ""} onClick={() => props.onMoodChange(option.id)}><strong>{option.label}</strong><small>{option.prompt}</small></button>)}</div>
      </>}
    </section>;

  const renderQuickOutputStage = () => <section className="creator-quick-adjustments compact-stage" aria-label={creationKind === "character" ? "角色资产确认" : "画面与交付选择"}>
    <header><strong>{flow.outputHeading}</strong><span>{flow.outputHint}</span></header>
    {renderShotAndStyle()}
    {creationKind !== "character" && <div>
      <div className="visual-choice-heading"><strong>画面比例</strong><span>写入最终交付方案</span></div>
      <div className="compact-visual-grid" role="group" aria-label="快速画面比例">
        {CREATIVE_ASPECT_RATIOS.map((ratio) => <button type="button" key={ratio} aria-pressed={(props.aspectRatio ?? "2:3") === ratio} className={(props.aspectRatio ?? "2:3") === ratio ? "selected" : ""} onClick={() => props.onAspectRatioChange?.(ratio)}>{ratio}</button>)}
      </div>
    </div>}
    <div className="visual-choice-heading"><strong>必须保持</strong><span>可多选</span></div>
    <div className="constraint-choice-grid" role="group" aria-label="快速生成约束">
      {GUIDED_CONSTRAINTS.map((option) => <button type="button" key={option.id} aria-pressed={props.constraints.includes(option.id)} className={props.constraints.includes(option.id) ? "selected" : ""} onClick={() => props.onConstraintToggle(option.id)}><span aria-hidden="true">{props.constraints.includes(option.id) ? "✓" : "+"}</span>{option.label}</button>)}
    </div>
    {creationKind !== "character" && <div className="creator-output-controls quick-output-controls">
      <div>
        <div className="visual-choice-heading"><strong>生成质量</strong><span>越高越重视细节</span></div>
        <div className="compact-visual-grid" role="group" aria-label="快速生成质量">
          {([['draft', '快速'], ['standard', '标准'], ['premium', '高质']] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={props.qualityTier === id} className={props.qualityTier === id ? "selected" : ""} onClick={() => props.onQualityTierChange(id)}>{label}</button>)}
        </div>
      </div>
      <div>
        <div className="visual-choice-heading"><strong>候选数量</strong><span>生成后并排挑选</span></div>
        <div className="compact-visual-grid" role="group" aria-label="快速候选数量">
          {([1, 2, 4] as const).map((count) => <button type="button" key={count} aria-pressed={props.candidateCount === count} className={props.candidateCount === count ? "selected" : ""} onClick={() => props.onCandidateCountChange(count)}>{count} 张</button>)}
        </div>
      </div>
    </div>}
    <div className="creator-ready-card ready">
      <span>{flow.readyLabel}</span>
      <strong>{flow.readyTitle}</strong>
      <small>{flow.readyHint}</small>
    </div>
  </section>;

  const renderCharacterCore = () => <>
    <nav className="character-core-tabs" aria-label="角色内核分类">
      {([
        ["identity", "定位", "职业、服装、性格"],
        ["relationship", "关系", "声线、关系、兴趣"],
        ["narrative", "故事", "原型、目标、冲突"],
        ["performance", "表演", "动作、表情、场景"],
        ["state", "状态", "心情、地点、关系"],
      ] as const).map(([id, label, hint]) => <button
        type="button"
        key={id}
        aria-current={characterCorePanel === id ? "page" : undefined}
        className={characterCorePanel === id ? "selected" : ""}
        onClick={() => setCharacterCorePanel(id)}
      ><strong>{label}</strong><small>{hint}</small></button>)}
    </nav>

    <section className="character-core-panel" aria-label={`${characterCorePanel === "identity" ? "角色定位" : characterCorePanel === "relationship" ? "角色关系" : characterCorePanel === "narrative" ? "角色故事" : characterCorePanel === "performance" ? "角色表演" : "角色状态"}选择`}>
      {characterCorePanel === "identity" && <>
        <div className="visual-choice-heading"><strong>角色身份</strong><span>决定第一印象与故事位置</span></div>
        <div className="compact-visual-grid character-role-grid" role="group" aria-label="角色身份">
          {GUIDED_ROLES.map((option) => <button type="button" key={option.id} aria-pressed={props.appearance.role === option.id} className={props.appearance.role === option.id ? "selected" : ""} onClick={() => props.onAppearanceChange("role", option.id)}>{option.label}</button>)}
        </div>
        <BoardChoiceGrid label="服装方向" options={GUIDED_WARDROBES} value={props.appearance.wardrobe} onChange={(value) => props.onAppearanceChange("wardrobe", value)} artwork={wardrobeReferenceBoard} layout="full-body" />
        <div className="visual-choice-heading"><strong>性格气质</strong><span>决定行为与表达倾向</span></div>
        <div className="compact-visual-grid character-mood-grid" role="group" aria-label="性格气质">
          {GUIDED_MOODS.map((option) => <button type="button" key={option.id} aria-pressed={props.mood === option.id} className={props.mood === option.id ? "selected" : ""} onClick={() => props.onMoodChange(option.id)}>{option.label}</button>)}
        </div>
      </>}

      {characterCorePanel === "relationship" && <>
        <div className="visual-choice-heading"><strong>声线方向</strong><span>用于对白与动态内容</span></div>
        <div className="compact-visual-grid" role="group" aria-label="声线方向">{GUIDED_VOICES.map((option) => <button type="button" key={option.id} aria-pressed={props.appearance.voice === option.id} className={props.appearance.voice === option.id ? "selected" : ""} onClick={() => props.onAppearanceChange("voice", option.id)}>{option.label}</button>)}</div>
        <div className="visual-choice-heading"><strong>关系定位</strong><span>决定与其他角色的互动方式</span></div>
        <div className="compact-visual-grid" role="group" aria-label="关系定位">{GUIDED_RELATIONSHIPS.map((option) => <button type="button" key={option.id} aria-pressed={props.appearance.relationship === option.id} className={props.appearance.relationship === option.id ? "selected" : ""} onClick={() => props.onAppearanceChange("relationship", option.id)}>{option.label}</button>)}</div>
        <div className="visual-choice-heading"><strong>生活兴趣</strong><span>为情境与道具提供依据</span></div>
        <div className="compact-visual-grid" role="group" aria-label="生活兴趣">{GUIDED_INTERESTS.map((option) => <button type="button" key={option.id} aria-pressed={props.appearance.interest === option.id} className={props.appearance.interest === option.id ? "selected" : ""} onClick={() => props.onAppearanceChange("interest", option.id)}>{option.label}</button>)}</div>
      </>}

      {characterCorePanel === "narrative" && <>
        <div className="character-narrative-intro">
          <span>角色故事基础</span>
          <strong>让同一个人进入不同场景，仍然按照同一套动机行动</strong>
        </div>
        <div className="visual-choice-heading"><strong>人物原型</strong><span>决定她惯用的行动方式</span></div>
        <div className="compact-visual-grid" role="group" aria-label="人物原型">{GUIDED_ARCHETYPES.map((option) => <button type="button" key={option.id} aria-pressed={props.appearance.archetype === option.id} className={props.appearance.archetype === option.id ? "selected" : ""} onClick={() => props.onAppearanceChange("archetype", option.id)}>{option.label}</button>)}</div>
        <div className="visual-choice-heading"><strong>核心目标</strong><span>推动长期剧情的方向</span></div>
        <div className="compact-visual-grid" role="group" aria-label="核心目标">{GUIDED_DRIVES.map((option) => <button type="button" key={option.id} aria-pressed={props.appearance.drive === option.id} className={props.appearance.drive === option.id ? "selected" : ""} onClick={() => props.onAppearanceChange("drive", option.id)}>{option.label}</button>)}</div>
        <div className="visual-choice-heading"><strong>内在冲突</strong><span>决定反差与转折</span></div>
        <div className="compact-visual-grid" role="group" aria-label="内在冲突">{GUIDED_CONFLICTS.map((option) => <button type="button" key={option.id} aria-pressed={props.appearance.conflict === option.id} className={props.appearance.conflict === option.id ? "selected" : ""} onClick={() => props.onAppearanceChange("conflict", option.id)}>{option.label}</button>)}</div>
        <div className="visual-choice-heading"><strong>默认开场</strong><span>后续场景可直接沿用</span></div>
        <div className="compact-visual-grid" role="group" aria-label="默认开场">{GUIDED_OPENINGS.map((option) => <button type="button" key={option.id} aria-pressed={props.appearance.opening === option.id} className={props.appearance.opening === option.id ? "selected" : ""} onClick={() => props.onAppearanceChange("opening", option.id)}>{option.label}</button>)}</div>
      </>}

      {characterCorePanel === "performance" && <>
        <SemanticChoiceGrid label="默认姿态" hint="看动作结构选择" options={GUIDED_POSES} value={props.appearance.pose} onChange={(value) => props.onAppearanceChange("pose", value)} icons={POSE_CHOICE_ICONS} descriptions={POSE_CHOICE_HINTS} />
        <SemanticChoiceGrid label="默认表情" hint="看情绪变化选择" options={GUIDED_EXPRESSIONS} value={props.appearance.expression} onChange={(value) => props.onAppearanceChange("expression", value)} icons={EXPRESSION_CHOICE_ICONS} descriptions={EXPRESSION_CHOICE_HINTS} />
        <div className="visual-choice-heading"><strong>表演方向</strong><span>决定后续可扩展内容</span></div>
        <div className="compact-visual-grid" role="group" aria-label="表演方向">{GUIDED_PERFORMANCES.map((option) => <button type="button" key={option.id} aria-pressed={props.appearance.performance === option.id} className={props.appearance.performance === option.id ? "selected" : ""} onClick={() => props.onAppearanceChange("performance", option.id)}>{option.label}</button>)}</div>
        <VisualChoiceGrid label="默认场景" options={GUIDED_SCENES.filter((item) => item.id !== "custom")} value={props.scene} onChange={props.onSceneChange} artworkById={SCENE_ARTWORKS} />
      </>}

      {characterCorePanel === "state" && <>
        <div className="visual-choice-heading"><strong>持续状态</strong><span>可多选，保存后自动建立基础状态</span></div>
        <div className="character-tracker-grid" role="group" aria-label="持续状态字段">
          {CHARACTER_TRACKER_PRESETS.map((preset) => {
            const selected = trackerIds.includes(preset.id);
            const preview = trackerPreview.find((item) => item.id === preset.id);
            return <button
              type="button"
              key={preset.id}
              role="checkbox"
              aria-checked={selected}
              className={selected ? "character-tracker-card selected" : "character-tracker-card"}
              onClick={() => props.onTrackerToggle?.(preset.id)}
            >
              <span className="character-tracker-card-top"><i aria-hidden="true">{selected ? "✓" : "+"}</i><b>{preset.visibility === "visible" ? "用户可见" : "内部状态"}</b></span>
              <strong>{preset.label}</strong>
              <em>{preview?.value ?? preset.description}</em>
              <small>{preset.updateRule}</small>
            </button>;
          })}
        </div>
        {props.onCustomTrackersChange && <CharacterTrackerEditor
          value={props.customTrackers ?? []}
          onChange={props.onCustomTrackersChange}
          title="添加自定义状态"
          description="标准字段不够时再添加，不增加主流程步骤"
          compact
        />}
        <div className="character-tracker-summary" aria-live="polite">
          <span>已选择</span><strong>{allTrackerPreview.length} 个状态字段</strong>
          <small>{allTrackerPreview.length ? allTrackerPreview.map((item) => `${item.label}：${item.value}`).join(" · ") : "不建立持续状态字段"}</small>
        </div>
      </>}
    </section>
  </>;

  const renderCharacterQuickReview = () => <>
    <section className="character-finish-card" aria-label="角色方案确认">
      <div className="character-finish-portrait">
        {props.previewAssetId
          ? <AssetPreview assetId={props.previewAssetId} fallback={<PresetArtwork preset={selectedPreset} />} />
          : <PresetArtwork preset={selectedPreset} />}
      </div>
      <div className="character-finish-copy">
        <span>角色方案已完成</span>
        <h3>{sourceLabel || selectedPreset.label}</h3>
        <p>{summary}</p>
        <div className="character-finish-tags">
          <b>{GUIDED_ROLES.find((item) => item.id === props.appearance.role)?.label}</b>
          <b>{GUIDED_MOODS.find((item) => item.id === props.mood)?.label}</b>
          <b>{GUIDED_VISUAL_STYLES.find((item) => item.id === props.visualStyle)?.label}</b>
        </div>
      </div>
    </section>
    <div className="character-review-essentials" role="region" aria-label="角色核心设定">
      <ReviewTile label="基础" value={`${GUIDED_AGES.find((item) => item.id === props.appearance.age)?.label} · ${GUIDED_ETHNICITIES.find((item) => item.id === props.appearance.ethnicity)?.label} · ${GUIDED_SKIN_TONES.find((item) => item.id === props.appearance.skinTone)?.label}`} />
      <ReviewTile label="面部" value={`${GUIDED_FACES.find((item) => item.id === props.appearance.face)?.label} · ${GUIDED_EYES.find((item) => item.id === props.appearance.eyes)?.label}`} artwork={faceReferenceBoard} index={optionIndex(GUIDED_FACES, props.appearance.face)} count={GUIDED_FACES.length} />
      <ReviewTile label="发型" value={`${GUIDED_HAIR.find((item) => item.id === props.appearance.hair)?.label} · ${GUIDED_HAIR_COLORS.find((item) => item.id === props.appearance.hairColor)?.label}`} artwork={hairReferenceBoard} index={optionIndex(GUIDED_HAIR, props.appearance.hair)} count={GUIDED_HAIR.length} />
      <ReviewTile label="形体" value={`${GUIDED_BODIES.find((item) => item.id === props.appearance.body)?.label} · ${GUIDED_HEIGHTS.find((item) => item.id === props.appearance.height)?.label}`} artwork={bodyReferenceBoard} index={optionIndex(GUIDED_BODIES, props.appearance.body)} count={GUIDED_BODIES.length} />
      <ReviewTile label="造型" value={`${GUIDED_ROLES.find((item) => item.id === props.appearance.role)?.label} · ${GUIDED_WARDROBES.find((item) => item.id === props.appearance.wardrobe)?.label}`} artwork={wardrobeReferenceBoard} index={optionIndex(GUIDED_WARDROBES, props.appearance.wardrobe)} count={GUIDED_WARDROBES.length} />
      <ReviewTile label="角色气质" value={GUIDED_MOODS.find((item) => item.id === props.mood)?.label ?? ""} />
      <ReviewTile label="声线与关系" value={`${GUIDED_VOICES.find((item) => item.id === props.appearance.voice)?.label} · ${GUIDED_RELATIONSHIPS.find((item) => item.id === props.appearance.relationship)?.label}`} />
      <ReviewTile label="故事驱动" value={`${GUIDED_ARCHETYPES.find((item) => item.id === props.appearance.archetype)?.label} · ${GUIDED_DRIVES.find((item) => item.id === props.appearance.drive)?.label}`} />
      <ReviewTile label="冲突与开场" value={`${GUIDED_CONFLICTS.find((item) => item.id === props.appearance.conflict)?.label} · ${GUIDED_OPENINGS.find((item) => item.id === props.appearance.opening)?.label}`} />
      <ReviewTile label="兴趣与表演" value={`${GUIDED_INTERESTS.find((item) => item.id === props.appearance.interest)?.label} · ${GUIDED_PERFORMANCES.find((item) => item.id === props.appearance.performance)?.label}`} />
      <ReviewTile label="动作与表情" value={`${GUIDED_POSES.find((item) => item.id === props.appearance.pose)?.label} · ${GUIDED_EXPRESSIONS.find((item) => item.id === props.appearance.expression)?.label}`} />
      <ReviewTile label="默认场景" value={sceneLabel ?? ""} />
      <ReviewTile label="持续状态" value={allTrackerPreview.length ? allTrackerPreview.map((item) => item.label).join(" · ") : "未启用"} />
    </div>
    <section className="character-extension-strip" aria-label="后续可扩展能力">
      <div><span>保存后可继续扩展</span><strong>换装 · 表情 · 动作 · 场景 · 状态 · 连续镜头</strong></div>
      <b>角色资产</b>
    </section>
  </>;

  const renderQuickControls = () => <>
    <nav className="creator-quick-steps" aria-label="快速创作步骤">
      {quickStages.map((item, index) => <button
        type="button"
        key={item.id}
        aria-current={quickStage === item.id ? "step" : undefined}
        className={quickStage === item.id ? "selected" : index < quickStageIndex ? "complete" : ""}
        onClick={() => setQuickStage(item.id)}
      ><span>{index < quickStageIndex ? "✓" : index + 1}</span><strong>{item.label}</strong></button>)}
    </nav>
    <div className="creator-quick-stage" aria-live="polite">
      {quickStage === "direction" && renderDirection()}
      {quickStage === "character" && renderQuickCharacterStage()}
      {quickStage === "story" && renderQuickStoryStage()}
      {quickStage === "output" && renderQuickOutputStage()}
    </div>
  </>;

  const selectedReferenceIndex = selectedReference ? props.referenceAssets.findIndex((item) => item.id === selectedReference.id) : -1;
  const sourceLabel = props.sourceMode === "saved"
    ? selectedCharacter?.name
    : props.sourceMode === "reference" && selectedReference
      ? referenceAssetLabel(selectedReference, Math.max(0, selectedReferenceIndex))
      : selectedPreset.label;
  const sceneLabel = selectedScene?.name ?? GUIDED_SCENES.find((item) => item.id === props.scene)?.label;
  const currentSection = SECTIONS[sectionIndex];
  const goNext = () => setSection(SECTIONS[Math.min(sectionIndex + 1, SECTIONS.length - 1)].id);
  const goBack = () => setSection(SECTIONS[Math.max(sectionIndex - 1, 0)].id);
  const previewNote = creationKind === "character"
    ? "方向样片 · 选择会汇总为角色资产"
    : creationKind === "image"
      ? "方向样片 · 选择会写入单张方案"
      : creationKind === "scene"
        ? "方向样片 · 选择会写入剧情方案"
        : "方向样片 · 选择会写入系列方案";
  const renderCharacterChoicePreview = () => {
    if (section === "identity") return <BoardArtwork
      src={ethnicityReferenceBoard}
      index={optionIndex(GUIDED_ETHNICITIES, props.appearance.ethnicity)}
      count={GUIDED_ETHNICITIES.length}
      className="creator-step-preview"
    />;
    if (section === "face") return <BoardArtwork
      src={faceReferenceBoard}
      index={optionIndex(GUIDED_FACES, props.appearance.face)}
      count={GUIDED_FACES.length}
      className="creator-step-preview"
    />;
    if (section === "body") return <BoardArtwork
      src={bodyReferenceBoard}
      index={optionIndex(GUIDED_BODIES, props.appearance.body)}
      count={GUIDED_BODIES.length}
      className="creator-step-preview body"
      layout="full-body"
    />;
    if (section === "details" && characterCorePanel === "identity") return <BoardArtwork
      src={wardrobeReferenceBoard}
      index={optionIndex(GUIDED_WARDROBES, props.appearance.wardrobe)}
      count={GUIDED_WARDROBES.length}
      className="creator-step-preview body"
      layout="full-body"
    />;
    return undefined;
  };
  const previewBadges = section === "details" && characterCorePanel === "performance"
    ? [
      GUIDED_POSES.find((item) => item.id === props.appearance.pose)?.label,
      GUIDED_EXPRESSIONS.find((item) => item.id === props.appearance.expression)?.label,
    ]
    : section === "details" && characterCorePanel === "narrative"
      ? [
        GUIDED_ARCHETYPES.find((item) => item.id === props.appearance.archetype)?.label,
        GUIDED_DRIVES.find((item) => item.id === props.appearance.drive)?.label,
      ]
      : [
        GUIDED_ROLES.find((item) => item.id === props.appearance.role)?.label,
        GUIDED_MOODS.find((item) => item.id === props.mood)?.label,
      ];
  const renderStepPreview = () => {
    if (props.previewAssetId) return <AssetPreview assetId={props.previewAssetId} fallback={<GeneratedCharacterPreview preset={selectedPreset} note={previewNote} />} />;
    if (creationKind === "character" && mode === "quick") {
      const choicePreview = renderCharacterChoicePreview();
      if (choicePreview) return choicePreview;
    }
    if ((section === "world" || (mode === "quick" && quickStage === "story")) && SCENE_ARTWORKS[props.scene]) return <img className="creator-source-preview" src={SCENE_ARTWORKS[props.scene]} alt={`${sceneLabel}场景预览`} />;
    return <GeneratedCharacterPreview preset={selectedPreset} note={previewNote} />;
  };

  if (creationKind === "character" && mode === "quick") {
    const characterStepIndex = Math.max(0, CHARACTER_QUICK_STEPS.findIndex((item) => item.id === section));
    const characterStep = CHARACTER_QUICK_STEPS[characterStepIndex];
    const previousCharacterStep = CHARACTER_QUICK_STEPS[characterStepIndex - 1];
    const nextCharacterStep = CHARACTER_QUICK_STEPS[characterStepIndex + 1];
    const renderCharacterStep = () => {
      if (section === "direction") return renderDirection();
      if (section === "identity") return renderIdentity();
      if (section === "face") return renderCharacterAppearance();
      if (section === "body") return renderBody();
      if (section === "details") return renderCharacterCore();
      return renderCharacterQuickReview();
    };

    return <section className="character-visual-flow" aria-label="角色视觉创作">
      <header className="character-flow-header">
        <div className="creator-title-row">
          {props.onExit && <button type="button" className="creator-exit" onClick={props.onExit} aria-label="退出创作">←</button>}
          <div><p className="eyebrow">角色创作</p><h2>创建一个可持续使用的角色</h2></div>
        </div>
        <div className="creator-mode-switch" role="group" aria-label="创作模式">
          <button type="button" aria-pressed="true" className="selected">快速创作</button>
          <button type="button" aria-pressed="false" onClick={() => setMode("fine")}>精细塑造</button>
        </div>
      </header>

      {props.draftRestoredAt && <div className="character-draft-banner" role="status">
        <div><strong>已恢复上次进度</strong><span>选择会继续自动保存</span></div>
        {props.onRestart && <button type="button" onClick={props.onRestart}>重新开始</button>}
      </div>}

      <nav className="character-flow-stepper" aria-label="角色创作步骤">
        {CHARACTER_QUICK_STEPS.map((item, index) => <button
          type="button"
          key={item.id}
          aria-current={section === item.id ? "step" : undefined}
          className={section === item.id ? "selected" : index < characterStepIndex ? "complete" : ""}
          onClick={() => setSection(item.id)}
        ><span>{index < characterStepIndex ? "✓" : index + 1}</span><strong>{item.label}</strong><small>{item.short}</small></button>)}
      </nav>

      <div className="character-flow-progress" aria-hidden="true"><i style={{ width: `${((characterStepIndex + 1) / CHARACTER_QUICK_STEPS.length) * 100}%` }} /></div>

      <div className="character-flow-workspace">
        <section className="character-flow-main" aria-label="当前角色步骤">
          <header className="character-step-heading">
            <div><span>第 {characterStepIndex + 1} / {CHARACTER_QUICK_STEPS.length} 步</span><h3>{characterStep.label}</h3></div>
            <p>{characterStep.short}</p>
          </header>
          <div className="character-step-options" key={section}>{renderCharacterStep()}</div>
        </section>

        <aside className="character-flow-preview" aria-label="当前角色预览">
          <div className="character-flow-preview-media">{renderStepPreview()}</div>
          <div className="character-flow-preview-copy">
            <span>当前角色</span>
            <strong>{sourceLabel || selectedPreset.label}</strong>
            <p>{summary}</p>
            <div>{previewBadges.filter(Boolean).map((item) => <b key={item}>{item}</b>)}</div>
          </div>
        </aside>
      </div>

      <footer className="character-flow-actions">
        <div className="character-flow-status"><span>已完成 {characterStepIndex + 1} / {CHARACTER_QUICK_STEPS.length}</span><strong>{summary}</strong></div>
        <div>
          {previousCharacterStep && <button type="button" className="subtle-button" onClick={() => setSection(previousCharacterStep.id)}>上一步</button>}
          {nextCharacterStep
            ? <button type="button" className="primary-button" onClick={() => setSection(nextCharacterStep.id)}>下一步 · {nextCharacterStep.label}</button>
            : <button type="button" className="primary-button" disabled={props.preparing} onClick={props.onSaveCharacter ?? props.onCreate}>{props.preparing ? "正在保存…" : props.sourceMode === "saved" ? "进入角色中枢" : "保存为角色资产"}</button>}
        </div>
      </footer>
      {props.notice && <div className="notice creator-notice" role="status"><span>{props.notice}</span>{props.onNoticeDismiss && <button type="button" aria-label="关闭提示" onClick={props.onNoticeDismiss}>×</button>}</div>}
    </section>;
  }

  return (
    <section className={`visual-creator ${mode === "quick" ? "quick-mode" : "fine-mode"}`} aria-label={flow.rootAriaLabel}>
      <header className="visual-creator-header">
        <div className="creator-title-row">
          {props.onExit && <button type="button" className="creator-exit" onClick={props.onExit} aria-label="退出创作">←</button>}
          <div><p className="eyebrow">{flow.eyebrow}</p><h2>{mode === "quick" ? flow.title : SECTION_HEADLINES[section]}</h2></div>
        </div>
        <div className="creator-header-actions">
          {creationKind === "character" && <div className="creator-mode-switch" role="group" aria-label="创作模式">
            <button type="button" aria-pressed={mode === "quick"} className={mode === "quick" ? "selected" : ""} onClick={() => setMode("quick")}>快速创作</button>
            <button type="button" aria-pressed={mode === "fine"} className={mode === "fine" ? "selected" : ""} onClick={() => setMode("fine")}>精细塑造</button>
          </div>}
        </div>
      </header>
      <div className={`visual-creator-layout ${mode === "quick" ? "creator-quick-layout" : ""}`}>
        {mode === "fine" && <nav className="creator-section-nav" aria-label="角色创作步骤">
          {SECTIONS.map((item, index) => <button type="button" key={item.id} className={section === item.id ? "active" : index < sectionIndex ? "complete" : ""} aria-current={section === item.id ? "step" : undefined} onClick={() => setSection(item.id)}><span>{index < sectionIndex ? "✓" : index + 1}</span><strong>{item.label}</strong><small>{item.short}</small></button>)}
        </nav>}
        <section className="creator-preview-stage" aria-label={flow.previewAriaLabel}>
          {renderStepPreview()}
          <div className="creator-preview-badge"><span>{props.sourceMode === "new" ? "方向样片" : "身份参考"}</span><strong>{sourceLabel || "等待选择"}</strong></div>
          <div className="creator-preview-summary"><div><strong>{summary}</strong><span>{sceneLabel} · {atmosphereSummary}</span></div><div className="preview-contract"><span>{flow.previewPrimaryLabel}</span><b>{props.constraints.includes("identity") ? "已锁定" : "可变化"}</b><span>{flow.previewSecondaryLabel}</span><b>{creationKind === "series" ? `${seriesPlan.length} 镜头` : creationKind === "character" ? CREATION_DIRECTIONS.find((item) => item.id === props.direction)?.label : (props.aspectRatio ?? "2:3")}</b></div></div>
        </section>
        <aside className="creator-option-panel">
          <header><div><span>{mode === "quick" ? `第 ${quickStageIndex + 1} / ${quickStages.length} 步` : `第 ${sectionIndex + 1} 步`}</span><p>{mode === "quick" ? currentQuickStage.label : currentSection.label}</p></div><small>{mode === "quick" ? currentQuickStage.short : currentSection.short}</small></header>
          <div className="creator-option-scroll" key={mode === "quick" ? quickStage : section}>
            {mode === "quick" ? renderQuickControls() : <>
              {section === "direction" && renderDirection()}
              {section === "identity" && renderIdentity()}
              {section === "face" && renderFace()}
              {section === "hair" && renderHair()}
              {section === "body" && renderBody()}
              {section === "world" && renderWorld()}
              {section === "details" && renderDetails()}
              {section === "output" && renderOutput()}
            </>}
          </div>
        </aside>
      </div>
      <footer className="creator-action-bar">
        <div className="creator-current-selection">
          <span>当前方案</span>
          <strong>{sourceLabel || "等待选择"}</strong>
          <small>{summary} · {sceneLabel}</small>
        </div>
        <div className="creator-primary-actions">
          {mode === "quick" ? <>
            {quickStageIndex > 0 && <button type="button" className="subtle-button" onClick={() => setQuickStage(quickStages[quickStageIndex - 1].id)}>上一步</button>}
            {quickStageIndex < quickStages.length - 1 ?
              <button type="button" className="primary-button creator-next" onClick={() => setQuickStage(quickStages[quickStageIndex + 1].id)}>下一步 · {quickStages[quickStageIndex + 1].label}</button>
              : <>
              {creationKind === "character" && <button type="button" className="subtle-button" onClick={() => setMode("fine")}>精细调整</button>}
              <button
                type="button"
                className="primary-button creator-generate"
                disabled={props.preparing}
                onClick={creationKind === "character" && props.onSaveCharacter ? props.onSaveCharacter : props.onCreate}
              >{props.preparing ? "正在保存…" : creationKind === "character" && props.sourceMode === "saved" ? "进入角色中枢" : flow.finalAction}</button>
            </>}
          </> : <>
            {sectionIndex > 0 && <button type="button" className="subtle-button" onClick={goBack}>上一步</button>}
            {section !== "output" ? <>
              <button type="button" className="primary-button creator-next" onClick={goNext}>下一步 · {SECTIONS[sectionIndex + 1].label}</button>
            </> : <>
              <button type="button" className="subtle-button" disabled={props.preparing} onClick={props.onSave}>保存方案</button>
              <button
                type="button"
                className="primary-button creator-generate"
                disabled={props.preparing}
                onClick={creationKind === "character" && props.onSaveCharacter ? props.onSaveCharacter : props.onCreate}
              >{props.preparing ? "正在保存…" : creationKind === "character" ? (props.sourceMode === "saved" ? "进入角色中枢" : "保存为角色资产") : "进入创作台"}</button>
            </>}
          </>}
        </div>
      </footer>
      {props.notice && <div className="notice creator-notice" role="status"><span>{props.notice}</span>{props.onNoticeDismiss && <button type="button" aria-label="关闭提示" onClick={props.onNoticeDismiss}>×</button>}</div>}
    </section>
  );
}
