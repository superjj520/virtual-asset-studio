import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdaptiveDomainNavigation } from "./ui-adapters/AdaptiveDomainNavigation";
import { CharacterInspector } from "./character/CharacterInspector";
import { CharacterWorkspacePanel } from "./character/CharacterWorkspacePanel";
import { buildCharacterExtensionCard, CHARACTER_EXTENSION_OPTIONS } from "./character/character-extensions";
import { buildCharacterFactSeeds } from "./character/character-fact-seeds";
import { SceneWorkspacePanel } from "./scene/SceneWorkspacePanel";
import { ReviewWorkspacePanel } from "./review/ReviewWorkspacePanel";
import { ProjectPipelinePanel } from "./project/ProjectPipelinePanel";
import { ReferenceBindingsPanel } from "./creation/ReferenceBindingsPanel";
import { CreationCandidateGallery } from "./creation/CreationCandidateGallery";
import { LocalDirectionCandidateGallery } from "./creation/LocalDirectionCandidateGallery";
import { CreationStudioJourney, type CreationStudioStage } from "./creation/CreationStudioJourney";
import { CreationLaunchpad, type CreationLaunchKind } from "./creation/CreationLaunchpad";
import { CREATION_PRESET_ARTWORKS, SCENE_ARTWORKS, VisualCharacterCreator } from "./creation/VisualCharacterCreator";
import {
  buildCharacterStateTrackers,
  DEFAULT_CHARACTER_TRACKER_IDS,
  type CharacterTrackerPresetId,
} from "./creation/character-tracker-presets";
import {
  clearCharacterCreationDraft,
  loadCharacterCreationDraft,
  saveCharacterCreationDraft,
  type CharacterCreationDraft,
} from "./creation/character-creation-draft";
import {
  buildCreativePlan,
  composeGuidedCreation,
  CREATION_PRESETS,
  DEFAULT_GUIDED_APPEARANCE,
  DEFAULT_GUIDED_STORY_PLAN,
  CREATION_DIRECTIONS,
  GUIDED_ARCHETYPES,
  GUIDED_CONFLICTS,
  GUIDED_CONSTRAINTS,
  GUIDED_DRIVES,
  GUIDED_EXPRESSIONS,
  GUIDED_HAIR,
  GUIDED_INTERESTS,
  GUIDED_MOODS,
  GUIDED_OPENINGS,
  GUIDED_PERFORMANCES,
  GUIDED_POSES,
  GUIDED_RELATIONSHIPS,
  GUIDED_ROLES,
  GUIDED_SCENES,
  GUIDED_SHOTS,
  GUIDED_STORY_ATMOSPHERES,
  GUIDED_STORY_MOMENTS,
  GUIDED_STORY_PACING,
  GUIDED_STORY_RELATIONSHIPS,
  GUIDED_VISUAL_STYLES,
  GUIDED_SUBJECTS,
  GUIDED_VOICES,
  GUIDED_WARDROBES,
  type CreationDirection,
  type CreationPresetId,
  type GuidedAppearance,
  type GuidedConstraint,
  type GuidedMood,
  type GuidedScene,
  type GuidedShot,
  type GuidedStoryPlan,
  type GuidedSubject,
  type GuidedVisualStyle,
} from "./creation/creative-plan";
import {
  applyCreationRefinement,
  getCreationRefinements,
  type CreationRefinementId,
} from "./creation/refinement-presets";
import { buildLocalSceneAssetDraft } from "./creation/local-scene-asset";
import {
  buildCandidateVariations,
  createDefaultSeriesPlan,
  type CandidateVariation,
} from "./creation/candidate-variations";
import {
  hasAcceptance,
  isCustomBriefValue,
  PROJECT_ACCEPTANCE_OPTIONS,
  PROJECT_BRIEF_OPTIONS,
  toggleAcceptance,
  type ProjectBriefSingleKey,
} from "./project/project-brief-options";
import { GenerationQueuePanel } from "./production/GenerationQueuePanel";
import { CandidateComparePanel } from "./production/CandidateComparePanel";
import { jobAspectSummary, jobReferenceSummary } from "./production/job-presentation";
import { CollectionAssetFilterBar, filterCollectionAssets, type CollectionAssetFilters } from "./assets/CollectionAssetFilterBar";
import { composeCharacterCard, evaluateCharacterCoverage, type CharacterUseCase, type CharacterVariantSelection } from "./shared/character-slots";
import { collectUsableReferenceAssetIds, getAssetCollectionBlueprint } from "./shared/asset-collection-blueprints";
import { normalizeReferenceBindings } from "./shared/reference-bindings";
import { CREATIVE_ASPECT_RATIOS, normalizeCreativeAspectRatio, aspectRatioForImageSize } from "./shared/types";
import type {
  Asset,
  AssetCollection,
  AssetCollectionDetail,
  AssetCollectionKind,
  AssetLineageItem,
  AssetUsageReference,
  AssetType,
  BudgetStatus,
  CharacterProfile,
  CharacterStateTracker,
  CharacterDetail,
  CharacterExtensionKind,
  CharacterWorkspaceSnapshot,
  CharacterFactInput,
  CharacterVariantKind,
  CharacterGroup,
  CreativeAspectRatio,
  CreativeCard,
  CreativeDeliveryMode,
  CreativeTask,
  CreativeRecipe,
  GenerationBatch,
  GenerationQualityTier,
  ImageUnderstandingReport,
  LearningPattern,
  Project,
  ProjectBrief,
  ProjectMedium,
  ProjectWorkspace,
  ReversePrompt,
  ReviewWorkspaceSnapshot,
  SceneKind,
  SceneProfile,
  SceneWorkspaceSnapshot,
  PromptBuild,
  PromptEntry,
  PromptSource,
  PromptTranslation,
  ProviderCapability,
  ProviderId,
  ProviderStatus,
  ProviderVerificationResult,
  RightsStatus,
  ShotContract,
  ShotPlan,
  StudioJob,
  ParadigmComposition,
  VisualParadigm,
  VisualParadigmRole,
} from "./shared/types";

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  character: "角色",
  reference_image: "人物参考",
  scene: "场景",
  wardrobe: "服装",
  pose: "姿势",
  prop: "道具",
  style: "风格",
  camera: "镜头",
  prompt_pattern: "提示词",
  image: "成图",
  video: "视频",
  audio: "音频",
  game_export: "游戏导出",
};

const ASSET_USAGE_LABELS: Record<AssetUsageReference["kind"], string> = {
  project: "项目",
  project_master: "项目母版",
  collection: "资产包",
  character: "角色",
  scene: "场景",
  job: "生成任务",
  recipe: "创作配方",
  review: "审片记录",
};

const PROJECT_MEDIUMS: { value: ProjectMedium; label: string }[] = [
  { value: "image", label: "图片创作" },
  { value: "series", label: "图生视频" },
  { value: "comic_drama", label: "漫剧资产" },
  { value: "game", label: "游戏资产" },
  { value: "freeform", label: "综合项目" },
];

const ASSET_SECONDARY_CATEGORIES: Record<AssetType, string[]> = {
  character: ["角色主参考", "全身设定", "表情与细节", "角色关系"],
  reference_image: ["脸部参考", "身材比例", "真人质感", "灵感参考"],
  scene: ["现实场景", "幻想世界", "室内空间", "氛围背景"],
  wardrobe: ["日常服装", "礼服与正装", "古风造型", "配饰与鞋履"],
  pose: ["半身姿势", "全身姿势", "互动动作", "镜头表演"],
  prop: ["人物道具", "环境道具", "特效元素", "品牌物件"],
  style: ["摄影质感", "插画与漫画", "平面设计", "色彩材质"],
  camera: ["人像构图", "全身构图", "电影镜头", "运动镜头"],
  prompt_pattern: ["人物塑造", "场景构造", "画面质感", "修订指令"],
  image: ["候选成图", "已确认版本", "项目母版", "视频起始帧"],
  video: ["镜头测试", "已确认镜头", "成片片段", "动作参考"],
  audio: ["角色声音", "环境音", "配乐", "对白"],
  game_export: ["角色资源", "场景资源", "动画资源", "交付包"],
};

const CHARACTER_GROUP_LABELS: Record<CharacterGroup, string> = {
  lead: "主角", supporting: "配角", ensemble: "群像", guest: "临时角色",
};
const CHARACTER_LIFECYCLE_LABELS = {
  draft: "设定中", confirmed: "已锁定", archived: "已归档",
} as const;

const assetClass = (type: AssetType) => `asset-card asset-${type}`;
const mergeText = (current: string, incoming: string) =>
  [current.trim(), incoming.trim()]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join("；");

export const assetCollectionRole = (assetId: string, projectMasterAssets: Asset[]) =>
  projectMasterAssets.some((asset) => asset.id === assetId) ? "项目母版" : "素材";

function AssetVisual({ asset }: { asset: Asset }) {
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    if (asset.mediaType.startsWith("image/"))
      window.studio.assets
        .preview(asset.id)
        .then(setPreview)
        .catch(() => undefined);
  }, [asset.id, asset.mediaType]);
  return (
    <div className="asset-visual">
      {preview ? (
        <img src={preview} alt={`${asset.name} 预览`} />
      ) : (
        <span>{ASSET_TYPE_LABELS[asset.type]}</span>
      )}
      <span className="asset-type-tag">{ASSET_TYPE_LABELS[asset.type]}</span>
    </div>
  );
}

function CharacterProfileVisual({ profile }: { profile: CharacterProfile }) {
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    let active = true;
    if (!profile.masterAssetId) {
      setPreview(undefined);
      return;
    }
    const request = window.studio.assets.preview?.(profile.masterAssetId);
    if (!request || typeof request.then !== "function") return;
    request
      .then((source) => { if (active) setPreview(source); })
      .catch(() => { if (active) setPreview(undefined); });
    return () => { active = false; };
  }, [profile.masterAssetId]);
  return <span className="character-profile-visual">
    {preview ? <img src={preview} alt={`${profile.name}主参考图`} /> : <span className="character-profile-monogram" aria-hidden="true">{profile.name.trim().slice(0, 1) || "角"}</span>}
    <small>{profile.masterAssetId ? "主参考" : "待绑定主参考"}</small>
  </span>;
}

function AssetRightsEditor({ asset, onSaved }: { asset: Asset; onSaved: () => Promise<void> }) {
  const [status, setStatus] = useState<RightsStatus>(asset.rightsStatus);
  const [reason, setReason] = useState(typeof asset.metadata.rightsReviewNote === "string" ? asset.metadata.rightsReviewNote : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return <div className="asset-rights-editor">
    <label>素材使用权状态<select value={status} onChange={(event) => setStatus(event.target.value as RightsStatus)}>
      <option value="unknown">待核实</option><option value="authorized">已获授权</option>
      <option value="original" disabled={asset.metadata.provenance === "ai_generated"}>原创素材</option><option value="restricted">受限</option>
    </select></label>
    <label>依据或复核备注<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例如：本人拍摄；已获原作者商业使用许可" /></label>
    <button type="button" disabled={saving || (status === asset.rightsStatus && reason === (asset.metadata.rightsReviewNote ?? ""))}
      onClick={() => { setSaving(true); setError(""); void (async () => {
        try {
          await window.studio.assets.updateRights(asset.id, status, reason);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "权利复核失败。");
          return;
        }
        try {
          await onSaved();
        } catch {
          setError("使用权已保存，但页面刷新失败；请重新打开素材库核对最新状态。");
        }
      })().finally(() => setSaving(false)); }}>保存权利复核</button>
    {error && <span role="alert">{error}</span>}
  </div>;
}

const EMPTY_CARD: CreativeCard = {
  projectId: undefined,
  intent: "真人感角色场景创作",
  subject: "",
  identityAnchor: "",
  bodyAndWardrobe: "",
  expressionAndPose: "",
  scene: "",
  lighting: "",
  camera: "",
  style: "",
  avoid: "卡通感、塑料皮肤、文字、水印、肢体畸形",
  aspectRatio: "9:16",
  referenceAssetIds: [],
};

const providerLabel = (providerId?: ProviderId) =>
  providerId === "flux" ? "FLUX" : providerId === "fal" ? "fal" : providerId === "deepseek" ? "DeepSeek" : providerId === "gemini" ? "Gemini" : providerId === "openai" ? "OpenAI" : "当前绘图模型";

const taskStatusLabel = (status: CreativeTask["status"]) =>
  status === "review" ? "待审片" : status === "completed" ? "已完成" : status === "producing" ? "生成中" : status === "blocked" ? "生成阻塞" : "准备中";

const normalizeCreativeCard = (card: CreativeCard): CreativeCard => {
  const references = normalizeReferenceBindings(card.referenceAssetIds, card.referenceBindings);
  return {
    ...card,
    aspectRatio: normalizeCreativeAspectRatio(card.aspectRatio),
    ...references,
  };
};

const resolveCreationKind = (card: CreativeCard): CreationLaunchKind => {
  if (card.deliveryMode === "story_scene") return "scene";
  if (card.deliveryMode === "series_pack") return "series";
  if (card.deliveryMode === "character_sheet" || card.appearanceProfile) return "character";
  return "image";
};

/**
 * 角色设定板不是一张普通肖像图：它把同一角色的身份、结构、表情、服装和姿态
 * 压缩成一份可复用的生产基线。真正的角色 ID 会在创建任务时写入
 * characterProfileId，参考图只作为证据，不会被当成新角色。
 */
const CHARACTER_SHEET_TEMPLATE: CreativeCard = {
  projectId: undefined,
  intent: "基于已锁定角色 ID 生成高精度角色设定板（Character Sheet），不生成新角色，不改变角色结构",
  subject: "锁定当前角色档案中的脸部、发型、年龄感、性别呈现、种族／物种与身体比例；所有画面必须是同一角色",
  identityAnchor: "角色 ID 锁定；脸型、五官比例、虹膜、发型、发色、肤色、身高比例和服装身份保持一致；正面、3/4、侧面、背面均不可漂移",
  bodyAndWardrobe: "主身份展示：正面、3/4、侧面、背面标准站姿，带比例线与身高刻度、无道具；轮廓剪影；服装细节四格：发型、材质、配饰、鞋；所有服装与鞋履保持同一套设计",
  expressionAndPose: "表情系统 8 格：平静、好奇、紧张、惊讶、害怕、悲伤、坚定、放松；微表情 5 格：眼部紧张、微笑、嘴部用力、微恐惧、呼吸控制；姿态变化：放松、紧张、自信；另有一张胸部以上强情绪特写和手部动作组：放松、紧张、指向、抓握、面部动作",
  scene: "4:3 横版角色设定板；纯白或米白极简背景；专业技术排版；顶部信息含名字、角色身份、年龄、3—5 个性格关键词和一句核心主题；配色系统 6—8 个无文字色块；清晰可读英文标签；主身份展示区域最大，模块间留白有秩序",
  lighting: "均匀、克制的影视级棚拍光影；皮肤、布料、金属、鞋材具有真实材质细节；多角度与表情区域保持统一光色和阴影逻辑",
  camera: "角色设定板总览视角；主身份展示为完整全身标准站姿，多角度同尺度对照；头部结构含 3/4、侧面、仰视、俯视；特写为胸部以上；不使用道具抢主体",
  style: "写实 3D／风格化 3D／动漫／半写实／IP 设计由当前角色设定选择；高级、干净、可交付的角色开发板视觉；U1 技术排版，标签清晰，适合后续漫剧、游戏和连续出图",
  mustKeep: "只允许当前角色 ID；脸、发型、肤色、体型比例、服装、配饰和鞋保持一致；主身份展示最大；不允许风格漂移；所有画面都服务于角色资产管理",
  avoid: "新建或替换角色、脸部漂移、年龄变化、性别呈现变化、身体比例变化、服装颜色或配饰变化、不同角色混入、道具喧宾夺主、不可读文字、乱码、logo、水印、低清晰度、塑料皮肤、材质失真、透视畸形、重复模块、裁切掉主身份展示",
  aspectRatio: "4:3",
  referenceAssetIds: [],
};
const EMPTY_SHOT: ShotContract = {
  deliveryType: "image",
  subjectAnchor: "",
  referenceAssetIds: [],
  startFrame: "",
  action: "",
  cameraMotion: "85mm 平视中景",
  durationSeconds: 4,
  frameRate: 24,
  keep: ["脸部身份与发型连续", "服装与场景连续"],
  avoid: ["多余人物", "手指变形"],
  output: { aspectRatio: "9:16", resolution: "1080p" },
};

export default function App() {
  const [connected, setConnected] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const selectedProjectIdRef = useRef(selectedProjectId);
  selectedProjectIdRef.current = selectedProjectId;
  const [selectedType, setSelectedType] = useState<AssetType | "all">("all");
  const selectedTypeRef = useRef(selectedType);
  selectedTypeRef.current = selectedType;
  const refreshRequestRef = useRef(0);
  const [assetType, setAssetType] = useState<AssetType>("reference_image");
  const [assetSecondaryCategory, setAssetSecondaryCategory] = useState("脸部参考");
  const [selectedSecondaryCategory, setSelectedSecondaryCategory] = useState("all");
  const [rightsStatus, setRightsStatus] = useState<RightsStatus>("unknown");
  const [rightsReason, setRightsReason] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectMedium, setNewProjectMedium] =
    useState<ProjectMedium>("freeform");
  const [notice, setNotice] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isImportingCharacterPack, setIsImportingCharacterPack] = useState(false);
  const [screen, setScreen] = useState<
    | "start"
    | "launch"
    | "assets"
    | "characters"
    | "scenes"
    | "collections"
    | "workspace"
    | "creation"
    | "recipes"
    | "production"
    | "review"
    | "shot"
    | "learning"
    | "paradigms"
    | "jobs"
    | "settings"
  >("workspace");
  const [activeDomain, setActiveDomain] = useState<"creation" | "assets" | "production" | "templates">("creation");
  const [projectWorkspace, setProjectWorkspace] = useState<ProjectWorkspace>();
  const [projectBrief, setProjectBrief] = useState<ProjectBrief>({
    goal: "",
    audience: "",
    visualWorld: "",
    delivery: "",
    acceptance: "",
  });
  const [card, setCard] = useState<CreativeCard>(EMPTY_CARD);
  const [recipes, setRecipes] = useState<CreativeRecipe[]>([]);
  const [recipeReviewSelections, setRecipeReviewSelections] = useState<Record<string, string>>({});
  const [recipeName, setRecipeName] = useState("我的创作配方");
  const [recipePurpose, setRecipePurpose] = useState("角色场景连续创作");
  const [recipeApplicability, setRecipeApplicability] = useState("同一角色身份与同一画面方向，只替换场景、动作或镜头");
  const [recipeInvalidation, setRecipeInvalidation] = useState("更换角色身份\n切换到不相容的画面风格\n参考图审片或使用权状态失效");
  const [characterName, setCharacterName] = useState("");
  const [characterGroup, setCharacterGroup] = useState<CharacterGroup>("lead");
  const [characterDraftCard, setCharacterDraftCard] = useState<CreativeCard>(() => ({
    ...EMPTY_CARD,
    intent: "",
    aspectRatio: "2:3",
  }));
  const [isCreatingCharacter, setIsCreatingCharacter] = useState(false);
  const [characters, setCharacters] = useState<CharacterProfile[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [selectedCharacterDetail, setSelectedCharacterDetail] = useState<CharacterDetail>();
  const [selectedCharacterWorkspace, setSelectedCharacterWorkspace] = useState<CharacterWorkspaceSnapshot>();
  const [characterCenterView, setCharacterCenterView] = useState<"workspace" | "details">("workspace");
  const [activeCharacterContext, setActiveCharacterContext] = useState<{
    profileId: string;
    versionId?: string;
    stateId?: string;
  }>();
  const [scenes, setScenes] = useState<SceneProfile[]>([]);
  const [reviewWorkspace, setReviewWorkspace] = useState<ReviewWorkspaceSnapshot>();
  const [selectedSceneId, setSelectedSceneId] = useState("");
  const [selectedSceneWorkspace, setSelectedSceneWorkspace] = useState<SceneWorkspaceSnapshot>();
  const [activeSceneContext, setActiveSceneContext] = useState<{ profileId: string; versionId?: string; stateId?: string }>();
  const [isCreatingScene, setIsCreatingScene] = useState(false);
  const [sceneDraft, setSceneDraft] = useState({
    name: "", kind: "interior" as SceneKind, anchor: "", layout: "", materials: "", colorSystem: "",
    requiredElements: "", forbiddenChanges: "",
  });
  const [masterPickerCharacterId, setMasterPickerCharacterId] = useState("");
  const [masterCandidateAssets, setMasterCandidateAssets] = useState<Asset[]>([]);
  const [masterChoiceId, setMasterChoiceId] = useState("");
  const [masterPickerLoading, setMasterPickerLoading] = useState(false);
  const [masterPickerError, setMasterPickerError] = useState("");
  const [masterSaving, setMasterSaving] = useState(false);
  const masterPickerRequestRef = useRef(0);
  const characterRelationsRequestRef = useRef(0);
  const collectionDetailRequestRef = useRef(0);
  const creativeTaskOpenRequestRef = useRef(0);
  const selectedCharacterIdRef = useRef("");
  const selectCharacter = (id: string) => {
    if (selectedCharacterIdRef.current === id) return;
    selectedCharacterIdRef.current = id;
    setSelectedCharacterDetail(undefined);
    setSelectedCharacterWorkspace(undefined);
    setSelectedCharacterId(id);
    setCharacterCenterView("workspace");
  };
  const [characterVariantSelections, setCharacterVariantSelections] = useState<Record<string, CharacterVariantSelection>>({});
  const [guideCharacterDetail, setGuideCharacterDetail] = useState<CharacterDetail>();
  const [guidePurpose, setGuidePurpose] = useState<CharacterUseCase>("portrait");
  const [collections, setCollections] = useState<AssetCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [selectedCollection, setSelectedCollection] = useState<AssetCollectionDetail>();
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionKind, setNewCollectionKind] = useState<AssetCollectionKind>("character");
  const [newCollectionDescription, setNewCollectionDescription] = useState("");
  const [newCollectionCharacterId, setNewCollectionCharacterId] = useState("");
  const [newCollectionParentId, setNewCollectionParentId] = useState("");
  const [selectedCollectionModuleKey, setSelectedCollectionModuleKey] = useState("");
  const [selectedCollectionMemberNotes, setSelectedCollectionMemberNotes] = useState("");
  const [editingCollection, setEditingCollection] = useState(false);
  const [collectionEditName, setCollectionEditName] = useState("");
  const [collectionEditDescription, setCollectionEditDescription] = useState("");
  const [collectionAssetFilters, setCollectionAssetFilters] = useState<CollectionAssetFilters>({ query: "", moduleKey: "all", confirmation: "all", rights: "all" });
  const [creativeTasks, setCreativeTasks] = useState<CreativeTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState("");
  const [guideMode, setGuideMode] = useState<"new" | "saved" | "reference">("new");
  const [creationLaunchKind, setCreationLaunchKind] = useState<CreationLaunchKind>("character");
  const [guidePresetId, setGuidePresetId] = useState<CreationPresetId>("oriental_moon");
  const [activeCreationPresetId, setActiveCreationPresetId] = useState<CreationPresetId>();
  const [activeCreationReferencePreview, setActiveCreationReferencePreview] = useState<string>();
  const [guidedDraftTaskId, setGuidedDraftTaskId] = useState("");
  const [guideDirection, setGuideDirection] = useState<CreationDirection>("portrait");
  const [guideCharacterId, setGuideCharacterId] = useState("");
  const [guideSubjectChoice, setGuideSubjectChoice] = useState<GuidedSubject>("adult_woman");
  const [guideSceneChoice, setGuideSceneChoice] = useState<GuidedScene>("ancient_east");
  const [guideMoodChoice, setGuideMoodChoice] = useState<GuidedMood>("cool");
  const [guideStoryPlan, setGuideStoryPlan] = useState<GuidedStoryPlan>(() => ({ ...DEFAULT_GUIDED_STORY_PLAN }));
  const [guideShotChoice, setGuideShotChoice] = useState<GuidedShot>("half_body");
  const [guideVisualStyle, setGuideVisualStyle] = useState<GuidedVisualStyle>("photoreal");
  const [guideAspectRatio, setGuideAspectRatio] = useState<CreativeAspectRatio>("2:3");
  const [guideAppearance, setGuideAppearance] = useState<GuidedAppearance>(DEFAULT_GUIDED_APPEARANCE);
  const [guideSceneProfileId, setGuideSceneProfileId] = useState("");
  const [guideConstraints, setGuideConstraints] = useState<GuidedConstraint[]>(["identity", "skin", "no_text"]);
  const [guideTrackerIds, setGuideTrackerIds] = useState<CharacterTrackerPresetId[]>(DEFAULT_CHARACTER_TRACKER_IDS);
  const [guideCustomTrackers, setGuideCustomTrackers] = useState<CharacterStateTracker[]>([]);
  const [restoredCharacterDraftAt, setRestoredCharacterDraftAt] = useState("");
  const [guideSubject, setGuideSubject] = useState("");
  const [guideScene, setGuideScene] = useState("");
  const [guideReferenceAssetId, setGuideReferenceAssetId] = useState("");
  const [guideCollectionIds, setGuideCollectionIds] = useState<string[]>([]);
  const [showGuideOptions, setShowGuideOptions] = useState(false);
  const [showAdvancedCreation, setShowAdvancedCreation] = useState(false);
  const [showPromptDetails, setShowPromptDetails] = useState(false);
  const [showReuseTools, setShowReuseTools] = useState(false);
  const [isPreparingCreation, setIsPreparingCreation] = useState(false);
  const [creationCandidateCount, setCreationCandidateCount] = useState<1 | 2 | 4>(2);
  const [seriesCandidatePlan, setSeriesCandidatePlan] = useState<CandidateVariation[]>(createDefaultSeriesPlan);
  const [isGeneratingCandidates, setIsGeneratingCandidates] = useState(false);
  const [selectedCreationCandidateId, setSelectedCreationCandidateId] = useState("");
  const [selectedLocalDirectionId, setSelectedLocalDirectionId] = useState("");
  const [confirmedLocalDirectionId, setConfirmedLocalDirectionId] = useState("");
  const [localRefinementApplied, setLocalRefinementApplied] = useState(false);
  const [creationRefinementId, setCreationRefinementId] = useState<CreationRefinementId>("expression");
  const [creationStudioStage, setCreationStudioStage] = useState<CreationStudioStage>("plan");
  const [shot, setShot] = useState<ShotContract>(EMPTY_SHOT);
  const [promptBuild, setPromptBuild] = useState<PromptBuild>();
  const [shotBuild, setShotBuild] = useState("");
  const [shotName, setShotName] = useState("镜头 01");
  const [shotPlans, setShotPlans] = useState<ShotPlan[]>([]);
  const [shotPurpose, setShotPurpose] = useState<ShotPlan["purpose"]>("image");
  const [shotContinuityNotes, setShotContinuityNotes] = useState("");
  const [shotCharacterId, setShotCharacterId] = useState("");
  const [shotCharacterVersionId, setShotCharacterVersionId] = useState("");
  const [shotCharacterStateId, setShotCharacterStateId] = useState("");
  const [shotCharacterWorkspace, setShotCharacterWorkspace] = useState<CharacterWorkspaceSnapshot>();
  const [shotSceneId, setShotSceneId] = useState("");
  const [shotSceneVersionId, setShotSceneVersionId] = useState("");
  const [shotSceneStateId, setShotSceneStateId] = useState("");
  const [shotSceneWorkspace, setShotSceneWorkspace] = useState<SceneWorkspaceSnapshot>();
  const [learningInput, setLearningInput] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [promptSources, setPromptSources] = useState<PromptSource[]>([]);
  const [patterns, setPatterns] = useState<LearningPattern[]>([]);
  const [promptEntries, setPromptEntries] = useState<PromptEntry[]>([]);
  const [promptQuery, setPromptQuery] = useState("");
  const [promptCategory, setPromptCategory] = useState("");
  const [promptCategories, setPromptCategories] = useState<string[]>([]);
  const [promptEntryCount, setPromptEntryCount] = useState(0);
  const [paradigms, setParadigms] = useState<VisualParadigm[]>([]);
  const [selectedParadigmIds, setSelectedParadigmIds] = useState<string[]>([]);
  const [paradigmComposition, setParadigmComposition] =
    useState<ParadigmComposition>();
  const [customParadigm, setCustomParadigm] = useState<{
    name: string;
    role: VisualParadigmRole;
    description: string;
    promptModule: string;
  }>({ name: "", role: "世界观与气质", description: "", promptModule: "" });
  const [qualityTier, setQualityTier] =
    useState<GenerationQualityTier>("premium");
  const [translation, setTranslation] = useState<PromptTranslation>();
  const [provider, setProvider] = useState<ProviderStatus>();
  const [providerVerifications, setProviderVerifications] = useState<Partial<Record<ProviderId, ProviderVerificationResult>>>({});
  const [verifyingProviderId, setVerifyingProviderId] = useState<ProviderId>();
  const [providerKeys, setProviderKeys] = useState<Record<ProviderId, string>>({
    openai: "",
    flux: "",
    fal: "",
    deepseek: "",
    gemini: "",
  });
  const [budget, setBudget] = useState<BudgetStatus>({ plannedSpendUsd: 0 });
  const [budgetInput, setBudgetInput] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [compareAssetIds, setCompareAssetIds] = useState<string[]>([]);
  const [lineage, setLineage] = useState<AssetLineageItem[]>([]);
  const [assetUsage, setAssetUsage] = useState<AssetUsageReference[]>([]);
  const [analysis, setAnalysis] = useState<ImageUnderstandingReport>();
  const [reversePrompt, setReversePrompt] = useState<ReversePrompt>();
  const [refinementInstruction, setRefinementInstruction] = useState(
    "保持人物身份、构图与服装不变，只优化真实皮肤纹理、头发细节、布料材质、自然光影与背景代入感；不要文字或水印。",
  );
  const [jobs, setJobs] = useState<StudioJob[]>([]);
  const [retryingJobIds, setRetryingJobIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [batches, setBatches] = useState<GenerationBatch[]>([]);
  const [batchName, setBatchName] = useState("角色场景候选组");
  const [batchVariables, setBatchVariables] = useState(
    "夜晚城市街头\n清晨酒店走廊\n雨后玻璃温室",
  );

  const refresh = useCallback(async () => {
    const projectId = selectedProjectId;
    const type = selectedType;
    const requestId = ++refreshRequestRef.current;
    const [nextAssets, nextProjects] = await Promise.all([
      window.studio.assets.list({
        projectId: projectId || undefined,
        type: type === "all" ? undefined : type,
      }),
      window.studio.projects.list(),
    ]);
    if (requestId !== refreshRequestRef.current || selectedProjectIdRef.current !== projectId || selectedTypeRef.current !== type) return;
    setAssets(nextAssets);
    setProjects(nextProjects);
  }, [selectedProjectId, selectedType]);
  const refreshCharacterRelations = useCallback(async () => {
    const projectId = selectedProjectId;
    const requestId = ++characterRelationsRequestRef.current;
    const characterId = selectedCharacterIdRef.current;
    const collectionId = selectedCollectionId;
    const [profiles, detail, characterWorkspace, collectionDetail] = await Promise.all([
      window.studio.characters.list(projectId || undefined),
      characterId ? window.studio.characters.detail(characterId) : Promise.resolve(undefined),
      characterId ? window.studio.characterWorkspace.get(characterId).catch(() => undefined) : Promise.resolve(undefined),
      collectionId ? window.studio.collections.detail(collectionId) : Promise.resolve(undefined),
    ]);
    if (requestId !== characterRelationsRequestRef.current || selectedProjectIdRef.current !== projectId) return;
    setCharacters(profiles);
    if (characterId && selectedCharacterIdRef.current === characterId) {
      setSelectedCharacterDetail(detail);
      setSelectedCharacterWorkspace(characterWorkspace);
    }
    if (collectionId) setSelectedCollection((current) => current?.id === collectionId ? collectionDetail : current);
  }, [selectedCollectionId, selectedProjectId]);

  useEffect(() => {
    window.studio
      .getHealth()
      .then(() => setConnected(true))
      .catch(() => setNotice("本地服务未能连接，请重新启动应用。"));
  }, []);
  useEffect(() => {
    window.studio.paradigms
      .list()
      .then(setParadigms)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    window.studio.paradigms
      .compose(selectedParadigmIds)
      .then(setParadigmComposition)
      .catch(() => setParadigmComposition(undefined));
  }, [selectedParadigmIds]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    setAssetSecondaryCategory(ASSET_SECONDARY_CATEGORIES[assetType][0]);
  }, [assetType]);
  useEffect(() => {
    setSelectedSecondaryCategory("all");
  }, [selectedType]);
  useEffect(() => {
    window.studio.learning
      .list()
      .then(setPatterns)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    window.studio.learning
      .listSources()
      .then(setPromptSources)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    window.studio.learning
      .entryCategories()
      .then(setPromptCategories)
      .catch(() => undefined);
    window.studio.learning
      .entryCount()
      .then(setPromptEntryCount)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    window.studio.settings
      .providerStatus()
      .then(setProvider)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    let current = true;
    const previewAssetId = card.referenceAssetIds[0]
      ?? selectedCharacterWorkspace?.character.masterAssetId;
    if (!previewAssetId) {
      setActiveCreationReferencePreview(undefined);
      return () => { current = false; };
    }
    const request = window.studio.assets.preview?.(previewAssetId);
    if (!request || typeof request.then !== "function") {
      setActiveCreationReferencePreview(undefined);
      return () => { current = false; };
    }
    request
      .then((source) => { if (current) setActiveCreationReferencePreview(source); })
      .catch(() => { if (current) setActiveCreationReferencePreview(undefined); });
    return () => { current = false; };
  }, [card.referenceAssetIds, selectedCharacterWorkspace?.character.masterAssetId]);
  useEffect(() => {
    window.studio.settings
      .budgetStatus()
      .then((value) => {
        setBudget(value);
        setBudgetInput(
          value.monthlyBudgetUsd ? String(value.monthlyBudgetUsd) : "",
        );
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (selectedProjectId)
      window.studio.shots
        .list(selectedProjectId)
        .then(setShotPlans)
        .catch(() => setShotPlans([]));
    else setShotPlans([]);
  }, [selectedProjectId]);
  useEffect(() => {
    if (!shotCharacterId) {
      setShotCharacterWorkspace(undefined);
      setShotCharacterVersionId("");
      setShotCharacterStateId("");
      return;
    }
    let current = true;
    window.studio.characterWorkspace.get(shotCharacterId).then((workspace) => {
      if (!current) return;
      setShotCharacterWorkspace(workspace);
      setShotCharacterVersionId((value) => value || workspace.activeVersion?.id || "");
      setShotCharacterStateId((value) => value || workspace.activeState?.id || "");
    }).catch(() => { if (current) setShotCharacterWorkspace(undefined); });
    return () => { current = false; };
  }, [shotCharacterId]);
  useEffect(() => {
    if (!shotSceneId) {
      setShotSceneWorkspace(undefined);
      setShotSceneVersionId("");
      setShotSceneStateId("");
      return;
    }
    let current = true;
    window.studio.sceneWorkspace.get(shotSceneId).then((workspace) => {
      if (!current) return;
      setShotSceneWorkspace(workspace);
      setShotSceneVersionId((value) => value || workspace.activeVersion?.id || "");
      setShotSceneStateId((value) => value || workspace.activeState?.id || "");
    }).catch(() => { if (current) setShotSceneWorkspace(undefined); });
    return () => { current = false; };
  }, [shotSceneId]);
  useEffect(() => {
    if (!selectedProjectId) {
      setProjectWorkspace(undefined);
      return;
    }
    window.studio.projects
      .workspace(selectedProjectId)
      .then((workspace) => {
        setProjectWorkspace(workspace);
        setProjectBrief(
          workspace.project.brief ?? {
            goal: "",
            audience: "",
            visualWorld: "",
            delivery: "",
            acceptance: "",
          },
        );
      })
      .catch(() => setProjectWorkspace(undefined));
  }, [selectedProjectId, assets]);
  useEffect(() => {
    let current = true;
    window.studio.characters
      .list(selectedProjectId || undefined)
      .then((profiles) => { if (current) setCharacters(profiles); })
      .catch(() => { if (current) setCharacters([]); });
    return () => { current = false; };
  }, [selectedProjectId]);
  useEffect(() => {
    if (screen !== "characters" || isCreatingCharacter || selectedCharacterId || characters.length === 0) return;
    const first = selectedProjectId
      ? characters.find((profile) => profile.projectId === selectedProjectId)
      : characters.find((profile) => !profile.projectId) ?? characters[0];
    if (first) selectCharacter(first.id);
  }, [characters, isCreatingCharacter, screen, selectedCharacterId, selectedProjectId]);
  useEffect(() => {
    let current = true;
    window.studio.sceneWorkspace.list(selectedProjectId || undefined)
      .then((profiles) => { if (current) setScenes(profiles); })
      .catch(() => { if (current) setScenes([]); });
    return () => { current = false; };
  }, [selectedProjectId]);
  useEffect(() => {
    if (!selectedSceneId) { setSelectedSceneWorkspace(undefined); return; }
    let current = true;
    window.studio.sceneWorkspace.get(selectedSceneId)
      .then((workspace) => { if (current && workspace.scene.id === selectedSceneId) setSelectedSceneWorkspace(workspace); })
      .catch(() => { if (current) setSelectedSceneWorkspace(undefined); });
    return () => { current = false; };
  }, [selectedSceneId]);
  useEffect(() => {
    selectCharacter(""); setGuideCharacterId("");
    setSelectedSceneId(""); setSelectedSceneWorkspace(undefined);
    setActiveCharacterContext(undefined); setActiveSceneContext(undefined);
    setShotCharacterId(""); setShotCharacterWorkspace(undefined);
    setShotSceneId(""); setShotSceneWorkspace(undefined);
    setShotCharacterVersionId(""); setShotCharacterStateId("");
    setShotSceneVersionId(""); setShotSceneStateId("");
    setSelectedAssetId(""); setSelectedCollectionId(""); setSelectedCollection(undefined);
    setGuideSceneProfileId(""); setSelectedCreationCandidateId("");
    setReviewWorkspace(undefined); setRecipeReviewSelections({});
    ++masterPickerRequestRef.current;
    ++characterRelationsRequestRef.current;
    setMasterPickerCharacterId(""); setMasterCandidateAssets([]); setMasterChoiceId("");
  }, [selectedProjectId]);
  useEffect(() => {
    if (!selectedCharacterId) { setSelectedCharacterDetail(undefined); setSelectedCharacterWorkspace(undefined); return; }
    let current = true;
    Promise.all([
      window.studio.characters.detail(selectedCharacterId),
      window.studio.characterWorkspace.get(selectedCharacterId).catch(() => undefined),
    ])
      .then(([detail, workspace]) => {
        if (current && selectedCharacterIdRef.current === selectedCharacterId) {
          setSelectedCharacterDetail(detail);
          setSelectedCharacterWorkspace(workspace);
        }
      })
      .catch(() => {
        if (current && selectedCharacterIdRef.current === selectedCharacterId) {
          setSelectedCharacterDetail(undefined);
          setSelectedCharacterWorkspace(undefined);
        }
      });
    return () => { current = false; };
  }, [selectedCharacterId]);
  useEffect(() => {
    if (guideMode !== "saved" || !guideCharacterId) { setGuideCharacterDetail(undefined); return; }
    let current = true;
    setGuideCharacterDetail(undefined);
    window.studio.characters.detail(guideCharacterId)
      .then((detail) => { if (current && detail?.id === guideCharacterId) setGuideCharacterDetail(detail); })
      .catch(() => { if (current) setGuideCharacterDetail(undefined); });
    return () => { current = false; };
  }, [guideMode, guideCharacterId]);
  useEffect(() => {
    if (screen !== "start" || creationLaunchKind !== "character") return;
    saveCharacterCreationDraft({
      sourceMode: guideMode,
      presetId: guidePresetId,
      direction: guideDirection,
      characterId: guideCharacterId,
      referenceAssetId: guideReferenceAssetId,
      sceneProfileId: guideSceneProfileId,
      subject: guideSubjectChoice,
      customSubject: guideSubject,
      appearance: guideAppearance,
      scene: guideSceneChoice,
      customScene: guideScene,
      mood: guideMoodChoice,
      shot: guideShotChoice,
      visualStyle: guideVisualStyle,
      aspectRatio: guideAspectRatio,
      constraints: guideConstraints,
      trackerIds: guideTrackerIds,
      customTrackers: guideCustomTrackers,
      purpose: guidePurpose,
      qualityTier,
    });
  }, [
    creationLaunchKind,
    guideAppearance,
    guideAspectRatio,
    guideCharacterId,
    guideConstraints,
    guideCustomTrackers,
    guideDirection,
    guideMode,
    guideMoodChoice,
    guidePresetId,
    guidePurpose,
    guideReferenceAssetId,
    guideScene,
    guideSceneChoice,
    guideSceneProfileId,
    guideShotChoice,
    guideSubject,
    guideSubjectChoice,
    guideTrackerIds,
    guideVisualStyle,
    qualityTier,
    screen,
  ]);
  useEffect(() => {
    let current = true;
    window.studio.collections
      .list(selectedProjectId || undefined)
      .then((value) => { if (current) setCollections(value); })
      .catch(() => { if (current) setCollections([]); });
    return () => { current = false; };
  }, [selectedProjectId, characters]);
  useEffect(() => {
    const collectionId = selectedCollectionId;
    const requestId = ++collectionDetailRequestRef.current;
    if (!collectionId) { setSelectedCollection(undefined); return; }
    setSelectedCollection(undefined);
    window.studio.collections.detail(collectionId)
      .then((detail) => {
        if (requestId === collectionDetailRequestRef.current) setSelectedCollection(detail);
      })
      .catch(() => {
        if (requestId === collectionDetailRequestRef.current) setSelectedCollection(undefined);
      });
  }, [selectedCollectionId, collections]);
  useEffect(() => {
    if (!selectedCollection) {
      setSelectedCollectionModuleKey("");
      return;
    }
    const modules = getAssetCollectionBlueprint(selectedCollection.kind).modules;
    setSelectedCollectionModuleKey((current) => current && modules.some((module) => module.key === current) ? current : (modules.find((module) => module.required)?.key ?? modules[0]?.key ?? ""));
    setCollectionEditName(selectedCollection.name);
    setCollectionEditDescription(selectedCollection.description);
  }, [selectedCollection]);
  useEffect(() => {
    setCollectionAssetFilters({ query: "", moduleKey: "all", confirmation: "all", rights: "all" });
  }, [selectedCollectionId]);
  useEffect(() => {
    window.studio.tasks
      .list(selectedProjectId || undefined)
      .then(setCreativeTasks)
      .catch(() => setCreativeTasks([]));
  }, [selectedProjectId]);
  useEffect(() => {
    window.studio.batches
      .list(selectedProjectId || undefined)
      .then(setBatches)
      .catch(() => setBatches([]));
  }, [selectedProjectId]);
  useEffect(() => {
    window.studio.recipes
      .list(selectedProjectId || undefined)
      .then(setRecipes)
      .catch(() => setRecipes([]));
  }, [selectedProjectId]);
  useEffect(() => {
    if (screen !== "review" && screen !== "recipes") return;
    if (!selectedProjectId) {
      setReviewWorkspace(undefined);
      return;
    }
    let current = true;
    window.studio.imageReviews.workspace(selectedProjectId)
      .then((workspace) => { if (current) setReviewWorkspace(workspace); })
      .catch((error) => {
        if (current) {
          setReviewWorkspace(undefined);
          setNotice(error instanceof Error ? error.message : "读取审片工作台失败。");
        }
      });
    return () => { current = false; };
  }, [screen, selectedProjectId]);
  useEffect(() => {
    if (!selectedAssetId) {
      setLineage([]);
      setAssetUsage([]);
      return;
    }
    setLineage([]);
    setAssetUsage([]);
    let current = true;
    Promise.all([
      window.studio.assets.lineage(selectedAssetId).catch(() => []),
      typeof window.studio.assets.usage === "function"
        ? window.studio.assets.usage(selectedAssetId).catch(() => [])
        : Promise.resolve([] as AssetUsageReference[]),
    ]).then(([nextLineage, nextUsage]) => {
      if (!current) return;
      setLineage(nextLineage);
      setAssetUsage(nextUsage);
    });
    return () => { current = false; };
  }, [selectedAssetId, assets]);
  const refreshJobs = useCallback(async () => {
    const currentJobs = await window.studio.generation.jobs(
      selectedProjectId || undefined,
    );
    const updatedJobs = await Promise.all(
      currentJobs.map(async (job) => {
        if (job.kind === "image_generation" && ["in_progress", "unknown"].includes(job.status) && typeof job.result?.remoteTask === "object" && window.studio.generation.pollImage) {
          try { return await window.studio.generation.pollImage(job.id); } catch { return job; }
        }
        if (job.kind !== "image_to_video" || !["in_progress", "unknown"].includes(job.status) || typeof job.result?.remoteId !== "string")
          return job;
        try {
          return await window.studio.generation.pollVideo(job.id);
        } catch {
          return job;
        }
      }),
    );
    const taskStateUpdates = updatedJobs.flatMap((job) => {
      const taskId = typeof job.request.creativeTaskId === "string" ? job.request.creativeTaskId : undefined;
      if (!taskId) return [];
      const targetStatus = job.status === "failed" || job.status === "unknown"
        ? "blocked" as const
        : job.status === "completed" && typeof job.result?.assetId === "string"
          ? "review" as const
          : undefined;
      const task = creativeTasks.find((item) => item.id === taskId);
      const terminal = task?.status === "completed" || task?.status === "archived";
      return targetStatus && task && task.status !== targetStatus && !terminal ? [{ taskId, targetStatus, task }] : [];
    });
    if (taskStateUpdates.length) {
      const synced = await Promise.all(taskStateUpdates.map(async ({ taskId, targetStatus, task }) => {
        try {
          return await window.studio.tasks.update(taskId, {
            status: targetStatus,
            ...(targetStatus === "review" && typeof updatedJobs.find((job) => job.request.creativeTaskId === taskId)?.result?.assetId === "string"
              ? { resultAssetId: String(updatedJobs.find((job) => job.request.creativeTaskId === taskId)?.result?.assetId) }
              : {}),
          });
        } catch {
          return task;
        }
      }));
      setCreativeTasks((current) => current.map((item) => synced.find((updated) => updated.id === item.id) ?? item));
    }
    setJobs(updatedJobs);
  }, [creativeTasks, selectedProjectId]);
  const retryJob = useCallback(async (job: StudioJob) => {
    const interruptedImage =
      job.kind === "image_generation" &&
      job.status === "queued" &&
      job.error === "应用关闭前任务中断，可由用户确认后重试。";
    if (!["failed", "unknown"].includes(job.status) && !interruptedImage) return;
    if (retryingJobIds.has(job.id)) return;
    setRetryingJobIds((current) => new Set(current).add(job.id));
    try {
      if (job.kind === "image_generation" && typeof job.result?.remoteTask === "object" && window.studio.generation.pollImage) {
        await window.studio.generation.pollImage(job.id);
        setNotice("已继续查询原图片任务，没有重复提交生成请求。");
        await refreshJobs();
        return;
      }
      if (job.kind === "vision_analysis" && typeof job.request.assetId === "string") {
        await window.studio.vision.analyze(job.request.assetId);
      } else if (job.kind === "image_generation" && typeof job.request.prompt === "string") {
        const size = typeof job.request.size === "string" ? job.request.size : "1024x1024";
        const aspectRatio = aspectRatioForImageSize(size as "1024x1024" | "1024x1536" | "1536x1024");
        if (job.request.mode === "refine" && typeof job.request.referenceAssetId === "string") {
          await window.studio.generation.refineImage({ assetId: job.request.referenceAssetId, prompt: job.request.prompt, negative: typeof job.request.negative === "string" ? job.request.negative : undefined, projectId: job.projectId, creativeTaskId: typeof job.request.creativeTaskId === "string" ? job.request.creativeTaskId : undefined, generationSessionId: typeof job.request.generationSessionId === "string" ? job.request.generationSessionId : undefined, retryOfJobId: job.id, aspectRatio });
        } else {
          const retryReferences = normalizeReferenceBindings(
            Array.isArray(job.request.referenceAssetIds) ? job.request.referenceAssetIds : [],
            job.request.referenceBindings,
          );
          await window.studio.generation.image({
            prompt: job.request.prompt,
            negative: typeof job.request.negative === "string" ? job.request.negative : undefined,
            projectId: job.projectId,
            creativeTaskId: typeof job.request.creativeTaskId === "string" ? job.request.creativeTaskId : undefined,
            generationSessionId: typeof job.request.generationSessionId === "string" ? job.request.generationSessionId : undefined,
            retryOfJobId: job.id,
            aspectRatio,
            ...retryReferences,
            qualityTier: job.request.qualityTier === "draft" || job.request.qualityTier === "standard" || job.request.qualityTier === "premium" ? job.request.qualityTier : "standard",
          });
        }
      } else if (job.kind === "image_to_video" && typeof job.request.prompt === "string") {
        const size = job.request.size === "720x1280" ? "9:16" : "16:9";
        const seconds = job.request.seconds === 8 || job.request.seconds === 12 ? job.request.seconds : 4;
        await window.studio.generation.video({ prompt: job.request.prompt, projectId: job.projectId, referenceAssetId: typeof job.request.referenceAssetId === "string" ? job.request.referenceAssetId : undefined, generationSessionId: typeof job.request.generationSessionId === "string" ? job.request.generationSessionId : undefined, aspectRatio: size, seconds });
      } else {
        throw new Error("该失败任务缺少可安全重建的请求记录。");
      }
      setNotice(
        interruptedImage
          ? "已确认重试中断的图片任务；原任务保留，新的任务会记录关联关系。"
          : "已按原请求创建新的重试任务；未知状态任务不会被自动重提。",
      );
      await refreshJobs();
    } catch (error) {
      setNotice(error instanceof Error ? `重试未提交：${error.message}` : "重试未提交，请检查任务记录。");
    } finally {
      setRetryingJobIds((current) => {
        const next = new Set(current);
        next.delete(job.id);
        return next;
      });
    }
  }, [refreshJobs, retryingJobIds]);
  useEffect(() => {
    if (screen !== "jobs" && screen !== "production" && screen !== "review" && screen !== "creation") return;
    void refreshJobs();
    if (screen !== "jobs") return;
    const timer = window.setInterval(() => void refreshJobs(), 8_000);
    return () => window.clearInterval(timer);
  }, [screen, refreshJobs]);
  useEffect(() => {
    const domainForScreen: Partial<Record<typeof screen, typeof activeDomain>> = {
      workspace: "creation", start: "creation", creation: "creation",
      assets: "assets", characters: "assets", scenes: "assets", collections: "assets",
      production: "production", review: "production", shot: "production", jobs: "production",
      recipes: "templates", paradigms: "templates", learning: "templates",
    };
    const domain = domainForScreen[screen];
    if (domain) setActiveDomain(domain);
  }, [screen]);

  const createProject = async () => {
    const name = newProjectName.trim();
    if (!name) {
      setNotice("请先给项目取一个名称。");
      return;
    }
    const project = await window.studio.projects.create(name, newProjectMedium);
    setProjects((current) => [project, ...current]);
    setSelectedProjectId(project.id);
    setNewProjectName("");
    setNotice(`已建立「${project.name}」，现在可把素材纳入项目。`);
  };

  const importAssets = async () => {
    const paths = await window.studio.selectFiles();
    if (!paths.length) return;
    setIsImporting(true);
    setNotice(`正在纳入 ${paths.length} 个文件…`);
    try {
      const results = await Promise.all(
        paths.map((filePath) =>
          window.studio.assets.import({
            filePath,
            type: assetType,
            projectId: selectedProjectId || undefined,
            rightsStatus,
            rightsReason,
            secondaryCategory: assetSecondaryCategory,
          }),
        ),
      );
      const duplicates = results.filter((item: any) => item.duplicateOf).length;
      await refresh();
      setNotice(
        duplicates
          ? `已处理 ${paths.length} 个文件，其中 ${duplicates} 个已在资产库中。`
          : `已纳入 ${paths.length} 个文件，并保留原始来源与管理副本。`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? `导入失败：${error.message}`
          : "导入失败，请检查文件是否可读取。",
      );
    } finally {
      setIsImporting(false);
    }
  };
  const importCharacterPack = async () => {
    const zipPath = await window.studio.selectCharacterPack();
    if (!zipPath) return;
    setIsImportingCharacterPack(true);
    setNotice("正在读取人物资产包，建立角色档案与素材证据…");
    try {
      const result = await window.studio.characters.importAssetPack({
        zipPath,
        projectId: selectedProjectId || undefined,
        name: characterName.trim() || undefined,
        rightsStatus,
        rightsReason,
      });
      const [nextCharacters, nextCollections, detail] = await Promise.all([
        window.studio.characters.list(selectedProjectId || undefined),
        window.studio.collections.list(selectedProjectId || undefined),
        window.studio.characters.detail(result.profile.id),
      ]);
      setCharacters(nextCharacters);
      setCollections(nextCollections);
      selectedCharacterIdRef.current = result.profile.id;
      setSelectedCharacterId(result.profile.id);
      setSelectedCharacterDetail(detail);
      setSelectedCollectionId(result.collection.id);
      setSelectedCollection(await window.studio.collections.detail(result.collection.id));
      setSelectedAssetId(result.assets[0]?.id ?? "");
      await refresh();
      setScreen("characters");
      setNotice(`已导入人物资产包「${result.profile.name}」：${result.importedCount} 张新素材，${result.duplicateCount} 张复用已有素材。素材仍为待审片/待核实状态；请先完成权利复核、审片和主参考绑定。`);
    } catch (error) {
      setNotice(error instanceof Error ? `人物资产包导入失败：${error.message}` : "人物资产包导入失败，请检查压缩包。");
    } finally {
      setIsImportingCharacterPack(false);
    }
  };

  const projectName = useMemo(
    () => projects.find((project) => project.id === selectedProjectId)?.name,
    [projects, selectedProjectId],
  );
  const activeTask = useMemo(
    () => creativeTasks.find((task) => task.id === activeTaskId),
    [activeTaskId, creativeTasks],
  );
  const batchForSelectedAsset = useMemo(
    () => batches.find((batch) =>
      batch.variants.some((variant) => variant.assetId === selectedAssetId),
    ),
    [batches, selectedAssetId],
  );
  const updateCard = (key: keyof CreativeCard, value: string) =>
    setCard((current) => ({ ...current, [key]: value }));

  const learnPrompt = async () => {
    if (!learningInput.trim()) {
      setNotice("请先粘贴一条需要学习的提示词。");
      return;
    }
    const pattern = await window.studio.learning.ingestPrompt(learningInput);
    setPatterns((current) => [pattern, ...current]);
    setLearningInput("");
    setNotice(
      `已保存候选模式「${pattern.name.replace("提示词模式：", "")}」，需要在真实结果中验证后才会成为默认策略。`,
    );
  };
  const importPromptSource = async () => {
    try {
      const source = sourceUrl.trim().startsWith("https://github.com/")
        ? await window.studio.learning.importGitHubSource(sourceUrl)
        : await window.studio.learning.importWebSource(sourceUrl);
      setPromptSources((current) => [
        source,
        ...current.filter((item) => item.id !== source.id),
      ]);
      setSourceUrl("");
      setNotice(
        `已登记来源「${source.repository}」；${source.sourceType === "web" ? "仅保存公开页面的标题与简介" : `许可：${source.license ?? "未声明"}`}。仅作为待验证候选。`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "导入外部提示词库失败。",
      );
    }
  };
  const updatePatternStatus = async (
    id: string,
    status: "validated" | "rejected",
  ) => {
    try {
      const updated = await window.studio.learning.updateStatus(id, status);
      setPatterns((current) =>
        current.map((pattern) => (pattern.id === id ? updated : pattern)),
      );
      setNotice(
        status === "validated"
          ? "该策略已标记为可复用；可在创作卡中启用。"
          : "该策略已淘汰，不会进入创作卡。",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "更新学习策略失败。");
    }
  };
  const applyLearningPattern = (pattern: LearningPattern) => {
    setCard((current) => ({ ...current, learningModule: pattern.module }));
    setScreen("creation");
    setNotice(
      `已把「${pattern.name.replace("提示词模式：", "")}」作为本轮唯一学习策略。`,
    );
  };
  const searchPromptEntries = async () => {
    try {
      setPromptEntries(
        await window.studio.learning.searchEntries({
          query: promptQuery,
          category: promptCategory || undefined,
          limit: 24,
        }),
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "检索提示词库失败。");
    }
  };
  const applyPromptEntry = (entry: PromptEntry) => {
    setCard((current) => ({ ...current, learningModule: entry.promptText }));
    setScreen("creation");
    setNotice(
      `已引用「${entry.title}」到本轮创作卡；它不会覆盖你已填写的人物、场景和限制。`,
    );
  };
  const toggleParadigm = (id: string) => {
    setSelectedParadigmIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length >= 4
          ? current
          : [...current, id],
    );
  };
  const applyParadigms = () => {
    if (!paradigmComposition?.canApply) {
      setNotice(
        paradigmComposition?.warnings[0] ?? "请先选择至少一个兼容的视觉范式。",
      );
      return;
    }
    setCard((current) => ({
      ...current,
      paradigmIds: selectedParadigmIds,
      paradigmModule: paradigmComposition.promptModule,
    }));
    setScreen("creation");
    setNotice(
      `已带入视觉范式：${paradigmComposition.paradigms.map((item) => item.name).join(" × ")}。现在只需补人物、场景和本轮变化。`,
    );
  };
  const createParadigm = async () => {
    try {
      const paradigm = await window.studio.paradigms.create(customParadigm);
      setParadigms((current) => [...current, paradigm]);
      setCustomParadigm({
        name: "",
        role: "世界观与气质",
        description: "",
        promptModule: "",
      });
      setNotice(
        `已保存「${paradigm.name}」为待验证范式；先在真实候选中试用，再决定是否纳入默认。`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存视觉范式失败。");
    }
  };

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId);
  const selectedCollectionBlueprint = selectedCollection ? getAssetCollectionBlueprint(selectedCollection.kind) : undefined;
  const filteredCollectionAssets = useMemo(
    () => selectedCollection ? filterCollectionAssets(selectedCollection.assets, collectionAssetFilters) : [],
    [collectionAssetFilters, selectedCollection],
  );
  const availableSecondaryCategories = useMemo(
    () =>
      selectedType === "all"
        ? [...new Set(Object.values(ASSET_SECONDARY_CATEGORIES).flat())]
        : ASSET_SECONDARY_CATEGORIES[selectedType],
    [selectedType],
  );
  const libraryAssets = useMemo(
    () =>
      selectedSecondaryCategory === "all"
        ? assets
        : assets.filter(
            (asset) => asset.metadata.secondaryCategory === selectedSecondaryCategory,
          ),
    [assets, selectedSecondaryCategory],
  );
  const comparedCandidates = useMemo(
    () =>
      compareAssetIds.flatMap((assetId) =>
        batches.flatMap((batch) =>
          batch.variants
            .filter((variant) => variant.assetId === assetId)
            .map((variant) => ({
              asset: assets.find((asset) => asset.id === assetId),
              label: variant.label,
              prompt: variant.prompt,
              job: jobs.find((job) => job.id === variant.jobId),
            })),
        ),
      ).filter((item): item is { asset: Asset; label: string; prompt: string; job: StudioJob | undefined } => Boolean(item.asset)),
    [assets, batches, compareAssetIds, jobs],
  );
  const activeTaskCandidates = useMemo(() => {
    if (!activeTaskId) return [];
    const ids = [
      ...jobs
        .filter((job) => job.request.creativeTaskId === activeTaskId && job.status === "completed")
        .map((job) => String(job.result?.assetId ?? "")),
      ...batches
        .filter((batch) => batch.creativeTaskId === activeTaskId)
        .flatMap((batch) => batch.variants.map((variant) => variant.assetId ?? "")),
      creativeTasks.find((task) => task.id === activeTaskId)?.resultAssetId ?? "",
    ].filter(Boolean);
    return [...new Set(ids)]
      .map((id) => assets.find((asset) => asset.id === id))
      .filter((asset): asset is Asset => Boolean(asset?.mediaType.startsWith("image/")))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [activeTaskId, assets, batches, creativeTasks, jobs]);
  const selectedCreationCandidate = activeTaskCandidates.find((asset) => asset.id === selectedCreationCandidateId)
    ?? activeTaskCandidates.at(-1);
  const activeTaskCandidateItems = useMemo(() => activeTaskCandidates.map((asset) => {
    const batchMatch = batches.flatMap((batch) => batch.variants.map((variant) => ({ batch, variant })))
      .find(({ variant }) => variant.assetId === asset.id);
    const job = (batchMatch?.variant.jobId ? jobs.find((item) => item.id === batchMatch.variant.jobId) : undefined)
      ?? jobs.find((item) => item.result?.assetId === asset.id);
    return {
      asset,
      label: batchMatch?.variant.label ?? (typeof job?.request.candidateLabel === "string" ? job.request.candidateLabel : asset.name),
      prompt: batchMatch?.variant.prompt ?? (typeof job?.request.prompt === "string" ? job.request.prompt : "生成指令未记录"),
      job,
    };
  }), [activeTaskCandidates, batches, jobs]);
  const activeTaskCandidateDetails = useMemo(() => Object.fromEntries(activeTaskCandidateItems.map(({ asset, label, job }) => [asset.id, {
    variationLabel: label,
    providerLabel: job ? providerLabel(job.providerId as ProviderId) : undefined,
    aspectLabel: job ? `画幅 ${jobAspectSummary(job)}` : undefined,
    referenceLabel: job ? jobReferenceSummary(job) : undefined,
    versionLabel: job ? `版本 ${job.id.slice(0, 8)}` : undefined,
  }])), [activeTaskCandidateItems]);
  const activeTaskComparisonIds = compareAssetIds.filter((assetId) => activeTaskCandidates.some((asset) => asset.id === assetId));
  useEffect(() => {
    if (!activeTaskCandidates.length) {
      setSelectedCreationCandidateId("");
      return;
    }
    if (!activeTaskCandidates.some((asset) => asset.id === selectedCreationCandidateId))
      setSelectedCreationCandidateId(activeTaskCandidates.at(-1)?.id ?? "");
  }, [activeTaskCandidates, selectedCreationCandidateId]);
  const toggleCandidateComparison = (assetId: string) => {
    setCompareAssetIds((current) =>
      current.includes(assetId)
        ? current.filter((id) => id !== assetId)
        : current.length >= 4 ? current : [...current, assetId],
    );
  };
  const selectableImages = assets.filter((asset) =>
    asset.mediaType.startsWith("image/") && asset.confirmation === "confirmed" && ["original", "authorized"].includes(asset.rightsStatus),
  );
  const characterReferenceIssues = activeTask?.characterProfileId
    ? (() => {
      const references = card.referenceAssetIds.map((id) => assets.find((asset) => asset.id === id));
      if (!references.length) return "当前角色任务还没有可用参考图；请先完成资产包审片、权利复核，并绑定主参考或把已确认素材带入创作卡。";
      const invalid = references.filter((asset) => !asset || !asset.mediaType.startsWith("image/") || asset.confirmation !== "confirmed" || !["original", "authorized"].includes(asset.rightsStatus));
      return invalid.length ? `${invalid.length} 张角色参考素材尚未同时通过图片、审片和使用权检查；完成复核后再生成。` : "";
    })()
    : "";
  const canUse = (capability: ProviderCapability) => {
    const providerId = provider?.routes[capability];
    return Boolean(
      providerId &&
      provider?.providers.some(
        (item) =>
          item.id === providerId &&
          item.configured &&
          item.capabilities.includes(capability),
      ),
    );
  };
  const currentImageCapability: ProviderCapability = card.referenceAssetIds.length ? "image_edit" : "image";
  const canGenerateCurrentImage = canUse(currentImageCapability);
  const saveProviderKey = async (providerId: ProviderId) => {
    try {
      const key = providerKeys[providerId];
      setProvider(
        await window.studio.settings.saveProviderKey(providerId, key),
      );
      setProviderKeys((current) => ({ ...current, [providerId]: "" }));
      setProviderVerifications((current) => ({ ...current, [providerId]: undefined }));
      setNotice(
        `${providerId === "flux" ? "FLUX" : providerId === "fal" ? "fal" : providerId === "deepseek" ? "DeepSeek" : providerId === "gemini" ? "Gemini" : "OpenAI"} 已连接；密钥已使用本机系统加密保存。`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存连接配置失败。");
    }
  };
  const verifyProviderConnection = async (providerId: ProviderId) => {
    setVerifyingProviderId(providerId);
    try {
      const result = await window.studio.settings.verifyProvider(providerId);
      setProviderVerifications((current) => ({ ...current, [providerId]: result }));
      setNotice(result.message);
    } catch (error) {
      const result: ProviderVerificationResult = {
        providerId,
        ok: false,
        checkedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : "模型连接验证失败。",
      };
      setProviderVerifications((current) => ({ ...current, [providerId]: result }));
      setNotice(result.message);
    } finally {
      setVerifyingProviderId(undefined);
    }
  };
  const saveRoute = async (
    capability: ProviderCapability,
    providerId: ProviderId,
  ) => {
    try {
      setProvider(
        await window.studio.settings.saveRoute(capability, providerId),
      );
      setNotice("能力路由已更新。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "更新能力路由失败。");
    }
  };
  const saveBudget = async () => {
    try {
      setBudget(
        await window.studio.settings.saveMonthlyBudget(Number(budgetInput)),
      );
      setNotice("月度预算已保存；新建 FLUX 批量任务会先经过预算校验。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存预算失败。");
    }
  };
  const analyzeSelected = async () => {
    if (!selectedAssetId) {
      setNotice("请先在资产库选中一张图片。");
      return;
    }
    try {
      const job = await window.studio.vision.analyze(selectedAssetId);
      const report = job.result?.report as ImageUnderstandingReport | undefined;
      if (!report) throw new Error("视觉模型没有返回可用的结构化报告。");
      setAnalysis(report);
      setReversePrompt(await window.studio.vision.buildReversePrompt(report));
      await refresh();
      setNotice("反推完成：已生成可编辑的结构化提示词，可回填创作卡、镜头合同或直接作为本轮提示词。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "视觉理解失败。");
    }
  };
  const refineSelected = async () => {
    if (!selectedAsset || !selectedAsset.mediaType.startsWith("image/")) {
      setNotice("请先选择一张图片资产。");
      return;
    }
    try {
      const job = await window.studio.generation.refineImage({
        assetId: selectedAsset.id,
        prompt: refinementInstruction,
        projectId: selectedProjectId || undefined,
        aspectRatio:
          selectedAsset.metadata.width === selectedAsset.metadata.height
            ? "1:1"
            : selectedAsset.metadata.width &&
                Number(selectedAsset.metadata.width) >
                  Number(selectedAsset.metadata.height)
              ? "16:9"
              : "9:16",
      });
      const assetId = String(job.result?.assetId ?? "");
      await refresh();
      if (assetId) setSelectedAssetId(assetId);
      setNotice("高保真修订图已归档，可直接作为下一条视频的起始帧。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "图片修订失败。");
    }
  };
  const applyAnalysisToCard = () => {
    if (!analysis) return;
    setCard((current) => ({
      ...current,
      subject: mergeText(current.subject, analysis.subject),
      identityAnchor: mergeText(
        current.identityAnchor,
        analysis.identityAnchor,
      ),
      bodyAndWardrobe: mergeText(
        current.bodyAndWardrobe,
        analysis.bodyAndWardrobe,
      ),
      expressionAndPose: mergeText(
        current.expressionAndPose,
        analysis.expressionAndPose,
      ),
      scene: mergeText(current.scene, analysis.scene),
      lighting: mergeText(current.lighting, analysis.lighting),
      camera: mergeText(current.camera, analysis.camera),
      style: mergeText(current.style, analysis.style),
      referenceAssetIds:
        selectedAssetId && !current.referenceAssetIds.includes(selectedAssetId)
          ? [...current.referenceAssetIds, selectedAssetId]
          : current.referenceAssetIds,
    }));
    setScreen("creation");
    setNotice("已把图中可见设定合并进创作卡；后续只需修改场景或动作即可复用。");
  };
  const applyAnalysisToShot = () => {
    if (!analysis) return;
    setShot((current) => ({
      ...current,
      subjectAnchor: mergeText(
        current.subjectAnchor,
        analysis.identityAnchor || analysis.subject,
      ),
      startFrame: mergeText(
        current.startFrame,
        [analysis.scene, analysis.lighting, analysis.camera]
          .filter(Boolean)
          .join("；"),
      ),
      keep: [...new Set([...current.keep, ...analysis.continuityLocks])],
      avoid: [...new Set([...current.avoid, ...analysis.risks])],
      referenceAssetIds:
        selectedAssetId && !current.referenceAssetIds.includes(selectedAssetId)
          ? [...current.referenceAssetIds, selectedAssetId]
          : current.referenceAssetIds,
    }));
    setScreen("shot");
    setNotice("已把身份锚点、画面基线和连续性约束带入镜头合同。");
  };
  const useReversePromptForCreation = () => {
    if (!reversePrompt?.prompt.trim()) return;
    setPromptBuild({
      positive: reversePrompt.prompt,
      negative: analysis?.risks.join("；") || EMPTY_CARD.avoid,
      modules: reversePrompt.modules,
    });
    setTranslation(undefined);
    setScreen("creation");
    setNotice("已把反推提示词设为本轮创作基线；建议下一步只改变一个维度。\n");
  };
  const startCharacterExtensionCreation = async (
    workspace: CharacterWorkspaceSnapshot,
    context: { kind: CharacterExtensionKind; versionId?: string; stateId?: string },
  ) => {
    const state = context.stateId
      ? workspace.states.find((item) => item.id === context.stateId)
      : workspace.activeState;
    const base = composeCharacterCard(
      workspace.character,
      characterVariantSelections[workspace.character.id],
    );
    const option = CHARACTER_EXTENSION_OPTIONS.find((item) => item.id === context.kind)!;
    const nextCard = normalizeCreativeCard(buildCharacterExtensionCard({
      base: { ...base, projectId: selectedProjectId || workspace.character.projectId },
      characterId: workspace.character.id,
      versionId: context.versionId,
      stateId: context.stateId,
      kind: context.kind,
      state,
    }));
    const collectionIds = collections
      .filter((collection) => collection.characterProfileId === workspace.character.id)
      .map((collection) => collection.id);
    setIsPreparingCreation(true);
    try {
      const task = await window.studio.tasks.create({
        projectId: selectedProjectId || workspace.character.projectId,
        characterProfileId: workspace.character.id,
        name: `${workspace.character.name} · ${option.label}`,
        objective: `${option.label}：${option.result}`,
        collectionIds,
        card: nextCard,
      });
      setCard(nextCard);
      setCreativeTasks((current) => [task, ...current]);
      setActiveTaskId(task.id);
      setGuidedDraftTaskId(task.id);
      setCharacterName(workspace.character.name);
      setGuideMode("saved");
      setGuideCharacterId(workspace.character.id);
      setGuideDirection(option.deliveryMode);
      setCreationLaunchKind(["pose_set", "wardrobe_set", "series_pack", "dynamic_keyframe"].includes(context.kind) ? "series" : context.kind === "story_scene" || context.kind === "dialogue_scene" ? "scene" : "image");
      setCreationCandidateCount(nextCard.candidatePlan?.length ? 4 : 2);
      setGuideShotChoice(context.kind === "expression_set" ? "closeup" : ["pose_set", "wardrobe_set", "dynamic_keyframe"].includes(context.kind) ? "full_body" : "half_body");
      setActiveCreationPresetId(
        CREATION_PRESETS.some((preset) => preset.id === nextCard.visualPresetId)
          ? nextCard.visualPresetId as CreationPresetId
          : undefined,
      );
      setActiveCharacterContext({ profileId: workspace.character.id, versionId: context.versionId, stateId: context.stateId });
      setPromptBuild(await window.studio.creation.compilePrompt(nextCard));
      setTranslation(undefined);
      if (nextCard.referenceAssetIds[0]) setSelectedAssetId(nextCard.referenceAssetIds[0]);
      setActiveDomain("creation");
      setScreen("creation");
      setNotice(`已建立「${option.label}」任务，角色、版本、状态和参考素材已锁定。`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "建立角色衍生任务失败。");
    } finally {
      setIsPreparingCreation(false);
    }
  };
  const createSceneProfile = async () => {
    try {
      const scene = await window.studio.sceneWorkspace.create({
        projectId: selectedProjectId || undefined,
        lifecycle: "draft",
        ...sceneDraft,
      });
      setScenes((current) => [scene, ...current]);
      setSelectedSceneId(scene.id);
      setSelectedSceneWorkspace(await window.studio.sceneWorkspace.get(scene.id));
      setSceneDraft({ name: "", kind: "interior", anchor: "", layout: "", materials: "", colorSystem: "", requiredElements: "", forbiddenChanges: "" });
      setIsCreatingScene(false);
      setNotice(`已建立场景档案「${scene.name}」。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "建立场景档案失败。");
    }
  };
  const updateSceneLifecycle = async (scene: SceneProfile, lifecycle: SceneProfile["lifecycle"]) => {
    try {
      const updated = await window.studio.sceneWorkspace.update(scene.id, { lifecycle });
      setScenes((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (selectedSceneId === updated.id) setSelectedSceneWorkspace(await window.studio.sceneWorkspace.get(updated.id));
    } catch (error) { setNotice(error instanceof Error ? error.message : "更新场景状态失败。"); }
  };
  const startSceneImageCreation = (
    workspace: SceneWorkspaceSnapshot,
    context: { versionId?: string; stateId?: string },
  ) => {
    const state = context.stateId ? workspace.states.find((item) => item.id === context.stateId) : workspace.activeState;
    const usableSceneAssets = workspace.media
      .filter((item) => item.asset.confirmation === "confirmed" && ["authorized", "original"].includes(item.asset.rightsStatus))
      .map((item) => item.assetId);
    setCard((current) => normalizeCreativeCard({
      ...current,
      projectId: selectedProjectId || workspace.scene.projectId,
      intent: current.intent || `在「${workspace.scene.name}」中完成场景化图片创作`,
      subject: current.subject || "场景主视觉，无额外人物",
      scene: [workspace.scene.anchor, workspace.scene.layout, workspace.scene.requiredElements,
        state?.timeOfDay, state?.weather, state?.season, state?.atmosphere, state?.setDressing].filter(Boolean).join("；"),
      lighting: mergeText(current.lighting, state?.lighting ?? ""),
      style: mergeText(current.style, [workspace.scene.materials, workspace.scene.colorSystem].filter(Boolean).join("；")),
      avoid: mergeText(current.avoid, workspace.scene.forbiddenChanges),
      mustKeep: mergeText(current.mustKeep ?? "", state?.continuityNotes ?? ""),
      referenceAssetIds: [...new Set([...current.referenceAssetIds, ...usableSceneAssets])],
    }));
    setActiveSceneContext({ profileId: workspace.scene.id, ...context });
    setPromptBuild(undefined); setTranslation(undefined);
    setActiveDomain("creation"); setScreen("creation");
    setNotice(`已带入场景「${workspace.scene.name}」${state ? `的“${state.name}”状态` : "的空间基线"}。`);
  };
  const generateImage = async (prepared?: {
    build: PromptBuild;
    translated?: PromptTranslation;
    card?: CreativeCard;
    taskId?: string;
    characterProfileId?: string;
    sceneProfileId?: string;
    candidateLabel?: string;
    candidateIndex?: number;
    candidateCount?: number;
  }): Promise<string | undefined> => {
    const activeBuild = prepared?.build ?? promptBuild;
    const activeTranslation = prepared?.translated ?? translation;
    const effectiveTaskId = prepared?.taskId ?? activeTaskId;
    if (!activeBuild) {
      setNotice("请先生成结构化提示词。");
      return;
    }
    if (characterReferenceIssues) {
      setNotice(characterReferenceIssues);
      return;
    }
    try {
      const normalizedCard = normalizeCreativeCard(prepared?.card ?? card);
      setCard(normalizedCard);
      if (effectiveTaskId) {
        const updated = await window.studio.tasks.update(effectiveTaskId, { status: "producing", card: normalizedCard });
        setCreativeTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
      }
      const prompt = activeTranslation?.positive ?? activeBuild.positive;
      const characterId = prepared?.characterProfileId ?? activeCharacterContext?.profileId ?? activeTask?.characterProfileId;
      const characterWorkspace = characterId
        ? await window.studio.characterWorkspace.get(characterId)
        : undefined;
      const sceneProfileId = prepared?.sceneProfileId ?? activeSceneContext?.profileId;
      const sceneWorkspace = sceneProfileId
        ? await window.studio.sceneWorkspace.get(sceneProfileId)
        : undefined;
      const session = characterId || sceneWorkspace ? await window.studio.characterWorkspace.createSession({
        projectId: selectedProjectId || characterWorkspace?.character.projectId || sceneWorkspace?.scene.projectId,
        characterProfileId: characterId,
        characterVersionId: activeCharacterContext?.versionId ?? characterWorkspace?.activeVersion?.id,
        characterStateId: activeCharacterContext?.stateId ?? characterWorkspace?.activeState?.id,
        sceneProfileId: sceneWorkspace?.scene.id,
        sceneVersionId: activeSceneContext?.versionId ?? sceneWorkspace?.activeVersion?.id,
        sceneStateId: activeSceneContext?.stateId ?? sceneWorkspace?.activeState?.id,
        creativeTaskId: effectiveTaskId || undefined,
        title: `${characterWorkspace?.character.name ?? sceneWorkspace?.scene.name ?? "图片创作"} · ${prepared?.candidateLabel ?? (normalizedCard.scene || normalizedCard.intent || "候选")}`.slice(0, 80),
        mode: normalizedCard.referenceAssetIds.length ? "image_edit" : "text_to_image",
        prompt,
        negativePrompt: activeTranslation?.negative ?? activeBuild.negative,
        providerId: normalizedCard.referenceAssetIds.length ? provider?.routes.image_edit : provider?.routes.image,
        aspectRatio: normalizedCard.aspectRatio,
        referenceAssetIds: normalizedCard.referenceAssetIds,
        settings: { qualityTier, referenceBindings: normalizedCard.referenceBindings, deliveryMode: normalizedCard.deliveryMode, candidateLabel: prepared?.candidateLabel, candidateIndex: prepared?.candidateIndex, candidateCount: prepared?.candidateCount },
      }) : undefined;
      const job = await window.studio.generation.image({
        prompt,
        negative: activeTranslation?.negative ?? activeBuild.negative,
        projectId: selectedProjectId || characterWorkspace?.character.projectId || sceneWorkspace?.scene.projectId,
        creativeTaskId: effectiveTaskId || undefined,
        generationSessionId: session?.id,
        aspectRatio: normalizedCard.aspectRatio,
        referenceAssetIds: normalizedCard.referenceAssetIds,
        referenceBindings: normalizedCard.referenceBindings,
        qualityTier,
        candidateLabel: prepared?.candidateLabel,
        candidateIndex: prepared?.candidateIndex,
        candidateCount: prepared?.candidateCount,
        deliveryMode: normalizedCard.deliveryMode,
      });
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      const assetId = String(job.result?.assetId ?? "");
      if (effectiveTaskId && assetId) {
        const updated = await window.studio.tasks.update(effectiveTaskId, { status: "review", resultAssetId: assetId });
        setCreativeTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
      }
      if (assetId) {
        setSelectedCreationCandidateId(assetId);
        setSelectedAssetId(assetId);
      }
      await refresh();
      if (assetId) {
        const projectAssets = await window.studio.assets.list({
          projectId: selectedProjectId || characterWorkspace?.character.projectId || sceneWorkspace?.scene.projectId,
        });
        setAssets(projectAssets);
        setSelectedType("all");
      }
      if (characterId && selectedCharacterIdRef.current === characterId)
        setSelectedCharacterWorkspace(await window.studio.characterWorkspace.get(characterId));
      if (sceneWorkspace && selectedSceneId === sceneWorkspace.scene.id)
        setSelectedSceneWorkspace(await window.studio.sceneWorkspace.get(sceneWorkspace.scene.id));
      return assetId || undefined;
    } catch (error) {
      if (effectiveTaskId) {
        try {
          const updated = await window.studio.tasks.update(effectiveTaskId, { status: "blocked", card: normalizeCreativeCard(prepared?.card ?? card) });
          setCreativeTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
        } catch {
          // 生成错误本身已经需要保留；任务状态更新失败不覆盖原始错误。
        }
      }
      setNotice(`${error instanceof Error ? error.message : "成图任务失败。"} 任务已标记为生成阻塞，可从生成队列按原请求重试。`);
      return undefined;
    }
  };
  const generatePreparedCandidateSet = async ({
    targetCard,
    taskId = activeTaskId,
    characterProfileId,
    sceneProfileId,
  }: {
    targetCard: CreativeCard;
    taskId?: string;
    characterProfileId?: string;
    sceneProfileId?: string;
  }) => {
    if (characterReferenceIssues) {
      setNotice(characterReferenceIssues);
      return;
    }
    if (isGeneratingCandidates) return;
    setIsGeneratingCandidates(true);
    try {
      const normalizedCard = normalizeCreativeCard(targetCard);
      setCard(normalizedCard);
      setNotice("正在整理方案并适配绘图模型…");
      const build = await window.studio.creation.compilePrompt(normalizedCard);
      setPromptBuild(build);
      let translated: PromptTranslation | undefined;
      const imageProvider = normalizedCard.referenceAssetIds.length
        ? provider?.routes.image_edit
        : provider?.routes.image;
      if (canUse("text") && (imageProvider === "openai" || imageProvider === "flux" || imageProvider === "fal" || imageProvider === "gemini")) {
        try {
          translated = await window.studio.creation.translatePrompt({
            prompt: build.positive,
            negative: build.negative,
            providerId: imageProvider,
            qualityTier,
          });
          setTranslation(translated);
        } catch {
          // 模型适配失败时仍可使用结构化提示词完成生成。
        }
      }
      const generatedIds: string[] = [];
      const candidateVariations = buildCandidateVariations(
        creationCandidateCount,
        normalizedCard.deliveryMode ?? guideDirection,
        normalizedCard.candidatePlan,
      );
      for (let index = 0; index < candidateVariations.length; index += 1) {
        const variation = candidateVariations[index];
        setNotice(`正在生成候选 ${index + 1}/${creationCandidateCount}…`);
        const candidateBuild = { ...build, positive: `${build.positive}\n候选策略：${variation.directive}` };
        const candidateTranslation = translated ? { ...translated, positive: `${translated.positive}\nCandidate variation: ${variation.directive}` } : undefined;
        const assetId = await generateImage({
          build: candidateBuild,
          translated: candidateTranslation,
          card: normalizedCard,
          taskId,
          characterProfileId,
          sceneProfileId,
          candidateLabel: variation.label,
          candidateIndex: index + 1,
          candidateCount: candidateVariations.length,
        });
        if (assetId) generatedIds.push(assetId);
      }
      if (taskId && generatedIds.length) {
        const updated = await window.studio.tasks.update(taskId, {
          status: "review",
          resultAssetId: generatedIds.at(-1),
        });
        setCreativeTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
      }
      setNotice(generatedIds.length
        ? `已生成 ${generatedIds.length} 张候选，直接在当前页面选择最佳版本。`
        : "本轮没有生成可用候选，请检查模型连接或到生成队列重试。");
      if (generatedIds.length) setCreationStudioStage("candidates");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "准备首版成图失败。");
    } finally {
      setIsGeneratingCandidates(false);
    }
  };
  const generateFirstVersion = async () => generatePreparedCandidateSet({ targetCard: card });
  const applyRefinementToPlan = async () => {
    const preset = getCreationRefinements(card.deliveryMode).find((item) => item.id === creationRefinementId);
    const nextCard = normalizeCreativeCard(applyCreationRefinement(card, creationRefinementId));
    setCard(nextCard);
    setPromptBuild(await window.studio.creation.compilePrompt(nextCard));
    setTranslation(undefined);
    if (activeTaskId) {
      const updated = await window.studio.tasks.update(activeTaskId, { card: nextCard });
      setCreativeTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
    }
    setLocalRefinementApplied(true);
    setNotice(`已把“${preset?.label ?? "局部调整"}”写入当前方案；没有调用任何模型。`);
  };
  const confirmLocalDirectionCandidate = async () => {
    const variation = localDirectionCandidates.find((item) => item.id === selectedLocalDirectionId)
      ?? localDirectionCandidates[0];
    if (!variation) return;
    const directionNote = `画面重点：${variation.label}（${variation.directive}）`;
    const intentParts = card.intent.split("；").map((item) => item.trim()).filter(Boolean);
    const nextCard = normalizeCreativeCard({
      ...card,
      intent: [...new Set([...intentParts.filter((item) => !item.startsWith("画面重点：")), directionNote])].join("；"),
    });
    setCard(nextCard);
    setPromptBuild(await window.studio.creation.compilePrompt(nextCard));
    setTranslation(undefined);
    setConfirmedLocalDirectionId(variation.id);
    setLocalRefinementApplied(false);
    if (activeTaskId) {
      const updated = await window.studio.tasks.update(activeTaskId, { card: nextCard });
      setCreativeTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
    }
    setCreationStudioStage("refine");
    setNotice(`已选择“${variation.label}”并写入本地方案；没有调用任何模型。`);
  };
  const selectCharacterExtensionScene = async (sceneId: GuidedScene) => {
    const option = GUIDED_SCENES.find((item) => item.id === sceneId);
    if (!option || sceneId === "custom") return;
    const nextCard = normalizeCreativeCard({
      ...card,
      sceneDirectionId: sceneId,
      scene: option.prompt,
    });
    setGuideSceneChoice(sceneId);
    setCard(nextCard);
    setPromptBuild(await window.studio.creation.compilePrompt(nextCard));
    setTranslation(undefined);
    if (activeTaskId) {
      const updated = await window.studio.tasks.update(activeTaskId, { card: nextCard });
      setCreativeTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
    }
    setNotice(`已选择“${option.label}”作为本轮场景；角色身份与造型继续锁定。`);
  };
  const saveCurrentPlanAsSceneAsset = async () => {
    if (card.sceneProfileId) {
      setSelectedSceneId(card.sceneProfileId);
      setActiveDomain("assets");
      setScreen("scenes");
      return;
    }
    const direction = localDirectionCandidates.find((item) => item.id === confirmedLocalDirectionId)
      ?? selectedLocalDirection;
    const characterLabel = selectedCharacterWorkspace?.character.name
      ?? characters.find((item) => item.id === activeTask?.characterProfileId)?.name
      ?? "角色剧情";
    const draft = buildLocalSceneAssetDraft({
      card,
      characterName: characterLabel,
      directionLabel: direction?.label,
      directionDirective: direction?.directive,
    });
    const sameNameCount = scenes.filter((item) => item.name === draft.nameBase || item.name.startsWith(`${draft.nameBase} `)).length;
    const name = sameNameCount ? `${draft.nameBase} ${sameNameCount + 1}` : draft.nameBase;
    try {
      const sceneProfile = await window.studio.sceneWorkspace.create({
        projectId: selectedProjectId || card.projectId,
        name,
        ...draft.profile,
      });
      const sceneState = await window.studio.sceneWorkspace.createState(sceneProfile.id, draft.state);
      const workspace = await window.studio.sceneWorkspace.get(sceneProfile.id);
      const nextCard = normalizeCreativeCard({ ...card, sceneProfileId: sceneProfile.id });
      setCard(nextCard);
      setScenes((current) => [sceneProfile, ...current.filter((item) => item.id !== sceneProfile.id)]);
      setSelectedSceneId(sceneProfile.id);
      setSelectedSceneWorkspace(workspace);
      setActiveSceneContext({ profileId: sceneProfile.id, stateId: sceneState.id });
      if (activeTaskId) {
        const updated = await window.studio.tasks.update(activeTaskId, { card: nextCard });
        setCreativeTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
      }
      setNotice(`已保存场景资产“${sceneProfile.name}”，剧情方向、空间锚点与状态可以继续复用。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存场景资产失败。");
    }
  };
  const generateSelectedRefinement = async () => {
    if (isGeneratingCandidates) return;
    const nextCard = normalizeCreativeCard(applyCreationRefinement(card, creationRefinementId));
    setCard(nextCard);
    setPromptBuild(undefined);
    setTranslation(undefined);
    setIsGeneratingCandidates(true);
    try {
      setNotice("正在按所选变化生成新候选…");
      const build = await window.studio.creation.compilePrompt(nextCard);
      setPromptBuild(build);
      let translated: PromptTranslation | undefined;
      const imageProvider = nextCard.referenceAssetIds.length ? provider?.routes.image_edit : provider?.routes.image;
      if (canUse("text") && (imageProvider === "openai" || imageProvider === "flux" || imageProvider === "fal" || imageProvider === "gemini")) {
        try {
          translated = await window.studio.creation.translatePrompt({
            prompt: build.positive,
            negative: build.negative,
            providerId: imageProvider,
            qualityTier,
          });
          setTranslation(translated);
        } catch {
          // 模型适配失败时继续使用结构化提示词。
        }
      }
      const assetId = await generateImage({ build, translated, card: nextCard });
      setNotice(assetId ? "新候选已加入当前画布，原候选仍保留可比较。" : "变化候选生成失败，请检查模型连接或生成队列。");
    } finally {
      setIsGeneratingCandidates(false);
    }
  };
  const saveRecipe = async () => {
    if (!promptBuild) {
      setNotice("请先生成结构化提示词，再保存为配方。\n");
      return;
    }
    try {
      const recipe = await window.studio.recipes.create({
        name: recipeName,
        projectId: selectedProjectId || undefined,
        creativeTaskId: activeTaskId || undefined,
        providerId: provider?.routes.image,
        purpose: recipePurpose,
        applicability: recipeApplicability,
        invalidationConditions: recipeInvalidation.split("\n").map((item) => item.trim()).filter(Boolean),
        card,
        prompt: translation?.positive ?? promptBuild.positive,
        negative: translation?.negative ?? promptBuild.negative,
        sourceAssetIds: card.referenceAssetIds,
      });
      setRecipes((current) => [recipe, ...current]);
      setNotice(`已保存配方「${recipe.name}」；真实结果通过审片后再标记为已验证。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存配方失败。");
    }
  };
  const loadRecipe = (recipe: CreativeRecipe) => {
    setCard(normalizeCreativeCard({ ...recipe.card, projectId: selectedProjectId || recipe.projectId }));
    setPromptBuild({ positive: recipe.prompt, negative: recipe.negative, modules: [] });
    setTranslation(undefined);
    setScreen("creation");
    setNotice(`已加载配方「${recipe.name}」；适用范围：${recipe.applicability}。命中失效条件时请停止套用并重新验证。`);
  };
  const reviewRecipe = async (recipe: CreativeRecipe, status: "validated" | "rejected") => {
    const evidence = status === "validated"
      ? recipeReviewSelections[recipe.id] ?? ""
      : "已由用户基于实际出图确认不适合复用。";
    try {
      const updated = await window.studio.recipes.updateStatus(recipe.id, status, evidence);
      setRecipes((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice(status === "validated" ? "配方已验证，可作为后续创作起点。" : "配方已淘汰，不会作为默认推荐。\n");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "更新配方状态失败。");
    }
  };
  const enrichCard = async () => {
    try {
      const suggestion = await window.studio.creation.enrichCard(card);
      setCard((current) => ({
        ...current,
        ...Object.fromEntries(
          Object.entries(suggestion).filter(
            ([key, value]) =>
              key !== "reasoning" && typeof value === "string" && value.trim(),
          ),
        ),
      }));
      setNotice(
        suggestion.reasoning
          ? `创作理解已补全：${suggestion.reasoning}`
          : "创作理解已补全空缺字段；请检查后再生成提示词。",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "创作理解失败。");
    }
  };
  const translatePrompt = async () => {
    if (!promptBuild) {
      setNotice("请先生成结构化提示词。");
      return;
    }
    const imageProvider = card.referenceAssetIds.length ? provider?.routes.image_edit : provider?.routes.image;
    if (imageProvider !== "openai" && imageProvider !== "flux" && imageProvider !== "fal" && imageProvider !== "gemini") {
      setNotice(`请先在模型连接页选择可用的${card.referenceAssetIds.length ? "修图" : "图片"}路由。`);
      return;
    }
    try {
      const value = await window.studio.creation.translatePrompt({
        prompt: promptBuild.positive,
        negative: promptBuild.negative,
        providerId: imageProvider,
        qualityTier,
      });
      setTranslation(value);
      setNotice("已完成模型适配；原始结构化提示词仍被保留，可随时切回。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "提示词适配失败。");
    }
  };
  const createBatch = async () => {
    if (!activeTaskId) {
      setNotice("请先建立并保存创作任务，再把候选生产关联回本次目标。\n");
      return;
    }
    if (!promptBuild) {
      setNotice("先在创作卡生成结构化提示词，再建立批量任务。");
      return;
    }
    const variables = batchVariables
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!variables.length) {
      setNotice("每行填写一个场景或变化项。");
      return;
    }
    try {
      const batch = await window.studio.batches.create({
        name: batchName,
        projectId: selectedProjectId || undefined,
        creativeTaskId: activeTaskId,
        aspectRatio: card.aspectRatio,
        referenceAssetIds: card.referenceAssetIds,
        referenceBindings: card.referenceBindings,
        variants: variables.map((scene, index) => ({
          label: `变体 ${index + 1}：${scene}`,
          prompt: `${promptBuild.positive}${promptBuild.negative ? `\n避免：${promptBuild.negative}` : ""}\n本轮唯一变化：场景为${scene}。其余人物身份、服装、构图与限制保持不变。`,
        })),
      });
      setBatches((current) => [batch, ...current]);
      setNotice(
        `已建立 ${batch.variants.length} 个候选的批量任务；预计成本会在任务卡上显示。`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "建立批量任务失败。");
    }
  };
  const runBatch = async (batchId: string) => {
    try {
      const batch = await window.studio.batches.run(batchId);
      setBatches((current) =>
        current.map((item) => (item.id === batch.id ? batch : item)),
      );
      await refresh();
      setNotice(
        `批量任务「${batch.name}」已完成，请在资产库逐张确认主版本或淘汰。`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "批量任务执行失败。");
    }
  };
  const reviewAsset = async (confirmation: "confirmed" | "rejected", assetId = selectedAssetId) => {
    if (!assetId) return;
    try {
      await window.studio.assets.updateConfirmation(
        assetId,
        confirmation,
      );
      if (confirmation === "confirmed") {
        const taskId = batchForSelectedAsset?.creativeTaskId || activeTaskId;
        if (taskId) {
          const task = await window.studio.tasks.update(taskId, {
            status: "review",
            resultAssetId: assetId,
          });
          setCreativeTasks((current) =>
            current.map((item) => (item.id === task.id ? task : item)),
          );
          setActiveTaskId(task.id);
        }
      }
      await refresh();
      await refreshCharacterRelations();
      setNotice(
        confirmation === "confirmed"
          ? "审片状态已确认；还需核实使用权，才能作为角色主参考或视频起始帧。"
          : "已淘汰该候选；仍保留来源记录以便追溯。",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "更新审核状态失败。");
    }
  };
  const openCharacterCreate = () => {
    setCharacterName("");
    setCharacterGroup("lead");
    setCharacterDraftCard({
      ...EMPTY_CARD,
      projectId: selectedProjectId || undefined,
      intent: "",
      aspectRatio: "2:3",
    });
    setSelectedCharacterId("");
    selectedCharacterIdRef.current = "";
    setSelectedCharacterDetail(undefined);
    setMasterPickerCharacterId("");
    setNotice("");
    setActiveDomain("assets");
    setScreen("characters");
    setIsCreatingCharacter(true);
  };
  const syncCharacterFactsFromCard = async (characterId: string, sourceCard: CreativeCard) => {
    const seeds = buildCharacterFactSeeds(sourceCard);
    const results = await Promise.allSettled(seeds.map((input) => window.studio.characters.upsertFact(characterId, input)));
    return {
      total: seeds.length,
      failed: results.filter((result) => result.status === "rejected").length,
    };
  };
  const saveCharacter = async (draftCard: CreativeCard = card) => {
    const name = characterName.trim();
    if (!name) {
      setNotice("请先填写角色档案名称。");
      return;
    }
    try {
      const profile = await window.studio.characters.create({
        name,
        card: draftCard,
        projectId: selectedProjectId || undefined,
        masterAssetId:
          selectedProjectId && selectedAsset?.mediaType.startsWith("image/") && selectedAsset.confirmation === "confirmed" &&
          ["authorized", "original"].includes(selectedAsset.rightsStatus)
            ? selectedAsset.id
            : undefined,
        group: characterGroup,
        lifecycle: "draft",
      });
      const factSync = await syncCharacterFactsFromCard(profile.id, draftCard);
      setCharacters((current) => [profile, ...current]);
      const collection = await window.studio.collections.create({
        projectId: selectedProjectId || undefined,
        characterProfileId: profile.id,
        kind: "character",
        name: `${profile.name} · 角色资产包`,
        description: "用于归档定妆、服装、表情、场景延展与正式母版。",
        status: "draft",
      });
      if (profile.masterAssetId) await window.studio.collections.attachAsset(collection.id, profile.masterAssetId, "主参考");
      setCollections((current) => [collection, ...current]);
      setCharacterName("");
      setIsCreatingCharacter(false);
      selectCharacter(profile.id);
      setActiveDomain("assets");
      setScreen("characters");
      setNotice(
        factSync.failed
          ? `已保存角色档案「${profile.name}」，但有 ${factSync.failed} 个人物细项同步失败，可在角色档案中继续补充。`
          : `已保存角色档案「${profile.name}」${profile.masterAssetId ? "，并绑定了已确认主参考图" : ""}；${factSync.total} 个创作选择已进入人物细项。`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存角色档案失败。");
    }
  };
  const createCollection = async () => {
    if (!newCollectionName.trim()) { setNotice("请先给资产包命名，例如「蝶灵 · 夜行礼服套装」。"); return; }
    if (newCollectionKind === "character" && !newCollectionCharacterId) { setNotice("角色资产包需要先选择一个角色档案。"); return; }
    try {
      const collection = await window.studio.collections.create({
        projectId: selectedProjectId || undefined,
        characterProfileId: newCollectionKind === "character" ? newCollectionCharacterId : undefined,
        parentId: newCollectionParentId || undefined,
        kind: newCollectionKind,
        name: newCollectionName.trim(),
        description: newCollectionDescription.trim(),
        status: "draft",
      });
      setCollections((current) => [collection, ...current]);
      setSelectedCollectionId(collection.id);
      setNewCollectionName(""); setNewCollectionDescription(""); setNewCollectionCharacterId(""); setNewCollectionParentId("");
      setNotice("资产包已建立。接下来把已有素材放进同一个包，后续任务就能稳定复用。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "建立资产包失败。"); }
  };
  const attachSelectedAssetToCollection = async () => {
    if (!selectedAsset || !selectedCollection) { setNotice("请先在资产库选中素材，再选择一个资产包。"); return; }
    try {
      const detail = await window.studio.collections.attachAsset(
        selectedCollection.id,
        selectedAsset.id,
        assetCollectionRole(selectedAsset.id, projectWorkspace?.masterAssets ?? []),
        selectedCollectionModuleKey || undefined,
        selectedCollectionMemberNotes,
      );
      setSelectedCollection(detail);
      setCollections((current) => current.map((item) => item.id === detail.id ? detail : item));
      setSelectedCollectionMemberNotes("");
      setNotice(`已把「${selectedAsset.name}」放入「${detail.name}」。`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "归档素材失败。"); }
  };
  const saveCollectionDetails = async () => {
    if (!selectedCollection || !collectionEditName.trim()) return;
    try {
      const updated = await window.studio.collections.update(selectedCollection.id, {
        name: collectionEditName.trim(),
        description: collectionEditDescription.trim(),
      });
      setCollections((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      const detail = await window.studio.collections.detail(updated.id);
      setSelectedCollection(detail);
      setEditingCollection(false);
      setNotice("资产包基本信息已保存。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "保存资产包信息失败。"); }
  };
  const detachSelectedCollectionAsset = async (assetId: string) => {
    if (!selectedCollection) return;
    try {
      const detail = await window.studio.collections.detachAsset(selectedCollection.id, assetId);
      setSelectedCollection(detail);
      setCollections((current) => current.map((item) => item.id === detail.id ? detail : item));
      setNotice("已从当前资产包移除素材；素材本身仍保留在素材库。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "移除素材失败。"); }
  };
  const updateCollectionStatus = async (status: AssetCollection["status"]) => {
    if (!selectedCollection) return;
    try {
      const updated = await window.studio.collections.update(selectedCollection.id, { status });
      setSelectedCollection((current) => current ? { ...current, ...updated } : current);
      setCollections((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      setNotice(status === "active" ? "资产包已切换为使用中。" : "资产包状态已更新。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "更新资产包状态失败。"); }
  };
  const loadCharacter = async (profile: CharacterProfile) => {
    const [detail, workspace] = await Promise.all([
      window.studio.characters.detail(profile.id),
      window.studio.characterWorkspace.get(profile.id),
    ]);
    const sourceCard = detail ? composeCharacterCard(detail, characterVariantSelections[profile.id]) : profile.card;
    setCard(normalizeCreativeCard({
      ...sourceCard,
      projectId: selectedProjectId || profile.projectId,
    }));
    if (sourceCard.referenceAssetIds[0]) setSelectedAssetId(sourceCard.referenceAssetIds[0]);
    setActiveCharacterContext({
      profileId: profile.id,
      versionId: workspace.activeVersion?.id,
      stateId: workspace.activeState?.id,
    });
    setNotice(`已加载「${profile.name}」；本轮只需填写新的场景、动作或镜头。`);
  };
  const createCharacterSheetTask = async (profile?: CharacterProfile) => {
    const target = profile ?? characters.find((item) => item.id === selectedCharacterId);
    if (!target) {
      setScreen("characters");
      setNotice("请先在角色档案中选择一个角色；角色设定板不会凭空生成新角色。");
      return;
    }
    try {
      const detail = await window.studio.characters.detail(target.id);
      const base = detail ? composeCharacterCard(detail) : target.card;
      const inheritedCollectionIds = collections.filter((item) => item.characterProfileId === target.id).map((item) => item.id);
      const inheritedCollectionDetails = await Promise.all(inheritedCollectionIds.map((id) => window.studio.collections.detail(id)));
      const referenceAssetIds = [...new Set([
        ...base.referenceAssetIds,
        ...(target.masterAssetId ? [target.masterAssetId] : []),
        ...collectUsableReferenceAssetIds(inheritedCollectionDetails),
      ])];
      const sheetCard: CreativeCard = {
        ...CHARACTER_SHEET_TEMPLATE,
        projectId: selectedProjectId || target.projectId,
        subject: `${target.name}：${base.subject || CHARACTER_SHEET_TEMPLATE.subject}`,
        identityAnchor: mergeText(CHARACTER_SHEET_TEMPLATE.identityAnchor, base.identityAnchor),
        bodyAndWardrobe: mergeText(CHARACTER_SHEET_TEMPLATE.bodyAndWardrobe, base.bodyAndWardrobe),
        referenceAssetIds,
      };
      const task = await window.studio.tasks.create({
        projectId: selectedProjectId || target.projectId,
        characterProfileId: target.id,
        name: `${target.name} · 角色设定板`,
        objective: "生成角色设定板，锁定同一角色的结构、表情、服装与姿态",
        collectionIds: inheritedCollectionIds,
        card: sheetCard,
      });
      setCard(normalizeCreativeCard(sheetCard));
      setCreativeTasks((current) => [task, ...current]);
      setActiveTaskId(task.id);
      setCharacterName(target.name);
      setCharacterGroup(target.group);
      setSelectedCharacterId(target.id);
      selectedCharacterIdRef.current = target.id;
      setSelectedAssetId(referenceAssetIds[0] ?? "");
      setPromptBuild(await window.studio.creation.compilePrompt(sheetCard));
      setTranslation(undefined);
      setScreen("creation");
      setNotice(`已为「${target.name}」建立角色设定板任务；角色 ID 已锁定，后续只能修改本轮画面，不会创建新角色。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "建立角色设定板任务失败。");
    }
  };
  const beginGuidedCreation = async (generateCandidates = true, stayInCreator = false, saveAsCharacter = false) => {
    const savedCharacter = characters.find((profile) => profile.id === guideCharacterId);
    const savedScene = scenes.find((profile) => profile.id === guideSceneProfileId);
    const referenceAsset = selectableImages.find((asset) => asset.id === guideReferenceAssetId);
    if (guideMode === "new" && guideSubjectChoice === "custom" && !guideSubject.trim()) {
      setNotice("请补充自定义主体，或选择一个现成选项。");
      return;
    }
    if (!savedScene && guideSceneChoice === "custom" && !guideScene.trim()) {
      setNotice("请补充自定义场景，或选择一个现成选项。");
      return;
    }
    if (guideSceneProfileId && !savedScene) {
      setNotice("所选场景档案已经失效，请重新选择。");
      return;
    }
    if (guideMode === "saved" && !savedCharacter) {
      setNotice("请选择一个已经保存的角色。");
      return;
    }
    if (guideMode === "reference" && !guideReferenceAssetId) {
      setNotice("请选择一张已经通过审片和使用权核实的参考图。");
      return;
    }
    const guidedPlan = composeGuidedCreation({
      direction: guideDirection,
      subject: guideSubjectChoice,
      scene: guideSceneChoice,
      mood: guideMoodChoice,
      shot: guideShotChoice,
      visualStyle: guideVisualStyle,
      // 已有角色和参考图已经承担身份基线，不能再用入口默认脸型、肤色或发型覆盖它们。
      appearance: guideMode === "new" ? guideAppearance : undefined,
      constraints: guideConstraints,
      customSubject: guideSubject,
      customScene: savedScene?.name ?? guideScene,
      sourceLabel: guideMode === "saved"
        ? `沿用角色「${savedCharacter?.name ?? ""}」`
        : guideMode === "reference"
          ? `按参考图「${referenceAsset?.name ?? ""}」锁定人物`
          : undefined,
      storyPlan: creationLaunchKind === "scene" ? guideStoryPlan : undefined,
    });
    setIsPreparingCreation(true);
    try {
      const detail = savedCharacter ? await window.studio.characters.detail(savedCharacter.id) : undefined;
      let sceneWorkspace = savedScene ? await window.studio.sceneWorkspace.get(savedScene.id) : undefined;
      const selection = savedCharacter ? characterVariantSelections[savedCharacter.id] : undefined;
      if (detail && selection && Object.entries(selection).some(([kind, id]) => id && !detail.variants.some((variant) => variant.id === id && variant.kind === kind))) {
        setNotice("所选角色变体已失效，请重新选择造型、表情或动作。"); return;
      }
      if (guideReferenceAssetId && !selectableImages.some((asset) => asset.id === guideReferenceAssetId)) {
        setNotice("参考图还未完成审片和使用权核实，请先到资产库处理。"); return;
      }
      const base = detail ? composeCharacterCard(detail, selection) : savedCharacter?.card ?? EMPTY_CARD;
      const normalizedBaseReferences = normalizeReferenceBindings(base.referenceAssetIds, base.referenceBindings);
      const sceneReferenceIds = sceneWorkspace?.media
        .filter((item) => item.asset.confirmation === "confirmed" && ["authorized", "original"].includes(item.asset.rightsStatus))
        .map((item) => item.assetId) ?? [];
      const characterCollectionIds = savedCharacter
        ? collections.filter((collection) => collection.characterProfileId === savedCharacter.id).map((collection) => collection.id)
        : [];
      const inheritedCollectionDetails = await Promise.all([...new Set([...characterCollectionIds, ...guideCollectionIds])]
        .map((id) => window.studio.collections.detail(id)));
      const inheritedReferences = collectUsableReferenceAssetIds(inheritedCollectionDetails);
      const referenceAssetIds = [...new Set([
        ...normalizedBaseReferences.referenceAssetIds,
        ...(guideReferenceAssetId ? [guideReferenceAssetId] : []),
        ...sceneReferenceIds,
        ...inheritedReferences,
      ])];
      const baseBindingsByAssetId = new Map(normalizedBaseReferences.referenceBindings.map((binding) => [binding.assetId, binding]));
      const preferredPrimaryId = guideReferenceAssetId
        || normalizedBaseReferences.referenceBindings.find((binding) => binding.priority === "primary")?.assetId
        || referenceAssetIds[0];
      const referenceBindings = referenceAssetIds.map((assetId) => ({
        assetId,
        role: guideReferenceAssetId === assetId
          ? "identity" as const
          : sceneReferenceIds.includes(assetId)
            ? "scene" as const
            : baseBindingsByAssetId.get(assetId)?.role ?? (characterCollectionIds.length ? "identity" as const : "material" as const),
        priority: assetId === preferredPrimaryId ? "primary" as const : "support" as const,
      }));
      const projectContext = [
        projectBrief.goal && `项目目标：${projectBrief.goal}`,
        projectBrief.audience && `使用方向：${projectBrief.audience}`,
        projectBrief.delivery && `交付结果：${projectBrief.delivery}`,
      ].filter(Boolean).join("；");
      let nextCard = buildCreativePlan({
        base: {
          ...base,
          projectId: selectedProjectId || savedCharacter?.projectId,
          referenceAssetIds,
          referenceBindings,
        },
        brief: mergeText(guidedPlan.objective, projectContext),
        direction: guideDirection,
        subject: guideMode === "saved" && base.subject ? base.subject : guidedPlan.subject,
        scene: mergeText(
          [
            savedScene?.anchor,
            savedScene?.layout,
            savedScene?.requiredElements,
            sceneWorkspace?.activeState?.timeOfDay,
            sceneWorkspace?.activeState?.weather,
            sceneWorkspace?.activeState?.atmosphere,
          ].filter(Boolean).join("；") || guidedPlan.scene,
          projectBrief.visualWorld,
        ),
        visualStyle: guidedPlan.visualStyle,
        mustKeep: mergeText(
          mergeText(
            guidedPlan.mustKeep,
            guideMode === "saved"
              ? `沿用角色「${savedCharacter?.name ?? ""}」的身份结构，不重新设计脸部、年龄感、种族／物种、发型与身体比例`
              : guideMode === "reference"
                ? `以参考图「${referenceAsset?.name ?? ""}」作为身份主参考，不重新设计脸部、年龄感、发型与身体比例`
                : "",
          ),
          projectBrief.acceptance,
        ),
      });
      if (creationLaunchKind !== "character") nextCard = { ...nextCard, aspectRatio: guideAspectRatio };
      if (creationLaunchKind === "character" && guideMode === "new") {
        nextCard = {
          ...nextCard,
          visualPresetId: guidePresetId,
          sceneDirectionId: guideSceneChoice === "custom" ? undefined : guideSceneChoice,
          appearanceProfile: {
            subjectId: guideSubjectChoice,
            ageId: guideAppearance.age,
            roleId: guideAppearance.role,
            ethnicityId: guideAppearance.ethnicity,
            skinToneId: guideAppearance.skinTone,
            faceId: guideAppearance.face,
            eyesId: guideAppearance.eyes,
            eyeColorId: guideAppearance.eyeColor,
            hairId: guideAppearance.hair,
            hairColorId: guideAppearance.hairColor,
            bodyId: guideAppearance.body,
            heightId: guideAppearance.height,
            proportionId: guideAppearance.proportion,
            upperVolumeId: guideAppearance.upperVolume,
            lowerShapeId: guideAppearance.lowerShape,
            wardrobeId: guideAppearance.wardrobe,
            poseId: guideAppearance.pose,
            expressionId: guideAppearance.expression,
          },
          characterCore: {
            roleId: guideAppearance.role,
            personalityId: guideMoodChoice,
            voiceId: guideAppearance.voice,
            relationshipId: guideAppearance.relationship,
            interestId: guideAppearance.interest,
            performanceId: guideAppearance.performance,
            archetypeId: guideAppearance.archetype,
            driveId: guideAppearance.drive,
            conflictId: guideAppearance.conflict,
            openingId: guideAppearance.opening,
          },
        };
      }
      if (creationLaunchKind === "scene") {
        nextCard = {
          ...nextCard,
          sceneProfileId: savedScene?.id,
          storyPlan: {
            relationshipId: guideStoryPlan.relationship,
            momentId: guideStoryPlan.moment,
            pacingId: guideStoryPlan.pacing,
            atmosphereId: guideStoryPlan.atmosphere,
          },
        };
      } else {
        nextCard = { ...nextCard, storyPlan: undefined };
      }
      if (guideDirection === "series_pack" || creationLaunchKind === "series") {
        nextCard = { ...nextCard, candidatePlan: seriesCandidatePlan.map((item) => ({ ...item })) };
      } else {
        nextCard = { ...nextCard, candidatePlan: undefined };
      }
      // 选择式入口必须即时可用，不能等待外部文本模型。需要时可在创作画布中手动智能补全。
      if (creationLaunchKind === "scene" && !savedScene) {
        const sceneLabel = GUIDED_SCENES.find((item) => item.id === guideSceneChoice)?.label ?? "剧情场景";
        const momentLabel = GUIDED_STORY_MOMENTS.find((item) => item.id === guideStoryPlan.moment)?.label ?? "剧情瞬间";
        const atmosphereLabel = GUIDED_STORY_ATMOSPHERES.find((item) => item.id === guideStoryPlan.atmosphere)?.label ?? "场景状态";
        const baseName = `${sceneLabel} · ${momentLabel}`;
        const sameNameCount = scenes.filter((item) => item.name === baseName || item.name.startsWith(`${baseName} `)).length;
        const sceneName = sameNameCount ? `${baseName} ${sameNameCount + 1}` : baseName;
        const sceneKind: SceneKind = guideSceneChoice === "fantasy"
          ? "fantasy"
          : guideSceneChoice === "studio"
            ? "studio"
            : "environment";
        const sceneProfile = await window.studio.sceneWorkspace.create({
          projectId: selectedProjectId || undefined,
          name: sceneName,
          kind: sceneKind,
          lifecycle: "draft",
          anchor: nextCard.scene || guidedPlan.scene,
          layout: nextCard.camera,
          materials: nextCard.style,
          colorSystem: nextCard.lighting,
          requiredElements: [
            GUIDED_STORY_RELATIONSHIPS.find((item) => item.id === guideStoryPlan.relationship)?.label,
            momentLabel,
          ].filter(Boolean).join("；"),
          forbiddenChanges: mergeText(nextCard.mustKeep ?? "", nextCard.avoid),
        });
        const sceneState = await window.studio.sceneWorkspace.createState(sceneProfile.id, {
          name: `${momentLabel} · ${atmosphereLabel}`,
          status: "active",
          lighting: nextCard.lighting,
          atmosphere: atmosphereLabel,
          setDressing: nextCard.scene,
          continuityNotes: nextCard.mustKeep ?? "",
        });
        sceneWorkspace = await window.studio.sceneWorkspace.get(sceneProfile.id);
        setScenes((current) => [sceneProfile, ...current.filter((item) => item.id !== sceneProfile.id)]);
        setGuideSceneProfileId(sceneProfile.id);
        setSelectedSceneId(sceneProfile.id);
        if (sceneWorkspace) setSelectedSceneWorkspace(sceneWorkspace);
        setActiveSceneContext({ profileId: sceneProfile.id, stateId: sceneState.id });
        nextCard = { ...nextCard, sceneProfileId: sceneProfile.id };
      }
      const normalizedCard = normalizeCreativeCard(nextCard);
      if (saveAsCharacter) {
        const roleName = GUIDED_ROLES.find((item) => item.id === guideAppearance.role)?.label ?? "原创角色";
        const presetName = CREATION_PRESETS.find((item) => item.id === guidePresetId)?.label ?? "角色方案";
        const baseName = `${roleName} · ${presetName}`;
        const sameNameCount = characters.filter((item) => item.name === baseName || item.name.startsWith(`${baseName} `)).length;
        const name = sameNameCount ? `${baseName} ${sameNameCount + 1}` : baseName;
        const masterAssetId = guideMode === "reference" && referenceAsset ? referenceAsset.id : undefined;
        const profile = await window.studio.characters.create({
          name,
          card: normalizedCard,
          projectId: selectedProjectId || undefined,
          masterAssetId,
          group: "lead",
          lifecycle: "draft",
        });
        const factSync = await syncCharacterFactsFromCard(profile.id, normalizedCard);
        const baselineState = await window.studio.characterWorkspace.createState(profile.id, {
          name: "基础状态",
          kind: "baseline",
          status: "active",
          wardrobe: GUIDED_WARDROBES.find((item) => item.id === guideAppearance.wardrobe)?.label ?? "",
          hair: GUIDED_HAIR.find((item) => item.id === guideAppearance.hair)?.label ?? "",
          expression: GUIDED_EXPRESSIONS.find((item) => item.id === guideAppearance.expression)?.label ?? "",
          pose: GUIDED_POSES.find((item) => item.id === guideAppearance.pose)?.label ?? "",
          scene: GUIDED_SCENES.find((item) => item.id === guideSceneChoice)?.label ?? "",
          emotion: GUIDED_MOODS.find((item) => item.id === guideMoodChoice)?.label ?? "",
          continuityNotes: "沿用角色身份、脸部、发型与身体比例",
          trackers: [
            ...buildCharacterStateTrackers(guideTrackerIds, {
              mood: guideMoodChoice,
              scene: guideSceneChoice,
              wardrobe: guideAppearance.wardrobe,
            }),
            ...guideCustomTrackers.map((tracker) => ({ ...tracker, options: [...tracker.options] })),
          ],
        });
        const collection = await window.studio.collections.create({
          projectId: selectedProjectId || undefined,
          characterProfileId: profile.id,
          kind: "character",
          name: `${profile.name} · 角色资产包`,
          description: "角色创建器自动建立；用于归档定妆、服装、表情、动作、场景与后续母版。",
          status: "draft",
        });
        if (masterAssetId) await window.studio.collections.attachAsset(collection.id, masterAssetId, "身份主参考");
        setCard(normalizedCard);
        setCharacters((current) => [profile, ...current.filter((item) => item.id !== profile.id)]);
        setCollections((current) => [collection, ...current.filter((item) => item.id !== collection.id)]);
        setCharacterName(profile.name);
        setCharacterGroup(profile.group);
        setGuideCharacterId(profile.id);
        selectCharacter(profile.id);
        const workspace = await window.studio.characterWorkspace.get(profile.id);
        setSelectedCharacterWorkspace(workspace);
        setActiveCharacterContext({ profileId: profile.id, stateId: baselineState.id });
        clearCharacterCreationDraft();
        setRestoredCharacterDraftAt("");
        setActiveDomain("assets");
        setScreen("characters");
        setNotice(factSync.failed
          ? `角色资产「${profile.name}」已建立，但有 ${factSync.failed} 个人物细项同步失败，可继续补充。`
          : `角色资产「${profile.name}」已建立，${factSync.total} 个创作选择与 ${baselineState.trackers?.length ?? 0} 个持续状态已归档。`);
        return;
      }
      const taskInput = {
        projectId: selectedProjectId || savedCharacter?.projectId,
        characterProfileId: savedCharacter?.id,
        name: guidedPlan.taskName,
        objective: guidedPlan.objective,
        collectionIds: [...new Set([...characterCollectionIds, ...guideCollectionIds])],
        card: normalizedCard,
      };
      const savedDraft = guidedDraftTaskId
        ? creativeTasks.find((item) => item.id === guidedDraftTaskId)
        : undefined;
      const task = savedDraft
        ? await window.studio.tasks.update(savedDraft.id, taskInput)
        : await window.studio.tasks.create(taskInput);
      setCard(normalizedCard);
      setCreativeTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
      setActiveTaskId(task.id);
      setGuidedDraftTaskId(task.id);
      setActiveCreationPresetId(guidePresetId);
      if (!savedCharacter) {
        const presetName = CREATION_PRESETS.find((item) => item.id === guidePresetId)?.label ?? "新角色";
        setCharacterName(`${presetName}角色`);
      }
      setPromptBuild(await window.studio.creation.compilePrompt(normalizedCard));
      setTranslation(undefined);
      setShowAdvancedCreation(false);
      setShowPromptDetails(false);
      setShowReuseTools(false);
      setCreationStudioStage("plan");
      setSelectedLocalDirectionId("");
      setConfirmedLocalDirectionId("");
      setLocalRefinementApplied(false);
      if (savedCharacter) {
        selectCharacter(savedCharacter.id);
        try {
          const workspace = await window.studio.characterWorkspace.get(savedCharacter.id);
          if (workspace) {
            setSelectedCharacterWorkspace(workspace);
            setActiveCharacterContext({
              profileId: savedCharacter.id,
              versionId: workspace.activeVersion?.id,
              stateId: workspace.activeState?.id,
            });
          }
        } catch {
          setActiveCharacterContext({ profileId: savedCharacter.id });
        }
      } else setActiveCharacterContext(undefined);
      if (sceneWorkspace) {
        setSelectedSceneId(sceneWorkspace.scene.id);
        setSelectedSceneWorkspace(sceneWorkspace);
        setActiveSceneContext({
          profileId: sceneWorkspace.scene.id,
          versionId: sceneWorkspace.activeVersion?.id,
          stateId: sceneWorkspace.activeState?.id,
        });
      } else if (normalizedCard.sceneProfileId) {
        setActiveSceneContext({ profileId: normalizedCard.sceneProfileId });
      } else setActiveSceneContext(undefined);
      if (normalizedCard.referenceAssetIds[0]) setSelectedAssetId(normalizedCard.referenceAssetIds[0]);
      if (!stayInCreator) setScreen("creation");
      const missing = detail ? evaluateCharacterCoverage(detail, guidePurpose, selection).missingRequiredKeys.length : 0;
      if (stayInCreator) {
        setNotice("方案已保存，可继续调整；点击“进入创作台”后再创建候选。");
      } else if (missing) {
        setNotice(`角色仍缺 ${missing} 项必要证据，请补齐后再生成。`);
      } else if (canGenerateCurrentImage && generateCandidates) {
        await generatePreparedCandidateSet({
          targetCard: normalizedCard,
          taskId: task.id,
          characterProfileId: savedCharacter?.id,
          sceneProfileId: sceneWorkspace?.scene.id ?? normalizedCard.sceneProfileId,
        });
      } else {
        setNotice(creationLaunchKind === "series"
          ? "镜头计划已保存"
          : creationLaunchKind === "scene"
            ? "剧情场景与场景资产已建立"
            : "创作方案已建立；可继续编辑或在生产区创建候选。");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "建立创作方案失败。");
    } finally {
      setIsPreparingCreation(false);
    }
  };
  const completeGuidedCharacter = () => {
    const savedCharacter = characters.find((item) => item.id === guideCharacterId);
    if (guideMode === "saved" && savedCharacter) {
      clearCharacterCreationDraft();
      setRestoredCharacterDraftAt("");
      selectCharacter(savedCharacter.id);
      setActiveDomain("assets");
      setScreen("characters");
      setNotice(`已进入「${savedCharacter.name}」角色中枢，可继续扩展造型、表情、动作与剧情。`);
      return;
    }
    void beginGuidedCreation(false, false, true);
  };
  const saveCharacterFact = async (characterId: string, input: CharacterFactInput) => {
    const detail = await window.studio.characters.upsertFact(characterId, input);
    if (selectedCharacterIdRef.current !== characterId) return;
    setSelectedCharacterDetail(detail);
    await refreshCharacterRelations();
    setNotice(`已保存「${input.label ?? input.slotKey}」；只有已确认且证据有效的细项会进入新任务。`);
  };
  const addCharacterVariant = async (characterId: string, kind: CharacterVariantKind, name: string) => {
    const variant = await window.studio.characters.createVariant(characterId, kind, name);
    const detail = await window.studio.characters.detail(characterId);
    if (selectedCharacterIdRef.current !== characterId) return;
    setSelectedCharacterDetail(detail);
    setCharacterVariantSelections((current) => ({ ...current, [characterId]: { ...current[characterId], [kind]: variant.id } }));
    setNotice(`已新增「${name}」变体，基础身份设定保持不变。`);
  };
  const updateCharacterManagement = async (
    profile: CharacterProfile,
    patch: Partial<Pick<CharacterProfile, "group" | "lifecycle">>,
  ) => {
    try {
      const updated = await window.studio.characters.update(profile.id, patch);
      setCharacters((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(`已更新「${updated.name}」的角色归类。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "更新角色档案失败。\n");
    }
  };
  const listEligibleMasterAssets = async (projectId?: string): Promise<Asset[]> => {
    const all = await window.studio.assets.list({ projectId });
    const eligible = all.filter((asset) => asset.mediaType.startsWith("image/") &&
      asset.confirmation === "confirmed" && ["authorized", "original"].includes(asset.rightsStatus));
    if (projectId) return eligible;
    const projectsWithAssets = await window.studio.projects.list();
    const memberships = await Promise.all(projectsWithAssets.map((project) => window.studio.assets.list({ projectId: project.id })));
    const linkedIds = new Set(memberships.flat().map((asset) => asset.id));
    return eligible.filter((asset) => !linkedIds.has(asset.id));
  };
  const openMasterPicker = async (profile: CharacterProfile) => {
    const requestId = ++masterPickerRequestRef.current;
    const projectId = selectedProjectIdRef.current;
    setMasterPickerCharacterId(profile.id);
    setMasterChoiceId("");
    setMasterCandidateAssets([]);
    setMasterPickerError("");
    setMasterPickerLoading(true);
    try {
      const available = await listEligibleMasterAssets(profile.projectId);
      if (requestId !== masterPickerRequestRef.current || selectedProjectIdRef.current !== projectId) return;
      setMasterCandidateAssets(available);
    } catch (error) {
      if (requestId === masterPickerRequestRef.current && selectedProjectIdRef.current === projectId)
        setMasterPickerError(error instanceof Error ? error.message : "读取素材失败，请重试。");
    } finally {
      if (requestId === masterPickerRequestRef.current && selectedProjectIdRef.current === projectId) setMasterPickerLoading(false);
    }
  };
  const saveCharacterMaster = async (profile: CharacterProfile) => {
    const candidate = masterCandidateAssets.find((asset) => asset.id === masterChoiceId);
    if (masterPickerCharacterId !== profile.id || !candidate || selectedProjectIdRef.current !== selectedProjectId) return;
    setMasterSaving(true);
    try {
      const eligible = await listEligibleMasterAssets(profile.projectId);
      if (selectedProjectIdRef.current !== selectedProjectId) return;
      setMasterCandidateAssets(eligible);
      if (!eligible.some((asset) => asset.id === candidate.id)) {
        setMasterChoiceId("");
        setNotice("主参考图状态已变化，请重新选择已确认且权利可用的图片。");
        return;
      }
      const characterCollections = await window.studio.collections.list(profile.projectId);
      let collection = characterCollections.find((item) => item.kind === "character" && item.characterProfileId === profile.id && item.projectId === profile.projectId);
      if (!collection) {
        collection = await window.studio.collections.create({
          projectId: profile.projectId, characterProfileId: profile.id, kind: "character",
          name: `${profile.name} · 角色资产包`, description: "用于归档角色主参考与细项证据。", status: "draft",
        });
        if (selectedProjectIdRef.current === selectedProjectId) setCollections((current) => [collection!, ...current]);
      }
      await window.studio.collections.attachAsset(collection.id, candidate.id, "主参考");
      const updated = await window.studio.characters.update(profile.id, { masterAssetId: candidate.id });
      let mediaLinkWarning = "";
      try {
        const workspace = await window.studio.characterWorkspace.get(profile.id);
        await window.studio.characterWorkspace.attachMedia(profile.id, {
          versionId: workspace.activeVersion?.id,
          stateId: workspace.activeState?.id,
          assetId: candidate.id,
          role: "master",
        });
      } catch {
        mediaLinkWarning = "；主参考已保存，角色工作室血缘待补录";
      }
      if (profile.masterAssetId && profile.masterAssetId !== candidate.id)
        await window.studio.collections.attachAsset(collection.id, profile.masterAssetId, "历史参考");
      const updatedDetail = selectedCharacterIdRef.current === profile.id
        ? await window.studio.characters.detail(profile.id).catch(() => undefined)
        : undefined;
      if (selectedProjectIdRef.current !== selectedProjectId) return;
      setCharacters((current) => current.map((item) => item.id === profile.id ? updated : item));
      if (updatedDetail && selectedCharacterIdRef.current === profile.id) {
        setSelectedCharacterDetail(updatedDetail);
        setSelectedCharacterWorkspace(await window.studio.characterWorkspace.get(profile.id).catch(() => undefined));
      }
      setMasterPickerCharacterId("");
      setMasterChoiceId("");
      setNotice(`已为「${profile.name}」${profile.masterAssetId ? "更换" : "绑定"}主参考图「${candidate.name}」；它已归入角色资产包${mediaLinkWarning}。`);
    } catch (error) {
      if (selectedProjectIdRef.current === selectedProjectId)
        setNotice(error instanceof Error ? error.message : "绑定主参考图失败，请重试。");
    } finally {
      setMasterSaving(false);
    }
  };
  const saveCurrentTask = async () => {
    if (!activeTaskId) {
      setNotice("请先从“新建任务”建立本次创作基线。\n");
      return;
    }
    try {
      const normalizedCard = normalizeCreativeCard(card);
      setCard(normalizedCard);
      const updated = await window.studio.tasks.update(activeTaskId, { card: normalizedCard, status: "ready" });
      setCreativeTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice("当前创作任务已保存；生成、候选和母版将继续关联到它。\n");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存创作任务失败。\n");
    }
  };
  const openCreativeTask = async (task: CreativeTask) => {
    const requestId = ++creativeTaskOpenRequestRef.current;
    const nextCard = normalizeCreativeCard(task.card);
    const nextKind = resolveCreationKind(nextCard);
    setActiveTaskId(task.id);
    setCard(nextCard);
    setActiveCreationPresetId(
      CREATION_PRESETS.some((preset) => preset.id === nextCard.visualPresetId)
        ? nextCard.visualPresetId as CreationPresetId
        : undefined,
    );
    setCreationLaunchKind(nextKind);
    setPromptBuild(undefined);
    setTranslation(undefined);
    setSelectedCreationCandidateId(task.resultAssetId ?? "");
    setSelectedLocalDirectionId("");
    setConfirmedLocalDirectionId("");
    setLocalRefinementApplied(false);
    setCreationStudioStage(task.resultAssetId ? "asset" : "plan");
    setActiveDomain("creation");
    setScreen("creation");

    if (task.characterProfileId) {
      selectCharacter(task.characterProfileId);
      try {
        const workspace = await window.studio.characterWorkspace.get(task.characterProfileId);
        if (requestId !== creativeTaskOpenRequestRef.current) return;
        if (workspace) {
          setSelectedCharacterWorkspace(workspace);
          setActiveCharacterContext({
            profileId: task.characterProfileId,
            versionId: workspace.activeVersion?.id,
            stateId: workspace.activeState?.id,
          });
        } else setActiveCharacterContext({ profileId: task.characterProfileId });
      } catch {
        if (requestId === creativeTaskOpenRequestRef.current)
          setActiveCharacterContext({ profileId: task.characterProfileId });
      }
    } else {
      selectCharacter("");
      setActiveCharacterContext(undefined);
    }

    if (nextCard.sceneProfileId) {
      setSelectedSceneId(nextCard.sceneProfileId);
      try {
        const workspace = await window.studio.sceneWorkspace.get(nextCard.sceneProfileId);
        if (requestId !== creativeTaskOpenRequestRef.current) return;
        setSelectedSceneWorkspace(workspace);
        setActiveSceneContext({
          profileId: nextCard.sceneProfileId,
          versionId: workspace.activeVersion?.id,
          stateId: workspace.activeState?.id,
        });
      } catch {
        if (requestId === creativeTaskOpenRequestRef.current) {
          setSelectedSceneWorkspace(undefined);
          setActiveSceneContext({ profileId: nextCard.sceneProfileId });
        }
      }
    } else {
      setSelectedSceneId("");
      setSelectedSceneWorkspace(undefined);
      setActiveSceneContext(undefined);
    }
  };
  const compileCurrentShot = async () => {
    if (!shotCharacterId && !shotSceneId) {
      setNotice("请至少绑定一个角色或场景，再生成镜头合同。");
      return;
    }
    try {
      const nextShot = {
        ...shot,
        deliveryType: shotPurpose,
        keep: [...new Set([...shot.keep, shotContinuityNotes.trim()].filter(Boolean))],
      };
      setShot(nextShot);
      setShotBuild(await window.studio.creation.compileShot(nextShot));
    } catch (error) { setNotice(error instanceof Error ? error.message : "生成镜头合同失败。"); }
  };
  const startShotImageCreation = async () => {
    if (!selectedProjectId) { setNotice("请先选择镜头所属项目。"); return; }
    if (!shotCharacterId && !shotSceneId) { setNotice("请至少绑定一个角色或场景。"); return; }
    try {
      const characterDetail = shotCharacterId ? await window.studio.characters.detail(shotCharacterId) : undefined;
      const characterBase = characterDetail ? composeCharacterCard(characterDetail) : EMPTY_CARD;
      const characterWorkspace = shotCharacterId ? await window.studio.characterWorkspace.get(shotCharacterId) : undefined;
      const sceneWorkspace = shotSceneId ? await window.studio.sceneWorkspace.get(shotSceneId) : undefined;
      const sceneState = sceneWorkspace?.states.find((item) => item.id === shotSceneStateId) ?? sceneWorkspace?.activeState;
      const characterReferences = characterWorkspace?.media
        .filter((item) => item.asset.confirmation === "confirmed" && ["authorized", "original"].includes(item.asset.rightsStatus) && ["reference", "master"].includes(item.role))
        .map((item) => item.assetId) ?? [];
      const sceneReferences = sceneWorkspace?.media
        .filter((item) => item.asset.confirmation === "confirmed" && ["authorized", "original"].includes(item.asset.rightsStatus) && ["layout_reference", "lighting_reference", "material_reference", "master"].includes(item.role))
        .map((item) => item.assetId) ?? [];
      const sceneText = sceneWorkspace ? [sceneWorkspace.scene.anchor, sceneWorkspace.scene.layout, sceneWorkspace.scene.requiredElements,
        sceneState?.timeOfDay, sceneState?.weather, sceneState?.season, sceneState?.atmosphere, sceneState?.setDressing].filter(Boolean).join("；") : "";
      const nextCard = normalizeCreativeCard({
        ...characterBase,
        projectId: selectedProjectId,
        intent: `${shotName}：${shot.action || shot.startFrame || "完成镜头画面"}`,
        subject: characterBase.subject || (shotSceneId ? "场景主视觉" : shot.subjectAnchor),
        identityAnchor: mergeText(characterBase.identityAnchor, shot.subjectAnchor),
        expressionAndPose: mergeText(characterBase.expressionAndPose, shot.action),
        scene: mergeText(characterBase.scene, sceneText || shot.startFrame),
        lighting: mergeText(characterBase.lighting, sceneState?.lighting ?? ""),
        camera: mergeText(characterBase.camera, shot.cameraMotion),
        style: mergeText(characterBase.style, sceneWorkspace ? [sceneWorkspace.scene.materials, sceneWorkspace.scene.colorSystem].filter(Boolean).join("；") : ""),
        mustKeep: mergeText(characterBase.mustKeep ?? "", [...shot.keep, shotContinuityNotes, sceneState?.continuityNotes ?? ""].filter(Boolean).join("；")),
        avoid: mergeText(characterBase.avoid, [...shot.avoid, sceneWorkspace?.scene.forbiddenChanges ?? ""].filter(Boolean).join("；")),
        aspectRatio: shot.output.aspectRatio,
        referenceAssetIds: [...new Set([...characterBase.referenceAssetIds, ...shot.referenceAssetIds, ...characterReferences,
          ...sceneReferences, ...(selectedAssetId ? [selectedAssetId] : [])])],
      });
      setCard(nextCard);
      setActiveCharacterContext(shotCharacterId ? { profileId: shotCharacterId, versionId: shotCharacterVersionId || undefined, stateId: shotCharacterStateId || undefined } : undefined);
      setActiveSceneContext(shotSceneId ? { profileId: shotSceneId, versionId: shotSceneVersionId || undefined, stateId: shotSceneStateId || undefined } : undefined);
      if (characterWorkspace) { setSelectedCharacterId(characterWorkspace.character.id); setSelectedCharacterWorkspace(characterWorkspace); }
      if (sceneWorkspace) { setSelectedSceneId(sceneWorkspace.scene.id); setSelectedSceneWorkspace(sceneWorkspace); }
      setPromptBuild(await window.studio.creation.compilePrompt(nextCard));
      setTranslation(undefined);
      setActiveDomain("creation"); setScreen("creation");
      setNotice(`已将「${shotName}」的角色、场景和连续性约束带入图片创作。`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "镜头转图片创作失败。"); }
  };
  const startVideo = async () => {
    if (!shotBuild) {
      setNotice("请先生成镜头合同。");
      return;
    }
    try {
      const job = await window.studio.generation.video({
        prompt: shotBuild,
        projectId: selectedProjectId || undefined,
        referenceAssetId: selectedAssetId || undefined,
        aspectRatio: shot.output.aspectRatio,
        seconds: shot.durationSeconds as 4 | 8 | 12,
      });
      setJobs((current) => [job, ...current]);
      setScreen("jobs");
      setNotice("视频任务已提交；在生成队列中刷新状态并自动归档。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "视频任务创建失败。");
    }
  };
  const saveShotPlan = async () => {
    if (!selectedProjectId) {
      setNotice("请先在资产工作台选择一个项目，再保存镜头。");
      return;
    }
    if (!shotBuild) {
      setNotice("请先生成镜头合同。");
      return;
    }
    try {
      const nextShot = { ...shot, deliveryType: shotPurpose, keep: [...new Set([...shot.keep, shotContinuityNotes.trim()].filter(Boolean))] };
      const compiledPrompt = await window.studio.creation.compileShot(nextShot);
      const plan = await window.studio.shots.create({
        projectId: selectedProjectId,
        name: shotName,
        shot: nextShot,
        compiledPrompt,
        referenceAssetId: selectedAssetId || undefined,
        purpose: shotPurpose,
        status: "ready",
        creativeTaskId: activeTaskId || undefined,
        characterProfileId: shotCharacterId || undefined,
        characterVersionId: shotCharacterVersionId || undefined,
        characterStateId: shotCharacterStateId || undefined,
        sceneProfileId: shotSceneId || undefined,
        sceneVersionId: shotSceneVersionId || undefined,
        sceneStateId: shotSceneStateId || undefined,
        continuityNotes: shotContinuityNotes,
      });
      setShot(nextShot);
      setShotBuild(compiledPrompt);
      setShotPlans((current) => [...current, plan]);
      setNotice(`已保存「${plan.name}」，可继续添加下一个镜头。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存镜头失败。");
    }
  };
  const loadShotPlan = (plan: ShotPlan) => {
    setShot(plan.shot);
    setShotName(plan.name);
    setShotBuild(plan.compiledPrompt);
    setSelectedAssetId(plan.referenceAssetId ?? "");
    setShotPurpose(plan.purpose);
    setShotContinuityNotes(plan.continuityNotes);
    setShotCharacterId(plan.characterProfileId ?? "");
    setShotCharacterVersionId(plan.characterVersionId ?? "");
    setShotCharacterStateId(plan.characterStateId ?? "");
    setShotSceneId(plan.sceneProfileId ?? "");
    setShotSceneVersionId(plan.sceneVersionId ?? "");
    setShotSceneStateId(plan.sceneStateId ?? "");
    setNotice(`已加载「${plan.name}」。`);
  };
  const exportSelectedProject = async () => {
    if (!selectedProjectId) {
      setNotice("请先在资产工作台选择一个项目，再导出资产包。");
      return;
    }
    const directory = await window.studio.selectDirectory();
    if (!directory) return;
    try {
      const output = await window.studio.projects.export(
        selectedProjectId,
        directory,
      );
      setNotice(`项目资产包已导出到：${output}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "项目导出失败。");
    }
  };
  const createLocalBackup = async () => {
    const directory = await window.studio.selectDirectory();
    if (!directory) return;
    try {
      const output = await window.studio.data.createBackup(directory);
      setNotice(`本机数据备份已完成：${output}`);
    } catch (error) {
      setNotice(error instanceof Error ? `备份失败：${error.message}` : "备份失败，请检查目标位置。");
    }
  };
  const restoreLocalBackup = async () => {
    const directory = await window.studio.selectDirectory();
    if (!directory || !window.confirm("恢复会先保留当前数据快照，再替换本机数据库和素材目录；完成后必须退出并重新打开应用。确定继续吗？")) return;
    try {
      const result = await window.studio.data.restoreBackup(directory);
      setNotice(`恢复完成。当前数据已保存在 ${result.recoveryDirectory}；请退出并重新打开应用使恢复生效。`);
    } catch (error) {
      setNotice(error instanceof Error ? `恢复失败：${error.message}` : "恢复失败，原数据未被主动删除。");
    }
  };
  const saveProjectBrief = async () => {
    if (!selectedProjectId) return;
    try {
      const project = await window.studio.projects.updateBrief(
        selectedProjectId,
        projectBrief,
      );
      setProjects((current) =>
        current.map((item) => (item.id === project.id ? project : item)),
      );
      const workspace = await window.studio.projects.workspace(project.id);
      setProjectWorkspace(workspace);
      setNotice("项目简报已保存；后续创作卡、候选评审和导出都会以它作为验收基线。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存项目简报失败。");
    }
  };
  const setSelectedAssetAsMaster = async (targetAsset: Asset | undefined = selectedAsset) => {
    if (!targetAsset) return;
    try {
      await window.studio.assets.setMaster(targetAsset.id, true, selectedProjectId || undefined);
      const taskId = batchForSelectedAsset?.creativeTaskId || activeTaskId;
      if (taskId) {
        const task = await window.studio.tasks.update(taskId, {
          status: "completed",
          resultAssetId: targetAsset.id,
        });
        setCreativeTasks((current) =>
          current.map((item) => (item.id === task.id ? task : item)),
        );
        setActiveTaskId(task.id);
      }
      await refresh();
      setNotice("已锁定为项目母版；它会成为后续场景、镜头和视频的优先参考。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "锁定母版失败。");
    }
  };
  const saveCandidateAsCharacter = async (targetAsset: Asset | undefined = selectedAsset) => {
    if (!targetAsset) return;
    if (targetAsset.confirmation !== "confirmed" || !["authorized", "original"].includes(targetAsset.rightsStatus)) {
      setNotice("候选需先完成审片并确认使用权，才能沉淀为角色资产。");
      return;
    }
    if (activeTask?.characterProfileId) {
      setNotice("当前创作任务已经关联角色资产，无需重复建立。");
      return;
    }
    try {
      const sourceCard = activeTask?.card ?? card;
      const referenceBindings = [
        { assetId: targetAsset.id, role: "identity" as const, priority: "primary" as const },
        ...(sourceCard.referenceBindings ?? [])
          .filter((binding) => binding.assetId !== targetAsset.id)
          .map((binding) => binding.role === "identity" && binding.priority === "primary"
            ? { ...binding, priority: "support" as const }
            : binding),
      ];
      const characterCard: CreativeCard = {
        ...sourceCard,
        projectId: selectedProjectId || sourceCard.projectId,
        referenceAssetIds: [...new Set([targetAsset.id, ...sourceCard.referenceAssetIds])],
        referenceBindings,
        mustKeep: mergeText(sourceCard.mustKeep ?? "", "此候选已成为角色主参考；后续创作必须保持脸部结构、发型、成年体态与核心造型识别。"),
      };
      await window.studio.assets.setMaster(targetAsset.id, true, selectedProjectId || undefined);
      const baseName = (activeTask?.name || sourceCard.intent || "原创角色").trim().slice(0, 28);
      const profile = await window.studio.characters.create({
        name: baseName.endsWith("角色") ? baseName : `${baseName} · 角色`,
        card: characterCard,
        projectId: selectedProjectId || undefined,
        masterAssetId: targetAsset.id,
        group: "lead",
        lifecycle: "draft",
      });
      const collection = await window.studio.collections.create({
        projectId: selectedProjectId || undefined,
        characterProfileId: profile.id,
        kind: "character",
        name: `${profile.name} · 角色资产包`,
        description: "由创作候选沉淀；继续补充多角度、表情、造型、动作与场景延展。",
        status: "draft",
      });
      await window.studio.collections.attachAsset(collection.id, targetAsset.id, "角色主参考");
      setCharacters((current) => [profile, ...current.filter((item) => item.id !== profile.id)]);
      setCollections((current) => [collection, ...current.filter((item) => item.id !== collection.id)]);
      if (activeTask) {
        const task = await window.studio.tasks.update(activeTask.id, {
          characterProfileId: profile.id,
          collectionIds: [...new Set([...activeTask.collectionIds, collection.id])],
          card: characterCard,
          resultAssetId: targetAsset.id,
        });
        setCreativeTasks((current) => current.map((item) => item.id === task.id ? task : item));
      }
      setCard(characterCard);
      setGuideCharacterId(profile.id);
      await refresh();
      setNotice(`已建立角色资产「${profile.name}」，主参考、资产包与当前创作任务已联动。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "建立角色资产失败。");
    }
  };
  const openDomain = (
    domain: "creation" | "assets" | "production" | "templates",
  ) => {
    setNotice("");
    setActiveDomain(domain);
    setScreen(
      domain === "creation"
        ? "workspace"
        : domain === "assets"
          ? "characters"
          : domain === "production"
            ? "production"
            : "recipes",
    );
  };
  const domainSections = {
    creation: [["workspace", "项目总览"], ["creation", "当前创作卡"]],
    assets: [["characters", "角色档案"], ["scenes", "场景档案"], ["collections", "资产包"], ["assets", "素材库"]],
    production: [["production", "批量生产"], ["shot", "镜头工作室"], ["review", "审片与母版"], ["jobs", "生成队列"]],
    templates: [["recipes", "方法卡"], ["paradigms", "画面范式"], ["learning", "学习收件箱"]],
  } as const;
  const workspaceNextAction = (() => {
    if (!projectWorkspace) return { label: "查看项目状态", target: "workspace" as const, hint: "正在读取项目状态。" };
    const blocker = projectWorkspace.blockers?.[0];
    if (blocker) return { label: "立即处理", target: blocker.target, hint: `${blocker.label}：${blocker.detail}` };
    const stage = projectWorkspace.pipeline?.find((item) => item.status !== "complete");
    if (stage) return { label: stage.nextAction, target: stage.target, hint: stage.summary };
    return { label: "继续下一条创作", target: "start" as const, hint: projectWorkspace.recommendedNextAction };
  })();
  const openPipelineTarget = (target: ProjectWorkspace["pipeline"][number]["target"]) => {
    setNotice("");
    setActiveDomain(
      ["workspace", "start", "creation"].includes(target) ? "creation"
        : ["characters", "assets"].includes(target) ? "assets"
          : ["shot", "review", "jobs"].includes(target) ? "production"
            : "templates",
    );
    setScreen(target);
    if (target === "workspace") requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".brief-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const currentCreationPreset = activeCreationPresetId
    ? CREATION_PRESETS.find((item) => item.id === activeCreationPresetId)
    : undefined;
  const cardVisualPresetId = CREATION_PRESETS.some((item) => item.id === card.visualPresetId)
    ? card.visualPresetId as CreationPresetId
    : undefined;
  const localDirectionPreviewSrc = activeCreationReferencePreview
    ?? (activeCreationPresetId ? CREATION_PRESET_ARTWORKS[activeCreationPresetId] : undefined)
    ?? (cardVisualPresetId ? CREATION_PRESET_ARTWORKS[cardVisualPresetId] : undefined);
  const currentCharacterExtension = card.characterExtension
    ? CHARACTER_EXTENSION_OPTIONS.find((item) => item.id === card.characterExtension?.kind)
    : undefined;
  const currentExtensionState = card.characterExtension && selectedCharacterWorkspace?.character.id === card.characterExtension.sourceCharacterId
    ? selectedCharacterWorkspace.states.find((item) => item.id === card.characterExtension?.sourceStateId)
    : undefined;
  const activeCharacterExtensionSceneId = card.sceneDirectionId
    ?? GUIDED_SCENES.find((item) => item.id !== "custom" && (card.scene.includes(item.label) || card.scene.includes(item.prompt)))?.id;
  const characterExtensionNeedsScene = Boolean(
    card.characterExtension
    && ["story_scene", "dialogue_scene"].includes(card.characterExtension.kind)
    && !card.sceneProfileId
    && !card.scene.trim(),
  );
  const isStoryExtensionPlan = Boolean(
    card.characterExtension
    && ["story_scene", "dialogue_scene"].includes(card.characterExtension.kind),
  );
  const currentCreationPlanItems = currentCharacterExtension && card.characterExtension ? [
    { label: "人物", value: selectedCharacterWorkspace?.character.name ?? characterName ?? "已锁定角色" },
    {
      label: "造型",
      value: card.characterExtension.kind === "wardrobe_set"
        ? "4 套造型"
        : currentExtensionState?.wardrobe || "沿用角色造型",
    },
    {
      label: "场景",
      value: ["story_scene", "series_pack", "dialogue_scene", "dynamic_keyframe"].includes(card.characterExtension.kind)
        ? GUIDED_SCENES.find((item) => item.id === activeCharacterExtensionSceneId)?.label
          || currentExtensionState?.scene
          || (characterExtensionNeedsScene ? "请选择场景" : "沿用当前场景")
        : "保持当前背景",
    },
    { label: "结果", value: currentCharacterExtension.result },
  ] : card.storyPlan ? [
    { label: "关系", value: GUIDED_STORY_RELATIONSHIPS.find((item) => item.id === card.storyPlan?.relationshipId)?.label ?? "人物关系" },
    { label: "事件", value: GUIDED_STORY_MOMENTS.find((item) => item.id === card.storyPlan?.momentId)?.label ?? "剧情瞬间" },
    { label: "节拍", value: GUIDED_STORY_PACING.find((item) => item.id === card.storyPlan?.pacingId)?.label ?? "叙事节拍" },
    { label: "氛围", value: GUIDED_STORY_ATMOSPHERES.find((item) => item.id === card.storyPlan?.atmosphereId)?.label ?? "空间氛围" },
  ] : [
    {
      label: "人物",
      value: guideMode === "saved"
        ? characters.find((item) => item.id === guideCharacterId)?.name ?? "已有角色"
        : GUIDED_ROLES.find((item) => item.id === guideAppearance.role)?.label
          ?? GUIDED_SUBJECTS.find((item) => item.id === guideSubjectChoice)?.label
          ?? "原创角色",
    },
    { label: "造型", value: GUIDED_WARDROBES.find((item) => item.id === guideAppearance.wardrobe)?.label ?? "当前造型" },
    { label: "场景", value: GUIDED_SCENES.find((item) => item.id === guideSceneChoice)?.label ?? "当前场景" },
    { label: "画面", value: `${GUIDED_SHOTS.find((item) => item.id === guideShotChoice)?.label ?? "人物画面"} · ${GUIDED_VISUAL_STYLES.find((item) => item.id === guideVisualStyle)?.label ?? "默认风格"}` },
  ];
  const creationWorkspaceCopy = ({
    portrait: { eyebrow: "单张画面", title: "单张创作台", emptyTitle: "画面方案已保存", emptyDescription: "确认人物与画面方向后，再生成候选。", pendingTitle: "先生成并选择画面" },
    cover: { eyebrow: "封面画面", title: "封面创作台", emptyTitle: "封面方向已保存", emptyDescription: "确认主体和版式方向后，再生成候选。", pendingTitle: "先生成并选择封面" },
    character_sheet: { eyebrow: "角色设定", title: "角色设定台", emptyTitle: "角色方案已保存", emptyDescription: "确认身份与结构后，再生成角色候选。", pendingTitle: "先生成并选择角色" },
    story_scene: { eyebrow: "剧情场景", title: "场景创作台", emptyTitle: "剧情方案已保存", emptyDescription: "确认人物、动作与场景关系后，再生成候选。", pendingTitle: "先生成并选择场景" },
    series_pack: { eyebrow: "系列镜头", title: "系列镜头台", emptyTitle: "镜头计划已保存", emptyDescription: "四个镜头会按当前顺序生成并保持角色连续。", pendingTitle: "先生成整组镜头" },
    dynamic_keyframe: { eyebrow: "动态关键帧", title: "关键帧创作台", emptyTitle: "动作方案已保存", emptyDescription: "确认动作方向和运动空间后，再生成关键帧。", pendingTitle: "先生成并选择关键帧" },
  } satisfies Record<CreativeDeliveryMode, { eyebrow: string; title: string; emptyTitle: string; emptyDescription: string; pendingTitle: string }>)[card.deliveryMode ?? "portrait"];
  const creationStudioKind: CreationLaunchKind = resolveCreationKind(card);
  const creationPlanStatus = ({
    character: "角色方案已建立",
    image: "单张画面方案已建立",
    scene: card.sceneProfileId ? "剧情场景与场景资产已建立" : "剧情场景方案已建立",
    series: "系列镜头计划已建立",
  } satisfies Record<CreationLaunchKind, string>)[creationStudioKind];
  const creationAssetCopy = ({
    character: { title: "角色方案已经可以复用", description: "身份、造型和本轮调整已保存，可继续扩展角色资产。", status: "角色方案" },
    image: { title: "单张画面方案已经归档", description: "人物、场景、构图和本轮调整已保存，可从同一方案继续创作。", status: "画面方案" },
    scene: card.sceneProfileId
      ? { title: "剧情与场景资产已经归档", description: "空间锚点、剧情骨架和场景状态已绑定，可继续扩展连续镜头。", status: "场景资产" }
      : { title: "剧情方向已经确认", description: "把当前方向沉淀为场景资产后，可以继续管理空间、状态和连续镜头。", status: "待保存场景" },
    series: { title: "系列镜头计划已经归档", description: "角色基线、镜头顺序和连续性约束已保存，可直接进入生产准备。", status: "镜头计划" },
  } satisfies Record<CreationLaunchKind, { title: string; description: string; status: string }>)[creationStudioKind];
  const localDirectionCandidates = buildCandidateVariations(
    4,
    card.deliveryMode ?? guideDirection,
    card.candidatePlan,
  );
  const effectiveLocalDirectionId = localDirectionCandidates.some((item) => item.id === selectedLocalDirectionId)
    ? selectedLocalDirectionId
    : localDirectionCandidates[0]?.id ?? "";
  const selectedLocalDirection = localDirectionCandidates.find((item) => item.id === effectiveLocalDirectionId);
  const activeCreationRefinements = getCreationRefinements(card.deliveryMode);
  const creationJourneyAvailable: CreationStudioStage[] = selectedCreationCandidate || confirmedLocalDirectionId
    ? ["plan", "candidates", "refine", "asset"]
    : ["plan", "candidates", "refine"];
  const creationJourneyCompleted: CreationStudioStage[] = [
    "plan",
    ...(activeTaskCandidates.length || confirmedLocalDirectionId ? ["candidates" as const] : []),
    ...(selectedCreationCandidate || localRefinementApplied ? ["refine" as const] : []),
    ...(selectedCreationCandidate?.confirmation === "confirmed" || (creationStudioStage === "asset" && Boolean(confirmedLocalDirectionId)) ? ["asset" as const] : []),
  ];

  const openCreationLaunchpad = () => {
    setNotice("");
    setGuidedDraftTaskId("");
    setActiveDomain("creation");
    setCreationStudioStage("plan");
    setSelectedLocalDirectionId("");
    setConfirmedLocalDirectionId("");
    setLocalRefinementApplied(false);
    setScreen("launch");
  };

  const returnToCreationSetup = () => {
    if (card.characterExtension) {
      setActiveDomain("assets");
      selectCharacter(card.characterExtension.sourceCharacterId);
      setScreen("characters");
      return;
    }
    if (card.deliveryMode === "series_pack" && card.candidatePlan?.length) {
      setCreationLaunchKind("series");
      setGuideDirection("series_pack");
      setCreationCandidateCount(4);
      setSeriesCandidatePlan(card.candidatePlan.map((item) => ({ ...item })));
    }
    if (card.deliveryMode === "story_scene" && card.storyPlan) {
      setCreationLaunchKind("scene");
      setGuideDirection("story_scene");
      setGuideStoryPlan({
        relationship: card.storyPlan.relationshipId as GuidedStoryPlan["relationship"],
        moment: card.storyPlan.momentId as GuidedStoryPlan["moment"],
        pacing: card.storyPlan.pacingId as GuidedStoryPlan["pacing"],
        atmosphere: card.storyPlan.atmosphereId as GuidedStoryPlan["atmosphere"],
      });
    }
    setScreen("start");
  };

  const applyCharacterCreationDraft = (draft: CharacterCreationDraft) => {
    setCreationLaunchKind("character");
    setGuideMode(draft.sourceMode);
    setGuidePresetId(draft.presetId);
    setGuideDirection(draft.direction);
    setGuideCharacterId(draft.characterId);
    setGuideReferenceAssetId(draft.referenceAssetId);
    setGuideSceneProfileId(draft.sceneProfileId);
    setGuideSubjectChoice(draft.subject);
    setGuideSubject(draft.customSubject);
    // 旧草稿缺少新字段时补齐默认值，避免升级后把用户已选内容判成无效。
    setGuideAppearance({ ...DEFAULT_GUIDED_APPEARANCE, ...draft.appearance });
    setGuideSceneChoice(draft.scene);
    setGuideScene(draft.customScene);
    setGuideMoodChoice(draft.mood);
    setGuideShotChoice(draft.shot);
    setGuideVisualStyle(draft.visualStyle);
    setGuideAspectRatio(draft.aspectRatio);
    setGuideConstraints([...draft.constraints]);
    setGuideTrackerIds([...draft.trackerIds]);
    setGuideCustomTrackers(draft.customTrackers.map((tracker) => ({ ...tracker, options: [...tracker.options] })));
    setGuidePurpose(draft.purpose);
    setQualityTier(draft.qualityTier);
    setRestoredCharacterDraftAt(draft.updatedAt);
    setScreen("start");
    setNotice("");
  };

  const restartCharacterCreation = () => {
    clearCharacterCreationDraft();
    setCreationLaunchKind("character");
    setGuideMode("new");
    setGuidePresetId("oriental_moon");
    setGuideDirection("character_sheet");
    setGuideCharacterId("");
    setGuideReferenceAssetId("");
    setGuideSceneProfileId("");
    setGuideSubjectChoice("adult_woman");
    setGuideSubject("");
    setGuideAppearance({ ...DEFAULT_GUIDED_APPEARANCE });
    setGuideSceneChoice("ancient_east");
    setGuideScene("");
    setGuideMoodChoice("cool");
    setGuideShotChoice("character_sheet");
    setGuideVisualStyle("photoreal");
    setGuideAspectRatio("2:3");
    setGuideConstraints(["identity", "body", "hair", "wardrobe", "skin", "no_text"]);
    setGuideTrackerIds([...DEFAULT_CHARACTER_TRACKER_IDS]);
    setGuideCustomTrackers([]);
    setGuidePurpose("portrait");
    setQualityTier("premium");
    setRestoredCharacterDraftAt("");
    setNotice("已开始新的角色方案；选择会自动保存。");
  };

  const startCreationFlow = (kind: CreationLaunchKind) => {
    if (kind === "character") {
      const draft = loadCharacterCreationDraft();
      if (draft) {
        applyCharacterCreationDraft(draft);
        return;
      }
    }
    setCreationLaunchKind(kind);
    setGuideMode("new");
    setGuideCharacterId("");
    setGuideReferenceAssetId("");
    setGuideSceneProfileId("");
    setCreationCandidateCount(kind === "series" ? 4 : 2);
    setSeriesCandidatePlan(createDefaultSeriesPlan());
    setGuideStoryPlan({ ...DEFAULT_GUIDED_STORY_PLAN });
    setGuideTrackerIds([...DEFAULT_CHARACTER_TRACKER_IDS]);
    setGuideCustomTrackers([]);
    setRestoredCharacterDraftAt("");
    if (kind === "character") {
      setGuideAspectRatio("2:3");
      setGuideDirection("character_sheet");
      setGuideShotChoice("character_sheet");
      setGuideConstraints(["identity", "body", "hair", "wardrobe", "skin", "no_text"]);
    } else if (kind === "scene") {
      setGuideAspectRatio("16:9");
      setGuideDirection("story_scene");
      setGuideShotChoice("full_body");
      setGuideConstraints(["identity", "body", "hair", "skin", "no_text"]);
    } else if (kind === "series") {
      setGuideAspectRatio("9:16");
      setGuideDirection("series_pack");
      setGuideShotChoice("full_body");
      setGuideConstraints(["identity", "body", "hair", "wardrobe", "skin", "no_text"]);
    } else {
      setGuideAspectRatio("2:3");
      setGuideDirection("portrait");
      setGuideShotChoice("half_body");
      setGuideConstraints(["identity", "skin", "no_text"]);
    }
    setScreen("start");
  };

  return (
    <div className={`app-shell ${screen === "start" || screen === "launch" ? "creator-focus-shell" : ""}`}>
      {screen !== "start" && screen !== "launch" && <AdaptiveDomainNavigation
        activeDomain={activeDomain}
        connected={connected}
        onNavigate={openDomain}
        onOpenSettings={() => setScreen("settings")}
      />}
      <div className="app-main">
        {screen !== "start" && screen !== "launch" && <header className="context-bar">
          <div className="context-heading">
            <span className="context-domain">当前项目</span>
            <strong>{projectName ?? "全部项目"}</strong>
            {activeTask && (
              <span className="context-task" title={activeTask.objective}>
                当前任务：{activeTask.name} · {taskStatusLabel(activeTask.status)}
              </span>
            )}
          </div>
          <div className="context-actions">
            <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} aria-label="当前项目">
              <option value="">全部项目</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <button className="header-create" onClick={openCreationLaunchpad}>新建创作任务</button>
            <nav className="domain-subnav" aria-label="当前工作域功能">
              {domainSections[activeDomain].map(([target, label]) => <button key={target} className={screen === target ? "selected" : ""} onClick={() => { setNotice(""); setScreen(target); }}>{label}</button>)}
            </nav>
          </div>
        </header>}
      <main id="main-content" tabIndex={-1}>
      {screen === "launch" && (
        <CreationLaunchpad
          characterCount={characters.length}
          sceneCount={scenes.length}
          referenceCount={selectableImages.length}
          onSelect={startCreationFlow}
          onExit={() => setScreen("workspace")}
        />
      )}
      {screen === "start" && (
        <>
        <VisualCharacterCreator
          creationKind={creationLaunchKind}
          presetId={guidePresetId}
          onPresetChange={setGuidePresetId}
          direction={guideDirection}
          onDirectionChange={(direction) => {
            setGuideDirection(direction);
            if (direction === "character_sheet") setGuideShotChoice("character_sheet");
            else if (direction === "series_pack") {
              setGuideShotChoice("full_body");
              setCreationCandidateCount(4);
            } else if (direction === "dynamic_keyframe") {
              setGuideShotChoice("full_body");
              setCreationCandidateCount(2);
            } else if (guideShotChoice === "character_sheet") setGuideShotChoice(direction === "story_scene" ? "full_body" : "half_body");
          }}
          sourceMode={guideMode}
          onSourceModeChange={setGuideMode}
          subject={guideSubjectChoice}
          onSubjectChange={setGuideSubjectChoice}
          appearance={guideAppearance}
          onAppearanceChange={(key, value) => setGuideAppearance((current) => ({ ...current, [key]: value }))}
          scene={guideSceneChoice}
          onSceneChange={setGuideSceneChoice}
          mood={guideMoodChoice}
          onMoodChange={setGuideMoodChoice}
          storyPlan={guideStoryPlan}
          onStoryPlanChange={(key, value) => setGuideStoryPlan((current) => ({ ...current, [key]: value }))}
          shot={guideShotChoice}
          onShotChange={setGuideShotChoice}
          visualStyle={guideVisualStyle}
          onVisualStyleChange={setGuideVisualStyle}
          constraints={guideConstraints}
          onConstraintToggle={(value) => setGuideConstraints((current) => current.includes(value) ? current.filter((id) => id !== value) : [...current, value])}
          trackerIds={guideTrackerIds}
          onTrackerToggle={(value) => setGuideTrackerIds((current) => current.includes(value) ? current.filter((id) => id !== value) : [...current, value])}
          customTrackers={guideCustomTrackers}
          onCustomTrackersChange={setGuideCustomTrackers}
          characters={characters}
          characterId={guideCharacterId}
          onCharacterChange={setGuideCharacterId}
          characterDetail={guideCharacterDetail}
          purpose={guidePurpose}
          onPurposeChange={setGuidePurpose}
          variantSelections={characterVariantSelections[guideCharacterId] ?? {}}
          onVariantChange={(kind, value) => setCharacterVariantSelections((current) => ({ ...current, [guideCharacterId]: { ...current[guideCharacterId], [kind]: value } }))}
          referenceAssets={selectableImages}
          referenceAssetId={guideReferenceAssetId}
          onReferenceAssetChange={setGuideReferenceAssetId}
          scenes={scenes}
          sceneProfileId={guideSceneProfileId}
          onSceneProfileChange={setGuideSceneProfileId}
          customSubject={guideSubject}
          onCustomSubjectChange={setGuideSubject}
          customScene={guideScene}
          onCustomSceneChange={setGuideScene}
          previewAssetId={guideMode === "saved" ? characters.find((item) => item.id === guideCharacterId)?.masterAssetId : guideMode === "reference" ? guideReferenceAssetId : undefined}
          preparing={isPreparingCreation || isGeneratingCandidates}
          canGenerate={canGenerateCurrentImage}
          candidateCount={creationCandidateCount}
          onCandidateCountChange={setCreationCandidateCount}
          seriesPlan={seriesCandidatePlan}
          onSeriesPlanChange={setSeriesCandidatePlan}
          qualityTier={qualityTier}
          onQualityTierChange={(value) => { setQualityTier(value); setTranslation(undefined); }}
          aspectRatio={guideAspectRatio}
          onAspectRatioChange={setGuideAspectRatio}
          onCreate={() => void beginGuidedCreation(false)}
          onSave={() => void beginGuidedCreation(false, true)}
          onSaveCharacter={completeGuidedCharacter}
          onExit={() => setScreen("workspace")}
          draftRestoredAt={restoredCharacterDraftAt}
          onRestart={restartCharacterCreation}
          onOpenSettings={() => setScreen("settings")}
          notice={notice}
            onNoticeDismiss={() => setNotice("")}
        />
        {false && (
        <section className="workspace creation-launch-workspace">
          <header className="workspace-header">
            <div>
              <p className="eyebrow">创作流水线</p>
              <h2>选几项，直接进入出图</h2>
              <p className="result-note">系统自动组装提示词、参考资产、画幅和质量约束。</p>
            </div>
          </header>
          <ol className="creation-pipeline" aria-label="创作流程">
            <li className="pipeline-active"><span>1</span><strong>选择方向</strong><small>当前</small></li>
            <li><span>2</span><strong>自动组装</strong><small>系统完成</small></li>
            <li><span>3</span><strong>生成候选</strong><small>选出最佳</small></li>
            <li><span>4</span><strong>审片入库</strong><small>沉淀资产</small></li>
          </ol>
          <section className="creation-launch-grid" aria-label="快速创作">
            <article className="creation-brief-card">
              <div className="creation-question">
                <div className="creation-section-heading"><span>1. 做什么</span><small>选择交付类型</small></div>
                <div className="direction-grid" role="group" aria-label="画面方向">
                  {CREATION_DIRECTIONS.map((direction) => (
                    <button
                      key={direction.id}
                      type="button"
                      aria-pressed={guideDirection === direction.id}
                      className={guideDirection === direction.id ? "direction-card direction-selected" : "direction-card"}
                      onClick={() => {
                        setGuideDirection(direction.id);
                        if (direction.id === "character_sheet") setGuideShotChoice("character_sheet");
                        else if (guideShotChoice === "character_sheet") setGuideShotChoice(direction.id === "story_scene" ? "full_body" : "half_body");
                      }}
                    >
                      <strong>{direction.label}</strong>
                      <small>{direction.description}</small>
                    </button>
                  ))}
                </div>
              </div>
              {guideMode === "new" && <div className="creation-question">
                <div className="creation-section-heading"><span>2. 画谁</span><small>原创主体</small></div>
                <div className="choice-chip-grid" role="group" aria-label="人物主体">
                  {GUIDED_SUBJECTS.map((option) => <button type="button" key={option.id} aria-pressed={guideSubjectChoice === option.id} className={guideSubjectChoice === option.id ? "choice-chip choice-selected" : "choice-chip"} onClick={() => setGuideSubjectChoice(option.id)}>{option.label}</button>)}
                </div>
                {guideSubjectChoice === "custom" && <input autoFocus aria-label="自定义主体" value={guideSubject} onChange={(event) => setGuideSubject(event.target.value)} placeholder="只补充系统没有的主体" />}
              </div>}
              <div className="creation-question">
                <div className="creation-section-heading"><span>{guideMode === "new" ? "3" : "2"}. 在哪里</span><small>选择场景世界</small></div>
                <div className="choice-chip-grid" role="group" aria-label="场景世界">
                  {GUIDED_SCENES.map((option) => <button type="button" key={option.id} aria-pressed={guideSceneChoice === option.id} className={guideSceneChoice === option.id ? "choice-chip choice-selected" : "choice-chip"} onClick={() => setGuideSceneChoice(option.id)}>{option.label}</button>)}
                </div>
                {guideSceneChoice === "custom" && <input autoFocus aria-label="自定义场景" value={guideScene} onChange={(event) => setGuideScene(event.target.value)} placeholder="只补充系统没有的场景" />}
              </div>
              <div className="creation-question split-question">
                <div>
                  <div className="creation-section-heading"><span>{guideMode === "new" ? "4" : "3"}. 什么感觉</span></div>
                  <div className="choice-chip-grid" role="group" aria-label="画面气质">
                    {GUIDED_MOODS.map((option) => <button type="button" key={option.id} aria-pressed={guideMoodChoice === option.id} className={guideMoodChoice === option.id ? "choice-chip choice-selected" : "choice-chip"} onClick={() => setGuideMoodChoice(option.id)}>{option.label}</button>)}
                  </div>
                </div>
                <div>
                  <div className="creation-section-heading"><span>{guideMode === "new" ? "5" : "4"}. 怎么拍</span></div>
                  <div className="choice-chip-grid" role="group" aria-label="镜头范围">
                    {GUIDED_SHOTS.map((option) => <button type="button" key={option.id} aria-pressed={guideShotChoice === option.id} className={guideShotChoice === option.id ? "choice-chip choice-selected" : "choice-chip"} onClick={() => setGuideShotChoice(option.id)}>{option.label}</button>)}
                  </div>
                </div>
              </div>
              <div className="creation-question">
                <div className="creation-section-heading"><span>{guideMode === "new" ? "6" : "5"}. 什么质感</span><small>决定整套视觉语言</small></div>
                <div className="choice-chip-grid" role="group" aria-label="视觉质感">
                  {GUIDED_VISUAL_STYLES.map((option) => <button type="button" key={option.id} aria-pressed={guideVisualStyle === option.id} className={guideVisualStyle === option.id ? "choice-chip choice-selected" : "choice-chip"} onClick={() => setGuideVisualStyle(option.id)}>{option.label}</button>)}
                </div>
              </div>
            </article>
            <aside className="creation-context-card">
              <div className="creation-section-heading">
                <span>人物来源</span>
                <small>原创、沿用角色或参考图</small>
              </div>
              <div className="source-switch" role="group" aria-label="创作依据">
                {([
                  ["new", "原创角色"],
                  ["saved", "已存角色"],
                  ["reference", "参考图"],
                ] as const).map(([mode, label]) => (
                  <button type="button" key={mode} aria-pressed={guideMode === mode} className={guideMode === mode ? "source-selected" : ""} onClick={() => setGuideMode(mode)}>{label}</button>
                ))}
              </div>
              {guideMode === "saved" && (
                <label>角色
                  <select value={guideCharacterId} onChange={(event) => setGuideCharacterId(event.target.value)}>
                    <option value="">选择角色</option>
                    {characters.filter((profile) => profile.lifecycle !== "archived").map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}
                  </select>
                </label>
              )}
              {guideMode === "reference" && (
                <label>参考图
                  <select value={guideReferenceAssetId} onChange={(event) => setGuideReferenceAssetId(event.target.value)}>
                    <option value="">选择已确认图片</option>
                    {selectableImages.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
                  </select>
                </label>
              )}
              {guideMode === "reference" && !selectableImages.length && <small className="context-warning">暂无可用图片，请先到资产库完成审片与权利确认。</small>}
              <label>场景来源
                <select value={guideSceneProfileId} onChange={(event) => setGuideSceneProfileId(event.target.value)}>
                  <option value="">使用左侧场景方向</option>
                  {scenes.filter((scene) => scene.lifecycle !== "archived").map((scene) => <option value={scene.id} key={scene.id}>{scene.name}</option>)}
                </select>
              </label>
              <div className="creation-section-heading constraint-heading"><span>保持什么</span><small>可多选</small></div>
              <div className="choice-chip-grid constraint-grid" role="group" aria-label="生成约束">
                {GUIDED_CONSTRAINTS.map((option) => <button type="button" key={option.id} aria-pressed={guideConstraints.includes(option.id)} className={guideConstraints.includes(option.id) ? "choice-chip choice-selected" : "choice-chip"} onClick={() => setGuideConstraints((current) => current.includes(option.id) ? current.filter((id) => id !== option.id) : [...current, option.id])}>{option.label}</button>)}
              </div>
              <button type="button" className="subtle-button" aria-expanded={showGuideOptions} onClick={() => setShowGuideOptions((value) => !value)}>
                {showGuideOptions ? "收起已有资产" : "使用更多已有资产"}
              </button>
              {showGuideOptions && <div className="creation-options">
                {guideMode === "saved" && guideCharacterDetail?.id === guideCharacterId && <>
                  <label>用途<select value={guidePurpose} onChange={(event) => setGuidePurpose(event.target.value as CharacterUseCase)}><option value="portrait">肖像</option><option value="full_body">全身设定</option><option value="series">连续镜头</option></select></label>
                  {(["look", "expression", "pose", "scene"] as CharacterVariantKind[]).map((kind) => <label key={kind}>{kind === "look" ? "造型" : kind === "expression" ? "表情" : kind === "pose" ? "动作" : "情境"}
                    <select value={characterVariantSelections[guideCharacterDetail!.id]?.[kind] ?? ""} onChange={(event) => setCharacterVariantSelections((current) => ({ ...current, [guideCharacterDetail!.id]: { ...current[guideCharacterDetail!.id], [kind]: event.target.value || undefined } }))}>
                      <option value="">使用角色默认</option>{guideCharacterDetail!.variants.filter((item) => item.kind === kind).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>)}
                </>}
                {collections.length > 0 && <div className="guide-collections">
                  <small>继承资产包</small>
                  <div className="choice-row">
                    {collections.filter((collection) => collection.status !== "archived").map((collection) => (
                      <button type="button" key={collection.id} className={guideCollectionIds.includes(collection.id) ? "choice-selected" : ""} onClick={() => setGuideCollectionIds((current) => current.includes(collection.id) ? current.filter((id) => id !== collection.id) : [...current, collection.id])}>{collection.name}</button>
                    ))}
                  </div>
                </div>}
              </div>}
              <div className="creation-launch-action">
                <button className="primary-button" disabled={isPreparingCreation} onClick={() => void beginGuidedCreation()}>{isPreparingCreation ? "正在自动组装…" : "自动组装并进入出图"}</button>
                <small>下一步只看方案和生成结果，不再填写提示词。</small>
              </div>
            </aside>
          </section>
          {notice && <p className="notice" role="status">{notice}</p>}
        </section>
        )}
        </>
      )}
      {screen === "characters" && (
        <section className="workspace character-workspace">
          <header className="workspace-header">
            <div>
              <p className="eyebrow">资产 / 角色档案</p>
              <h2>角色档案与素材完整度</h2>
              <p className="result-note">管理身份、形体和证据。</p>
            </div>
            <div className="header-actions">
              <button onClick={() => void createCharacterSheetTask()} disabled={!selectedCharacterId}>创建角色设定板</button>
              <button onClick={() => void importCharacterPack()} disabled={isImportingCharacterPack}>{isImportingCharacterPack ? "正在导入资产包…" : "导入人物资产包"}</button>
              <button className="primary-button" onClick={openCharacterCreate}>新建角色档案</button>
            </div>
          </header>
          {isCreatingCharacter ? (
            <section className="form-panel character-create-panel" aria-label="建立角色档案">
              <div className="inspector-heading">
                <div>
                  <p className="eyebrow">资产 / 新建角色</p>
                  <h3>建立角色档案</h3>
                  <p className="result-note">先保存身份骨架，细项可稍后补齐。</p>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  角色档案名称
                  <input aria-label="角色档案名称" value={characterName} onChange={(event) => setCharacterName(event.target.value)} placeholder="例如：蝶灵仙姬" />
                </label>
                <label>
                  角色组
                  <select aria-label="角色组" value={characterGroup} onChange={(event) => setCharacterGroup(event.target.value as CharacterGroup)}>
                    {Object.entries(CHARACTER_GROUP_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  人物主体
                  <textarea aria-label="人物主体" value={characterDraftCard.subject} onChange={(event) => setCharacterDraftCard((current) => ({ ...current, subject: event.target.value }))} placeholder="例如：成年东亚女性，真人摄影质感" />
                </label>
                <label>
                  身份锚点
                  <textarea aria-label="身份锚点" value={characterDraftCard.identityAnchor} onChange={(event) => setCharacterDraftCard((current) => ({ ...current, identityAnchor: event.target.value }))} placeholder="最不能漂移的脸型、年龄感、种族或辨识特征" />
                </label>
                <label>
                  身材与衣着（可选）
                  <textarea aria-label="身材与衣着" value={characterDraftCard.bodyAndWardrobe} onChange={(event) => setCharacterDraftCard((current) => ({ ...current, bodyAndWardrobe: event.target.value }))} placeholder="例如：修长比例；月白改良汉服；细金色头饰" />
                </label>
                <label>
                  表情与动作（可选）
                  <textarea aria-label="表情与动作" value={characterDraftCard.expressionAndPose} onChange={(event) => setCharacterDraftCard((current) => ({ ...current, expressionAndPose: event.target.value }))} placeholder="例如：安静直视镜头，肩膀微侧" />
                </label>
              </div>
              <p className="result-note">当前项目：{projectName ?? "未选择，先保存为通用档案"}。</p>
              <div className="form-actions">
                <button className="primary-button" onClick={() => void saveCharacter(characterDraftCard)}>保存角色档案</button>
                <button onClick={() => { setIsCreatingCharacter(false); setNotice(""); }}>取消</button>
              </div>
            </section>
          ) : <div className={characters.length ? "character-management-layout" : "character-management-layout character-management-empty"}>
          <section className="character-catalog" aria-label="角色档案库">
            {characters.map((profile) => (
              <article className={selectedCharacterId === profile.id ? "character-profile character-current" : "character-profile"} key={profile.id}>
                <button type="button" className="character-profile-open" aria-label={`打开角色 ${profile.name}`} aria-pressed={selectedCharacterId === profile.id} onClick={() => selectCharacter(profile.id)}>
                  <CharacterProfileVisual profile={profile} />
                  <span className="character-profile-copy">
                    <span className="pattern-status">{CHARACTER_GROUP_LABELS[profile.group]}</span>
                    <strong>{profile.name}</strong>
                    <span>{profile.card.identityAnchor || profile.card.subject || "等待补充身份锚点"}</span>
                    <small>{CHARACTER_LIFECYCLE_LABELS[profile.lifecycle]}</small>
                  </span>
                </button>
                {selectedCharacterId === profile.id && <div className="character-actions">
                  <label>角色组
                    <select value={profile.group} onChange={(event) => void updateCharacterManagement(profile, { group: event.target.value as CharacterGroup })}>
                      {Object.entries(CHARACTER_GROUP_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>状态
                    <select value={profile.lifecycle} onChange={(event) => void updateCharacterManagement(profile, { lifecycle: event.target.value as CharacterProfile["lifecycle"] })}>
                      {Object.entries(CHARACTER_LIFECYCLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <button onClick={() => { setCreationLaunchKind("scene"); setGuideMode("saved"); setGuideCharacterId(profile.id); setGuideCollectionIds(collections.filter((collection) => collection.characterProfileId === profile.id).map((collection) => collection.id)); setGuideSceneChoice("modern_city"); setScreen("start"); }}>用此角色做新场景</button>
                  <button className="primary-button" onClick={() => selectCharacter(profile.id)}>打开工作室</button>
                  <button type="button" onClick={() => void openMasterPicker(profile)}>{profile.masterAssetId ? "更换主参考图" : "选择主参考图"}</button>
                </div>}
                {masterPickerCharacterId === profile.id && <div className="character-master-picker" aria-label={`${profile.name}的主参考图管理`}>
                  <strong>{profile.masterAssetId ? "更换角色主参考" : "绑定角色主参考"}</strong>
                  <p>{profile.projectId ? "仅显示本项目" : "仅显示未归属项目"}的已确认图片。</p>
                  {masterPickerLoading && <p role="status">正在读取可用图片…</p>}
                  {masterPickerError && <p role="alert">{masterPickerError}</p>}
                  {!masterPickerLoading && !masterPickerError && (masterCandidateAssets.length ? <>
                    <label>主参考图
                      <select value={masterChoiceId} onChange={(event) => setMasterChoiceId(event.target.value)}>
                        <option value="">请选择一张图片</option>
                        {masterCandidateAssets.map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}
                      </select>
                    </label>
                    <button type="button" className="primary-button" disabled={!masterChoiceId || masterSaving} onClick={() => void saveCharacterMaster(profile)}>
                      {masterSaving ? "正在保存…" : profile.masterAssetId ? "确认更换主参考图" : "确认绑定主参考图"}
                    </button>
                  </> : <>
                    <p>{profile.projectId ? "当前项目" : "素材库"}暂无可用主参考图。</p>
                    <button type="button" onClick={() => setScreen("assets")}>打开素材库</button>
                  </>)}
                  <button type="button" onClick={() => { ++masterPickerRequestRef.current; setMasterPickerCharacterId(""); }}>取消</button>
                </div>}
              </article>
            ))}
            {!characters.length && <div className="empty-state empty-state-action"><div><strong>还没有角色档案</strong><p>建立角色，持续复用主参考和设定。</p></div><button className="primary-button" onClick={openCharacterCreate}>建立角色档案</button></div>}
          </section>
          <div className="character-detail-stack">
          {selectedCharacterId && (selectedCharacterDetail?.id !== selectedCharacterId || selectedCharacterWorkspace?.character.id !== selectedCharacterId) && <p role="status">正在读取角色工作室…</p>}
          {selectedCharacterId && selectedCharacterDetail?.id === selectedCharacterId && selectedCharacterWorkspace?.character.id === selectedCharacterId && <section className="character-center-switcher" aria-label="角色管理模式">
            <div className="character-center-context">
              <span>当前角色</span>
              <strong>{selectedCharacterDetail.name}</strong>
            </div>
            <div className="character-center-tabs" role="tablist" aria-label="角色工作区视图">
              <button
                type="button"
                role="tab"
                id="character-workspace-tab"
                aria-selected={characterCenterView === "workspace"}
                aria-controls="character-workspace-panel"
                className={characterCenterView === "workspace" ? "character-center-tab is-active" : "character-center-tab"}
                onClick={() => setCharacterCenterView("workspace")}
              >
                <strong>创作与复用</strong>
                <small>版本、状态与衍生图</small>
              </button>
              <button
                type="button"
                role="tab"
                id="character-details-tab"
                aria-selected={characterCenterView === "details"}
                aria-controls="character-details-panel"
                className={characterCenterView === "details" ? "character-center-tab is-active" : "character-center-tab"}
                onClick={() => setCharacterCenterView("details")}
              >
                <strong>细节设定</strong>
                <small>身份、外观与素材证据</small>
              </button>
            </div>
          </section>}
          {characterCenterView === "workspace" && selectedCharacterWorkspace?.character.id === selectedCharacterId && <div id="character-workspace-panel" role="tabpanel" aria-labelledby="character-workspace-tab"><CharacterWorkspacePanel
            snapshot={selectedCharacterWorkspace}
            onChanged={(workspace) => {
              setSelectedCharacterWorkspace(workspace);
              setSelectedCharacterDetail(workspace.character);
              setCharacters((current) => current.map((item) => item.id === workspace.character.id ? workspace.character : item));
            }}
            onStartCreation={(context) => void startCharacterExtensionCreation(selectedCharacterWorkspace, context)}
          /></div>}
          {characterCenterView === "details" && selectedCharacterDetail?.id === selectedCharacterId && <div id="character-details-panel" role="tabpanel" aria-labelledby="character-details-tab"><CharacterInspector
            key={selectedCharacterDetail.id}
            detail={selectedCharacterDetail}
            selection={characterVariantSelections[selectedCharacterDetail.id] ?? {}}
            onSelectionChange={(selection) => setCharacterVariantSelections((current) => ({ ...current, [selectedCharacterDetail.id]: selection }))}
            onSaveFact={(input) => saveCharacterFact(selectedCharacterDetail.id, input)}
            onCreateVariant={(kind, name) => addCharacterVariant(selectedCharacterDetail.id, kind, name)}
            onOpenAsset={(assetId) => { setSelectedAssetId(assetId); setScreen("assets"); }}
            onOpenLibrary={() => setScreen("assets")}
          /></div>}
          {!selectedCharacterId && characters.length > 0 && <div className="empty-state character-placeholder"><strong>选择角色，开始核对</strong><p>按用途补齐素材证据。</p></div>}
          </div>
          </div>}
          {notice && <p className="notice" role="status">{notice}</p>}
        </section>
      )}
      {screen === "scenes" && (
        <section className="workspace character-workspace scene-workspace">
          <header className="workspace-header">
            <div>
              <p className="eyebrow">资产 / 场景档案</p>
              <h2>场景档案与环境连续性</h2>
              <p className="result-note">固定空间结构，按状态切换时间、天气、光线和布景。</p>
            </div>
            <button className="primary-button" onClick={() => setIsCreatingScene(true)}>新建场景档案</button>
          </header>
          {isCreatingScene ? <section className="form-panel" aria-label="建立场景档案">
            <div className="inspector-heading"><div><p className="eyebrow">资产 / 新建场景</p><h3>建立空间基线</h3></div></div>
            <div className="form-grid">
              <label>场景名称<input aria-label="场景名称" value={sceneDraft.name} onChange={(event) => setSceneDraft((value) => ({ ...value, name: event.target.value }))} placeholder="例如：雨夜玻璃温室" /></label>
              <label>场景类型<select value={sceneDraft.kind} onChange={(event) => setSceneDraft((value) => ({ ...value, kind: event.target.value as SceneKind }))}><option value="interior">室内</option><option value="exterior">室外</option><option value="environment">自然／环境</option><option value="fantasy">幻想空间</option><option value="studio">影棚</option></select></label>
              <label>空间锚点<textarea aria-label="空间锚点" value={sceneDraft.anchor} onChange={(event) => setSceneDraft((value) => ({ ...value, anchor: event.target.value }))} placeholder="一句话说明这个空间最不能改变的识别结构" /></label>
              <label>空间结构<textarea value={sceneDraft.layout} onChange={(event) => setSceneDraft((value) => ({ ...value, layout: event.target.value }))} placeholder="入口、动线、门窗和主要区域的位置关系" /></label>
              <label>材质体系<textarea value={sceneDraft.materials} onChange={(event) => setSceneDraft((value) => ({ ...value, materials: event.target.value }))} placeholder="例如：旧铁框、潮湿玻璃、深色石材" /></label>
              <label>色彩体系<textarea value={sceneDraft.colorSystem} onChange={(event) => setSceneDraft((value) => ({ ...value, colorSystem: event.target.value }))} placeholder="例如：墨绿、冷蓝、少量暖金" /></label>
              <label>必须出现<textarea value={sceneDraft.requiredElements} onChange={(event) => setSceneDraft((value) => ({ ...value, requiredElements: event.target.value }))} placeholder="例如：拱形门、中央石板路" /></label>
              <label>禁止改变<textarea value={sceneDraft.forbiddenChanges} onChange={(event) => setSceneDraft((value) => ({ ...value, forbiddenChanges: event.target.value }))} placeholder="例如：禁止改变中轴结构和门窗位置" /></label>
            </div>
            <div className="form-actions"><button className="primary-button" onClick={() => void createSceneProfile()}>保存场景档案</button><button onClick={() => setIsCreatingScene(false)}>取消</button></div>
          </section> : <div className={scenes.length ? "character-management-layout" : "character-management-layout character-management-empty"}>
            <section className="character-catalog" aria-label="场景档案库">
              {scenes.map((scene) => <article className={selectedSceneId === scene.id ? "character-profile character-current" : "character-profile"} key={scene.id}>
                <div><span className="pattern-status">{scene.kind === "interior" ? "室内" : scene.kind === "exterior" ? "室外" : scene.kind === "fantasy" ? "幻想" : scene.kind === "studio" ? "影棚" : "环境"}</span><h3>{scene.name}</h3><p>{scene.anchor}</p><small>{scene.masterAssetId ? "已绑定场景母版" : "尚未绑定场景母版"}</small></div>
                <div className="character-actions">
                  <label>状态<select value={scene.lifecycle} onChange={(event) => void updateSceneLifecycle(scene, event.target.value as SceneProfile["lifecycle"])}><option value="draft">设定中</option><option value="confirmed">已确认</option><option value="archived">已归档</option></select></label>
                  <button className="primary-button" onClick={() => { setSelectedSceneWorkspace(undefined); setSelectedSceneId(scene.id); }}>管理场景</button>
                </div>
              </article>)}
              {!scenes.length && <div className="empty-state empty-state-action"><div><strong>还没有场景档案</strong><p>先建立空间基线，再扩展不同时间和天气。</p></div><button className="primary-button" onClick={() => setIsCreatingScene(true)}>建立场景档案</button></div>}
            </section>
            <div className="character-detail-stack">
              {selectedSceneId && selectedSceneWorkspace?.scene.id !== selectedSceneId && <p role="status">正在读取场景工作室…</p>}
              {selectedSceneWorkspace?.scene.id === selectedSceneId && <SceneWorkspacePanel snapshot={selectedSceneWorkspace} onChanged={(workspace) => {
                setSelectedSceneWorkspace(workspace);
                setScenes((current) => current.map((item) => item.id === workspace.scene.id ? workspace.scene : item));
              }} onStartImage={(context) => startSceneImageCreation(selectedSceneWorkspace, context)} />}
              {!selectedSceneId && scenes.length > 0 && <div className="empty-state character-placeholder"><strong>选择场景，开始管理</strong><p>空间基线与环境状态会分别保存。</p></div>}
            </div>
          </div>}
          {notice && <p className="notice" role="status">{notice}</p>}
        </section>
      )}
      {screen === "workspace" && (
        <section className="workspace project-workspace creation-home-workspace">
          <CreationLaunchpad
            embedded
            characterCount={characters.length}
            sceneCount={scenes.length}
            referenceCount={selectableImages.length}
            onSelect={startCreationFlow}
            onExit={() => document.getElementById("creation-projects")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
          <section id="creation-projects" className="creation-home-management" aria-label="项目与历史">
          <header className="workspace-header creation-management-header">
            <div>
              <p className="eyebrow">项目与历史</p>
              <h2>{selectedProjectId ? projectName : "需要长期管理时，再建立项目"}</h2>
              <p className="result-note">项目负责归档任务、角色与结果，不阻挡快速创作。</p>
            </div>
            {selectedProjectId && <button className="primary-button" onClick={() => setScreen("creation")}>继续当前创作</button>}
          </header>
          {!selectedProjectId ? (
            <section className="onboarding-panel" aria-label="建立第一个创作项目">
              <div className="onboarding-intro">
                <span>可选</span>
                <strong>为长期创作建立项目。</strong>
                <p>适合连续角色、批量镜头和需要追踪版本的工作。</p>
              </div>
              <div className="onboarding-form">
                <label>项目名称
                  <input aria-label="项目名称" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="例如：蝶灵古风角色资产包" />
                </label>
                <label>项目用途
                  <select value={newProjectMedium} onChange={(event) => setNewProjectMedium(event.target.value as ProjectMedium)}>
                    {PROJECT_MEDIUMS.map((medium) => <option key={medium.value} value={medium.value}>{medium.label}</option>)}
                  </select>
                </label>
                <button className="primary-button" onClick={() => void createProject()}>建立项目</button>
              </div>
              <div className="onboarding-options">
                <button onClick={() => setScreen("assets")}><strong>导入已有素材</strong><span>把角色图、场景图和参考图放入资产库。</span></button>
              </div>
            </section>
          ) : (
            <>
              <ProjectPipelinePanel snapshot={projectWorkspace} onNavigate={openPipelineTarget} />
              <section className="task-board" aria-label="创作任务">
                <div className="task-board-header">
                  <div><p className="eyebrow">创作任务</p><strong>每次创作都有记录</strong></div>
                  <button className="primary-button" onClick={openCreationLaunchpad}>新建任务</button>
                </div>
                <div className="task-grid">
                  {creativeTasks.slice(0, 6).map((task) => (
                    <button className={activeTaskId === task.id ? "task-card task-current" : "task-card"} key={task.id} onClick={() => void openCreativeTask(task)}>
                      <span>{taskStatusLabel(task.status)}</span>
                      <strong>{task.name}</strong>
                      <small>{task.objective}</small>
                    </button>
                  ))}
                  {!creativeTasks.length && <p className="task-empty">还没有任务。创建后，角色、候选和母版会自动关联。</p>}
                </div>
              </section>
              <section className="form-panel brief-panel" aria-label="项目默认方案">
                <div className="brief-panel-heading">
                  <div>
                    <p className="eyebrow">项目默认方案</p>
                    <strong>点选后，后续任务自动沿用</strong>
                  </div>
                  <button type="button" onClick={() => setProjectBrief({
                    goal: "建立可复用角色",
                    audience: "竖屏漫剧",
                    visualWorld: "写实东方幻想",
                    delivery: "3 张候选",
                    acceptance: "人物一致；真人质感；场景准确",
                  })}>采用推荐组合</button>
                </div>
                <div className="brief-choice-layout">
                  {(Object.keys(PROJECT_BRIEF_OPTIONS) as ProjectBriefSingleKey[]).map((key) => {
                    const group = PROJECT_BRIEF_OPTIONS[key];
                    const custom = projectBrief[key] === "自定义" || isCustomBriefValue(key, projectBrief[key]);
                    return <section className="brief-question" key={key} aria-label={group.label}>
                      <strong>{group.label}</strong>
                      <div className="choice-chip-grid">
                        {group.options.map((option) => <button type="button" key={option} aria-pressed={projectBrief[key] === option} className={projectBrief[key] === option ? "choice-chip choice-selected" : "choice-chip"} onClick={() => setProjectBrief((current) => ({ ...current, [key]: option }))}>{option}</button>)}
                        <button type="button" aria-pressed={custom} className={custom ? "choice-chip choice-selected" : "choice-chip"} onClick={() => setProjectBrief((current) => ({ ...current, [key]: "自定义" }))}>自定义</button>
                      </div>
                      {custom && <input autoFocus aria-label={`${group.label}自定义`} value={projectBrief[key] === "自定义" ? "" : projectBrief[key]} onChange={(event) => setProjectBrief((current) => ({ ...current, [key]: event.target.value || "自定义" }))} placeholder="只补充现有选项没有的内容" />}
                    </section>;
                  })}
                  <section className="brief-question brief-acceptance" aria-label="验收重点">
                    <strong>验收重点 <small>可多选</small></strong>
                    <div className="choice-chip-grid">
                      {PROJECT_ACCEPTANCE_OPTIONS.map((option) => <button type="button" key={option} aria-pressed={hasAcceptance(projectBrief, option)} className={hasAcceptance(projectBrief, option) ? "choice-chip choice-selected" : "choice-chip"} onClick={() => setProjectBrief((current) => ({ ...current, acceptance: toggleAcceptance(current.acceptance, option) }))}>{option}</button>)}
                    </div>
                  </section>
                </div>
                <div className="form-actions">
                  <button className="primary-button" onClick={() => void saveProjectBrief()}>保存项目默认方案</button>
                </div>
              </section>
              <section className="workspace-next">
                <div>
                  <p className="eyebrow">建议下一步 / 只做这一件事</p>
                  <strong>{workspaceNextAction.hint || projectWorkspace?.recommendedNextAction}</strong>
                </div>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    openPipelineTarget(workspaceNextAction.target);
                  }}
                >
                  {workspaceNextAction.label}
                </button>
              </section>
              <section className="master-strip">
                <div>
                  <p className="eyebrow">已锁定母版</p>
                  <p className="result-note">后续出图优先使用已锁定母版。</p>
                </div>
                <div className="master-assets">
                  {projectWorkspace?.masterAssets.length ? projectWorkspace.masterAssets.map((asset) => (
                    <button key={asset.id} className="master-chip" onClick={() => { setSelectedAssetId(asset.id); setScreen("assets"); }}>
                      {asset.name}
                    </button>
                  )) : <span>暂无母版</span>}
                </div>
              </section>
            </>
          )}
          </section>
          {notice && <p className="notice" role="status">{notice}</p>}
        </section>
      )}
      {screen === "collections" && (
        <section className="workspace collection-workspace">
          <header className="workspace-header">
            <div>
              <p className="eyebrow">资产结构 / 可继承、可复用、可追溯</p>
              <h2>用资产包管理角色、场景与每个可复用单元</h2>
              <p className="result-note">一个资产包对应一个角色、场景或用途。</p>
            </div>
          </header>
          <section className="collection-create form-panel">
            <div><p className="eyebrow">建立资产包</p><p className="result-note">角色、场景、服装都可单独管理。</p></div>
            <div className="form-grid collection-create-grid">
              <label>资产包名称<input value={newCollectionName} onChange={(event) => setNewCollectionName(event.target.value)} placeholder="例如：蝶灵 · 夜行礼服套装" /></label>
              <label>类型<select value={newCollectionKind} onChange={(event) => setNewCollectionKind(event.target.value as AssetCollectionKind)}>
                <option value="character">角色</option><option value="scene">场景</option><option value="wardrobe">服装</option><option value="prop">道具</option><option value="style">风格</option><option value="reference">参考</option>
              </select></label>
              {newCollectionKind === "character" && <label>所属角色<select value={newCollectionCharacterId} onChange={(event) => setNewCollectionCharacterId(event.target.value)}><option value="">请选择角色档案</option>{characters.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>}
              <label>上级资产包（可选）<select value={newCollectionParentId} onChange={(event) => setNewCollectionParentId(event.target.value)}><option value="">作为顶层资产包</option>{collections.filter((item) => item.status !== "archived").map((item) => <option key={item.id} value={item.id}>{item.name} · {item.kind === "character" ? "角色" : item.kind === "scene" ? "场景" : item.kind === "wardrobe" ? "服装" : item.kind === "prop" ? "道具" : item.kind === "style" ? "风格" : "参考"}</option>)}</select></label>
              <label className="collection-description">管理说明<textarea value={newCollectionDescription} onChange={(event) => setNewCollectionDescription(event.target.value)} placeholder="它服务哪个角色或哪类镜头？哪些内容必须保持？" /></label>
            </div>
            <div className="collection-blueprint-note"><strong>{getAssetCollectionBlueprint(newCollectionKind).label}</strong><span>{getAssetCollectionBlueprint(newCollectionKind).purpose}</span><small>建立后按模块归档。</small></div>
            <div className="form-actions"><button className="primary-button" onClick={() => void createCollection()}>建立资产包</button></div>
          </section>
          <section className="collection-layout">
            <div className="collection-list" aria-label="资产包列表">
              {collections.map((collection) => <button key={collection.id} className={selectedCollectionId === collection.id ? "collection-card collection-current" : "collection-card"} style={collection.parentId ? { marginLeft: 20 } : undefined} onClick={() => { setSelectedCollectionId(collection.id); setSelectedCollectionModuleKey(getAssetCollectionBlueprint(collection.kind).modules.find((module) => module.required)?.key ?? ""); }}>
                <span>{collection.parentId ? "└ 子包 · " : ""}{collection.kind === "character" ? "角色" : collection.kind === "scene" ? "场景" : collection.kind === "wardrobe" ? "服装" : collection.kind === "prop" ? "道具" : collection.kind === "style" ? "风格" : "参考"}</span>
                <strong>{collection.name}</strong><small>{collection.assetCount} 个素材 · {collection.status === "active" ? "使用中" : collection.status === "archived" ? "已归档" : "设定中"}</small>
              </button>)}
              {!collections.length && <div className="empty-state"><strong>还没有资产包</strong><p>先建立一个角色或场景资产包。</p></div>}
            </div>
            <article className="collection-detail">
              {selectedCollection ? <>
                <div className="collection-detail-header"><div><p className="eyebrow">当前资产包 · {getAssetCollectionBlueprint(selectedCollection.kind).label}</p><h3>{selectedCollection.name}</h3><p>{selectedCollection.description || "尚未填写管理说明"}</p></div><div className="collection-detail-actions"><button type="button" onClick={() => { setEditingCollection((current) => !current); setCollectionEditName(selectedCollection.name); setCollectionEditDescription(selectedCollection.description); }}>{editingCollection ? "取消编辑" : "编辑信息"}</button><label>状态<select value={selectedCollection.status} onChange={(event) => void updateCollectionStatus(event.target.value as AssetCollection["status"])}><option value="draft">设定中</option><option value="active">使用中</option><option value="archived">已归档</option></select></label></div></div>
                {editingCollection && <section className="collection-edit-panel form-panel"><label>资产包名称<input value={collectionEditName} onChange={(event) => setCollectionEditName(event.target.value)} /></label><label>管理说明<textarea value={collectionEditDescription} onChange={(event) => setCollectionEditDescription(event.target.value)} /></label><div className="form-actions"><button className="primary-button" onClick={() => void saveCollectionDetails()}>保存信息</button></div></section>}
                <section className={`collection-readiness readiness-${selectedCollection.readiness.status}`} aria-label="资产包就绪度">
                  <div>
                    <span>{selectedCollection.readiness.status === "ready" ? selectedCollection.kind === "character" ? "肖像基线可用" : "可投入生产" : selectedCollection.readiness.status === "empty" ? "等待素材" : "尚未就绪"}</span>
                    <strong>已确认 {selectedCollection.readiness.confirmedAssetCount} 项 · 主参考 {selectedCollection.readiness.masterReferenceCount} 项</strong>
                  </div>
                  <p>{selectedCollection.readiness.nextAction}</p>
                  {selectedCollection.readiness.characterCoverage && <small>肖像必需细项：{selectedCollection.readiness.characterCoverage.confirmedRequiredCount}/{selectedCollection.readiness.characterCoverage.requiredCount}</small>}
                </section>
                <section className="collection-modules" aria-label="资产包模块完整度"><div className="collection-section-heading"><div><p className="eyebrow">模块完整度</p><strong>点击模块查看对应素材</strong></div><small>{selectedCollection.readiness.moduleCoverage?.confirmedRequiredCount ?? 0}/{selectedCollection.readiness.moduleCoverage?.requiredCount ?? 0} 个必需模块</small></div><div className="collection-module-grid">{(selectedCollection.readiness.moduleCoverage?.modules ?? selectedCollectionBlueprint!.modules.map((module) => ({ key: module.key, label: module.label, required: module.required, assetCount: 0, confirmedAssetCount: 0 }))).map((module) => <button type="button" key={module.key} onClick={() => setCollectionAssetFilters((current) => ({ ...current, moduleKey: current.moduleKey === module.key ? "all" : module.key }))} className={`${module.required && module.confirmedAssetCount === 0 ? "collection-module module-missing" : "collection-module"}${collectionAssetFilters.moduleKey === module.key ? " module-current" : ""}`}><span>{module.required ? "必需" : "可选"}</span><strong>{module.label}</strong><small>{module.confirmedAssetCount}/{module.assetCount} 项可用</small></button>)}</div></section>
                {selectedCollection.characterProfileId && <button type="button" onClick={() => { selectCharacter(selectedCollection.characterProfileId!); setScreen("characters"); }}>打开所属角色细项</button>}
                <div className="collection-assets">
                  <div className="collection-section-heading"><div><p className="eyebrow">已归档素材</p><strong>{selectedCollection.assets.length} 项</strong></div><small>按模块、状态和权利快速核对。</small></div>
                  <CollectionAssetFilterBar filters={collectionAssetFilters} modules={selectedCollectionBlueprint!.modules} resultCount={filteredCollectionAssets.length} totalCount={selectedCollection.assets.length} onChange={setCollectionAssetFilters} />
                  {filteredCollectionAssets.map((asset) => <div key={asset.id} className="collection-member"><button type="button" className="collection-member-main" onClick={() => { setSelectedAssetId(asset.id); setScreen("assets"); }}><span>{selectedCollectionBlueprint!.modules.find((module) => module.key === asset.moduleKey)?.label ?? "未分配模块"} · {asset.membershipRole}</span><strong>{asset.name}</strong><small>{ASSET_TYPE_LABELS[asset.type]} · {asset.confirmation === "confirmed" ? "已确认" : asset.confirmation === "rejected" ? "已淘汰" : "待审片"} · {asset.rightsStatus === "original" ? "原创" : asset.rightsStatus === "authorized" ? "已授权" : asset.rightsStatus === "restricted" ? "受限制" : "权利待核实"}{asset.projectMaster ? " · 项目母版" : ""}{asset.notes ? ` · ${asset.notes}` : ""}</small></button><button type="button" className="collection-member-remove" onClick={() => void detachSelectedCollectionAsset(asset.id)}>移除</button></div>)}
                  {!selectedCollection.assets.length && <p className="task-empty">这个资产包还没有素材。到“资产库”选中一个素材后，先选择模块，再点击“归入当前资产包”。</p>}
                  {selectedCollection.assets.length > 0 && !filteredCollectionAssets.length && <div className="empty-state compact-empty"><strong>没有匹配素材</strong><p>调整筛选条件，或点击上方模块取消限定。</p></div>}
                </div>
              </> : <div className="empty-state"><strong>选择一个资产包</strong><p>右侧查看素材、状态和引用。</p></div>}
            </article>
          </section>
          {notice && <p className="notice" role="status">{notice}</p>}
        </section>
      )}
      {screen === "assets" && (
        <section className="workspace">
          <header className="workspace-header">
            <div>
              <p className="eyebrow">资产底座 / {projectName ?? "全部资产"}</p>
              <h2>让每一张参考图都能成为可复用的创作资产</h2>
            </div>
            <div className="header-actions">
              <span>{assets.length} 个素材</span>
              <button
                disabled={!selectedProjectId}
                onClick={() => void exportSelectedProject()}
              >
                导出项目资产包
              </button>
            </div>
          </header>
          <section className="control-panel" aria-label="项目与导入控制">
            <div className="project-create">
              <label>
                新建项目
                <input
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  placeholder="例如：蝶灵古风角色包"
                />
              </label>
              <label>
                用途
                <select
                  value={newProjectMedium}
                  onChange={(event) =>
                    setNewProjectMedium(event.target.value as ProjectMedium)
                  }
                >
                  {PROJECT_MEDIUMS.map((medium) => (
                    <option key={medium.value} value={medium.value}>
                      {medium.label}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={() => void createProject()}>建立项目</button>
            </div>
            <div className="import-controls">
              <label>
                资产类型
                <select
                  value={assetType}
                  onChange={(event) =>
                    setAssetType(event.target.value as AssetType)
                  }
                >
                  {Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                二级分类
                <select value={assetSecondaryCategory} onChange={(event) => setAssetSecondaryCategory(event.target.value)}>
                  {ASSET_SECONDARY_CATEGORIES[assetType].map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <label>
                素材权利
                <select
                  value={rightsStatus}
                  onChange={(event) =>
                    setRightsStatus(event.target.value as RightsStatus)
                  }
                >
                  <option value="authorized">已获授权</option>
                  <option value="original">原创</option>
                  <option value="unknown">待确认</option>
                  <option value="restricted">受限</option>
                </select>
              </label>
              {['authorized', 'original'].includes(rightsStatus) && <label>授权或原创依据
                <input value={rightsReason} onChange={(event) => setRightsReason(event.target.value)} placeholder="例如：本人拍摄或已获商业使用许可" />
              </label>}
              <button
                className="primary-button"
                onClick={() => void importAssets()}
                disabled={isImporting}
              >
                {isImporting ? "正在导入…" : "导入素材"}
              </button>
            </div>
          </section>
          <section className="library-toolbar">
            <label>
              查看项目
              <select
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
              >
                <option value="">全部资产</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="type-tabs">
              <button
                className={selectedType === "all" ? "selected" : ""}
                onClick={() => setSelectedType("all")}
              >
                全部
              </button>
              {(
                [
                  "character",
                  "reference_image",
                  "scene",
                  "image",
                  "video",
                ] as AssetType[]
              ).map((type) => (
                <button
                  key={type}
                  className={selectedType === type ? "selected" : ""}
                  onClick={() => setSelectedType(type)}
                >
                  {ASSET_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
            <label>
              二级分类
              <select value={selectedSecondaryCategory} onChange={(event) => setSelectedSecondaryCategory(event.target.value)}>
                <option value="all">全部分类</option>
                {availableSecondaryCategories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
          </section>
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {selectedAsset && (
            <section className="selection-panel">
              <div>
                <span>
                  已选：{selectedAsset.name} ·{" "}
                  {selectedAsset.confirmation === "confirmed"
                    ? "已确认"
                    : selectedAsset.confirmation === "rejected"
                      ? "已淘汰"
                      : "待审片"}
                </span>
                {lineage.length > 0 && (
                  <p className="lineage-summary">
                    {lineage
                      .map(
                        (item) =>
                          `${item.direction === "source" ? "来源" : "衍生"}：${item.asset.name}`,
                      )
                      .join(" · ")}
                  </p>
                )}
                <div className="asset-usage-summary" aria-label="素材引用位置">
                  <strong>被哪里使用 · {assetUsage.length}</strong>
                  {assetUsage.length > 0 ? <ul>{assetUsage.map((usage) => (
                    <li key={`${usage.kind}-${usage.scopeId}-${usage.context}`}>
                      <span>{ASSET_USAGE_LABELS[usage.kind]}</span>
                      <b>{usage.scopeName}</b>
                      <small>{usage.context}</small>
                    </li>
                  ))}</ul> : <small>尚未被项目、资产包、角色、场景、任务或配方引用。</small>}
                </div>
              </div>
              {selectedCollection && <div className="collection-attach-controls"><label>归档到模块<select value={selectedCollectionModuleKey} onChange={(event) => setSelectedCollectionModuleKey(event.target.value)}>{getAssetCollectionBlueprint(selectedCollection.kind).modules.map((module) => <option value={module.key} key={module.key}>{module.required ? "必需 · " : "可选 · "}{module.label}</option>)}</select></label><label>本素材说明（可选）<input value={selectedCollectionMemberNotes} onChange={(event) => setSelectedCollectionMemberNotes(event.target.value)} placeholder="例如：只作为正面脸部证据，不作为最终母版" /></label></div>}
              <div className="form-actions">
                <button onClick={() => void reviewAsset("confirmed")}>
                  确认画面
                </button>
                <button onClick={() => void reviewAsset("rejected")}>
                  淘汰候选
                </button>
                <button
                  disabled={selectedAsset.confirmation !== "confirmed" || !["original", "authorized"].includes(selectedAsset.rightsStatus) || Boolean(projectWorkspace?.masterAssets.some((asset) => asset.id === selectedAsset.id))}
                  onClick={() => void setSelectedAssetAsMaster()}
                >
                  {projectWorkspace?.masterAssets.some((asset) => asset.id === selectedAsset.id) ? "已锁定项目母版" : "锁定为项目母版"}
                </button>
                <button disabled={!selectedCollection} onClick={() => void attachSelectedAssetToCollection()}>
                  {selectedCollection ? `归入「${selectedCollection.name}」` : "先在资产结构选择资产包"}
                </button>
                {selectedProjectId && selectedAsset.mediaType.startsWith("image/") && <button onClick={() => { setActiveDomain("production"); setScreen("review"); }}>
                  到统一审片台
                </button>}
                <button
                  disabled={
                    !canUse("vision") ||
                    !selectedAsset.mediaType.startsWith("image/")
                  }
                  onClick={() => void analyzeSelected()}
                >
                  {canUse("vision")
                    ? "用视觉模型深度理解这张图"
                    : "先配置视觉模型"}
                </button>
              </div>
              <AssetRightsEditor key={selectedAsset.id} asset={selectedAsset} onSaved={async () => { await refresh(); await refreshCharacterRelations(); setNotice("使用权复核已保存；如果撤销授权，相关角色的锁定状态会重新核对。"); }} />
            </section>
          )}
          {selectedAsset?.mediaType.startsWith("image/") && (
            <section className="refinement-panel">
              <div>
                <p className="eyebrow">高保真起始帧修订</p>
                <p className="result-note">
                  保留这张图的身份和构图，只处理你指定的问题；修订结果会作为新版本入库。
                </p>
              </div>
              <textarea
                value={refinementInstruction}
                onChange={(event) =>
                  setRefinementInstruction(event.target.value)
                }
              />
              <button
                className="primary-button"
                disabled={!canUse("image_edit")}
                onClick={() => void refineSelected()}
              >
                {canUse("image_edit") ? "修订为视频起始帧" : "先配置修图模型"}
              </button>
            </section>
          )}
          {analysis && (
            <section className="result-panel">
              <p className="eyebrow">结构化视觉理解报告</p>
              <div className="understanding-grid">
                {(
                  [
                    ["主体", analysis.subject],
                    ["身份锚点", analysis.identityAnchor],
                    ["服装与体态", analysis.bodyAndWardrobe],
                    ["姿态", analysis.expressionAndPose],
                    ["场景", analysis.scene],
                    ["光线", analysis.lighting],
                    ["镜头", analysis.camera],
                    ["风格", analysis.style],
                  ] as [string, string][]
                )
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label}>
                      <small>{label}</small>
                      <p>{value}</p>
                    </div>
                  ))}
              </div>
              <p className="result-note">
                连续性锁定：
                {analysis.continuityLocks.join("；") || "请人工补充"}
                <br />
                风险提醒：{analysis.risks.join("；") || "未发现明显风险"}
              </p>
              <div className="form-actions">
                <button onClick={applyAnalysisToCard}>填入创作卡</button>
                <button
                  className="primary-button"
                  onClick={applyAnalysisToShot}
                >
                  填入镜头合同
                </button>
              </div>
            </section>
          )}
          {reversePrompt && (
          <section className="result-panel reverse-prompt-panel">
              <p className="eyebrow">可编辑反推提示词 / 从视觉结构到下一张原创图</p>
              <p className="result-note">提取可见结构，不复刻原图。下一轮只改一个维度。</p>
              <textarea
                value={reversePrompt.prompt}
                onChange={(event) => setReversePrompt((current) => current ? { ...current, prompt: event.target.value } : current)}
                aria-label="可编辑反推提示词"
              />
              <div className="reverse-options" aria-label="建议单变量">
                {reversePrompt.changeOptions.map((option) => <span key={option}>下一轮可改：{option}</span>)}
              </div>
              <div className="form-actions">
                <button onClick={applyAnalysisToCard}>拆分填入创作卡</button>
                <button className="primary-button" onClick={useReversePromptForCreation}>作为本轮提示词</button>
              </div>
            </section>
          )}
          <section className="asset-grid" aria-label="资产库">
            {libraryAssets.map((asset) => (
              <article
                className={`${assetClass(asset.type)} ${selectedAssetId === asset.id ? "asset-selected" : ""}`}
                key={asset.id}
                onClick={() => setSelectedAssetId(asset.id)}
              >
                <AssetVisual asset={asset} />
                <div className="asset-body">
                  <h3>{asset.name}</h3>
                  <p>
                    {asset.rightsStatus === "authorized"
                      ? "已获授权"
                      : asset.rightsStatus === "original"
                        ? "原创"
                        : asset.rightsStatus === "restricted"
                          ? "受限素材"
                          : "待确认"}
                  </p>
                  <small>
                    {typeof asset.metadata.width === "number"
                      ? `${asset.metadata.width} × ${asset.metadata.height}`
                      : asset.mediaType}
                  </small>
                  {typeof asset.metadata.secondaryCategory === "string" && <small>{asset.metadata.secondaryCategory}</small>}
                </div>
              </article>
            ))}
            {!libraryAssets.length && (
              <div className="empty-state">
                <strong>{assets.length ? "这个二级分类还没有素材" : "从第一张参考图开始"}</strong>
                <p>
                  导入人物、场景、服装、姿势或已有成图。系统会保存管理副本、来源、哈希和基础理解建议。
                </p>
                <button
                  className="primary-button"
                  onClick={() => void importAssets()}
                  disabled={isImporting}
                >
                  导入第一批素材
                </button>
              </div>
            )}
          </section>
        </section>
      )}
      {screen === "paradigms" && (
        <section className="workspace">
          <header className="workspace-header">
            <div>
              <p className="eyebrow">视觉生产范式 / 先选择作品，再补具体画面</p>
              <h2>选择视觉范式</h2>
            </div>
          </header>
          <section className="form-panel">
            <p className="result-note">
              最多选四个；人物和场景留到创作卡。
            </p>
            <div className="paradigm-grid">
              {paradigms.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`paradigm-card ${selectedParadigmIds.includes(item.id) ? "paradigm-selected" : ""}`}
                  onClick={() => toggleParadigm(item.id)}
                >
                  <span>{item.role}</span>
                  <strong>{item.name}</strong>
                  <p>{item.description}</p>
                  <small>
                    {item.status === "validated" ? "已验证" : "待试用"} · 已引用{" "}
                    {item.usageCount} 次
                  </small>
                </button>
              ))}
            </div>
            <section className="composition-panel">
              <p className="eyebrow">本次视觉简报</p>
              <strong>{paradigmComposition?.acceptance}</strong>
              {paradigmComposition?.warnings.map((warning) => (
                <p className="composition-warning" key={warning}>
                  {warning}
                </p>
              ))}
              {paradigmComposition?.paradigms.length ? (
                <p className="result-note">
                  范式模块：
                  {paradigmComposition.paradigms
                    .map((item) => `${item.role} / ${item.name}`)
                    .join(" · ")}
                </p>
              ) : null}
              <div className="form-actions">
                <button onClick={() => setSelectedParadigmIds([])}>
                  清空选择
                </button>
                <button
                  className="primary-button"
                  disabled={!paradigmComposition?.canApply}
                  onClick={applyParadigms}
                >
                  带入创作卡
                </button>
              </div>
            </section>
          </section>
          <section className="form-panel">
            <p className="eyebrow">沉淀自己的范式</p>
            <p className="result-note">
              只记录它解决什么问题；新范式先试用。
            </p>
            <div className="form-grid">
              <label>
                名称
                <input
                  value={customParadigm.name}
                  onChange={(event) =>
                    setCustomParadigm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="例如：雨夜都市情绪广告"
                />
              </label>
              <label>
                主要解决什么
                <select
                  value={customParadigm.role}
                  onChange={(event) =>
                    setCustomParadigm((current) => ({
                      ...current,
                      role: event.target.value as VisualParadigmRole,
                    }))
                  }
                >
                  {(
                    [
                      "摄影与媒介",
                      "版式与构图",
                      "作品用途",
                      "世界观与气质",
                    ] as VisualParadigmRole[]
                  ).map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                它带来什么视觉结果
                <textarea
                  value={customParadigm.description}
                  onChange={(event) =>
                    setCustomParadigm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="用日常语言说明它会影响什么"
                />
              </label>
              <label>
                可复用视觉模块
                <textarea
                  value={customParadigm.promptModule}
                  onChange={(event) =>
                    setCustomParadigm((current) => ({
                      ...current,
                      promptModule: event.target.value,
                    }))
                  }
                  placeholder="写清摄影、版式、材质或用途的关键约束"
                />
              </label>
            </div>
            <div className="form-actions">
              <button onClick={() => void createParadigm()}>
                保存为待试用范式
              </button>
            </div>
          </section>
        </section>
      )}
      {screen === "creation" && !activeTaskId && !activeCharacterContext && !activeSceneContext && !promptBuild && (
        <section className="workspace creation-empty-workspace">
          <section className="creation-empty-state">
            <p className="eyebrow">当前没有创作方案</p>
            <h2>先选角色，再进入生成</h2>
            <p>通过视觉选项塑造人物，不必先写提示词。</p>
            <button className="primary-button" onClick={openCreationLaunchpad}>开始新创作</button>
          </section>
        </section>
      )}
      {screen === "creation" && Boolean(activeTaskId || activeCharacterContext || activeSceneContext || promptBuild) && (
        <section className="workspace">
          <header className="workspace-header">
            <div>
              <p className="eyebrow">{creationWorkspaceCopy.eyebrow}</p>
              <h2>{creationWorkspaceCopy.title}</h2>
              <p className="result-note">{creativeTasks.find((task) => task.id === activeTaskId)?.name ?? "当前角色方案"}</p>
            </div>
          </header>
          <CreationStudioJourney
            kind={creationStudioKind}
            active={creationStudioStage}
            available={creationJourneyAvailable}
            completed={creationJourneyCompleted}
            onChange={setCreationStudioStage}
          />
          {characterReferenceIssues && <p className="notice notice-warning" role="alert">{characterReferenceIssues}</p>}
          {notice && <p className="notice creation-global-notice" role="status">{notice}</p>}
          {activeCharacterContext && selectedCharacterWorkspace?.character.id === activeCharacterContext.profileId && (
            <section className="creation-character-context" aria-label="本轮角色上下文">
              <div>
                <span className="context-avatar" aria-hidden="true">角</span>
                <div>
                  <p className="eyebrow">本轮锁定角色</p>
                  <strong>{selectedCharacterWorkspace.character.name}</strong>
                  <p>
                    {selectedCharacterWorkspace.versions.find((item) => item.id === activeCharacterContext.versionId)?.label
                      ?? selectedCharacterWorkspace.activeVersion?.label
                      ?? "当前档案"}
                    {selectedCharacterWorkspace.states.find((item) => item.id === activeCharacterContext.stateId)?.name
                      ? ` · ${selectedCharacterWorkspace.states.find((item) => item.id === activeCharacterContext.stateId)?.name}`
                      : " · 基础状态"}
                  </p>
                </div>
              </div>
              <div className="form-actions">
                <span>{card.referenceAssetIds.length} 张参考图</span>
                <button type="button" onClick={() => setScreen("characters")}>查看角色</button>
                <button type="button" onClick={() => setActiveCharacterContext(undefined)}>解除锁定</button>
              </div>
            </section>
          )}
          {activeSceneContext && selectedSceneWorkspace?.scene.id === activeSceneContext.profileId && (
            <section className="creation-character-context creation-scene-context" aria-label="本轮场景上下文">
              <div>
                <span className="context-avatar scene-avatar" aria-hidden="true">景</span>
                <div>
                  <p className="eyebrow">本轮锁定场景</p>
                  <strong>{selectedSceneWorkspace.scene.name}</strong>
                  <p>{selectedSceneWorkspace.versions.find((item) => item.id === activeSceneContext.versionId)?.label ?? selectedSceneWorkspace.activeVersion?.label ?? "当前空间"}{selectedSceneWorkspace.states.find((item) => item.id === activeSceneContext.stateId)?.name ? ` · ${selectedSceneWorkspace.states.find((item) => item.id === activeSceneContext.stateId)?.name}` : " · 基础环境"}</p>
                </div>
              </div>
              <div className="form-actions">
                <span>{selectedSceneWorkspace.media.filter((item) => ["layout_reference", "lighting_reference", "material_reference", "master"].includes(item.role)).length} 张场景参考</span>
                <button type="button" onClick={() => setScreen("scenes")}>查看场景</button>
                <button type="button" onClick={() => setActiveSceneContext(undefined)}>解除锁定</button>
              </div>
            </section>
          )}
          {creationStudioStage === "plan" && <section className="creation-plan-panel" aria-label="创作方案">
            <header className={`creation-plan-header creation-plan-visual-header ${currentCreationPreset && activeCreationPresetId ? "" : "without-cover"}`}>
              {currentCreationPreset && activeCreationPresetId && (
                <figure className="creation-plan-cover">
                  <img src={CREATION_PRESET_ARTWORKS[activeCreationPresetId]} alt={`${currentCreationPreset.label}创作方向`} />
                  <figcaption>{currentCreationPreset.label}</figcaption>
                </figure>
              )}
              <div className="creation-plan-overview">
                <p className="eyebrow">{currentCharacterExtension ? "角色衍生方案已建立" : creationPlanStatus}</p>
                <h3>{currentCreationPreset?.label ?? creativeTasks.find((task) => task.id === activeTaskId)?.name ?? "当前创作"}</h3>
                <div className={`creation-plan-facts ${isStoryExtensionPlan ? "creation-plan-facts-compact" : ""}`} aria-label="创作方案摘要">
                  {currentCreationPlanItems.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}
                </div>
              </div>
              <div className="plan-header-actions">
                <button type="button" onClick={returnToCreationSetup}>返回调整</button>
                {creationStudioKind === "character" && !activeTask?.characterProfileId && <button type="button" onClick={() => void saveCharacter()}>保存为角色</button>}
                {creationStudioKind === "scene" && card.sceneProfileId && <button type="button" onClick={() => {
                  setSelectedSceneId(card.sceneProfileId ?? "");
                  setActiveDomain("assets");
                  setScreen("scenes");
                }}>查看场景资产</button>}
                {creationStudioKind === "series" && <button type="button" onClick={() => { setActiveDomain("production"); setScreen("production"); }}>进入生产准备</button>}
                {creationStudioKind === "image" && <button type="button" onClick={() => void saveCurrentTask()}>保存当前方案</button>}
                {creationStudioKind === "character" && <button type="button" aria-expanded={showReuseTools} onClick={() => setShowReuseTools((value) => !value)}>保存与复用</button>}
                {!isStoryExtensionPlan && <button type="button" aria-expanded={showAdvancedCreation} onClick={() => setShowAdvancedCreation((value) => !value)}>{showAdvancedCreation ? "收起设置" : "更多设置"}</button>}
              </div>
            </header>
            {!isStoryExtensionPlan && card.characterExtension && currentCharacterExtension && (
              <section className="creation-extension-summary" aria-label="当前角色衍生任务">
                <span className="character-extension-marker" aria-hidden="true">{currentCharacterExtension.marker}</span>
                <div>
                  <span>基于已锁定角色</span>
                  <strong>{currentCharacterExtension.label}</strong>
                  <small>{currentCharacterExtension.result} · 可回溯至角色、版本与状态</small>
                </div>
                <div className="creation-extension-provenance">
                  <span>角色 {selectedCharacterWorkspace?.character.name ?? characterName ?? "已锁定"}</span>
                  <span>{card.characterExtension.sourceVersionId ? "版本已锁定" : "当前档案"}</span>
                  <span>{card.characterExtension.sourceStateId ? "状态已锁定" : "基础状态"}</span>
                </div>
              </section>
            )}
            {isStoryExtensionPlan && currentCharacterExtension ? <div className="creation-plan-focus-layout">
              <div className="creation-plan-focus-main">
                {!card.sceneProfileId ? <section className="creation-extension-scene-picker" aria-label="选择剧情场景">
                  <header>
                    <div><span>只需完成当前选择</span><strong>这段剧情发生在哪里？</strong></div>
                    <small>点击画面即可，不用填写描述</small>
                  </header>
                  <div>
                    {GUIDED_SCENES.filter((option) => option.id !== "custom").map((option) => <button
                      type="button"
                      key={option.id}
                      aria-pressed={activeCharacterExtensionSceneId === option.id}
                      className={activeCharacterExtensionSceneId === option.id ? "selected" : ""}
                      onClick={() => void selectCharacterExtensionScene(option.id)}
                    >
                      {SCENE_ARTWORKS[option.id] && <img src={SCENE_ARTWORKS[option.id]} alt="" />}
                      <span><strong>{option.label}</strong><small>{option.prompt}</small></span>
                    </button>)}
                  </div>
                </section> : <section className="creation-plan-saved-scene" aria-label="已锁定剧情场景">
                  <span className="context-avatar scene-avatar" aria-hidden="true">景</span>
                  <div><small>场景已锁定</small><strong>{selectedSceneWorkspace?.scene.name ?? "当前场景资产"}</strong><p>空间基线与状态已经进入本轮剧情方案。</p></div>
                  <button type="button" onClick={() => {
                    setSelectedSceneId(card.sceneProfileId ?? "");
                    setActiveDomain("assets");
                    setScreen("scenes");
                  }}>查看场景</button>
                </section>}
                <details className="creation-plan-details">
                  <summary>查看已锁定内容</summary>
                  <section className="creation-extension-summary" aria-label="当前角色衍生任务">
                    <span className="character-extension-marker" aria-hidden="true">{currentCharacterExtension.marker}</span>
                    <div>
                      <span>基于已锁定角色</span>
                      <strong>{currentCharacterExtension.label}</strong>
                      <small>{currentCharacterExtension.result} · 可回溯至角色、版本与状态</small>
                    </div>
                    <div className="creation-extension-provenance">
                      <span>角色 {selectedCharacterWorkspace?.character.name ?? characterName ?? "已锁定"}</span>
                      <span>{card.characterExtension?.sourceVersionId ? "版本已锁定" : "当前档案"}</span>
                      <span>{card.characterExtension?.sourceStateId ? "状态已锁定" : "基础状态"}</span>
                    </div>
                  </section>
                  {card.candidatePlan?.length ? <section className="creation-sequence-summary" aria-label="当前执行计划">
                    <header><span>执行计划</span><strong>{card.candidatePlan.length} 个创作项</strong></header>
                    <ol>
                      {card.candidatePlan.map((item, index) => <li key={`${index}-${item.id}`}>
                        <i>{String(index + 1).padStart(2, "0")}</i>
                        <span><strong>{item.label}</strong><small>{item.directive}</small></span>
                      </li>)}
                    </ol>
                  </section> : null}
                  {card.characterCore && <section className="creation-character-core-summary" aria-label="当前角色内核">
                    <header><span>角色内核</span><strong>已写入人物资产</strong></header>
                    <div>
                      {[
                        ["身份", GUIDED_ROLES.find((item) => item.id === card.characterCore?.roleId)?.label],
                        ["性格", GUIDED_MOODS.find((item) => item.id === card.characterCore?.personalityId)?.label],
                        ["声线", GUIDED_VOICES.find((item) => item.id === card.characterCore?.voiceId)?.label],
                        ["关系", GUIDED_RELATIONSHIPS.find((item) => item.id === card.characterCore?.relationshipId)?.label],
                        ["兴趣", GUIDED_INTERESTS.find((item) => item.id === card.characterCore?.interestId)?.label],
                        ["表演", GUIDED_PERFORMANCES.find((item) => item.id === card.characterCore?.performanceId)?.label],
                        ["原型", GUIDED_ARCHETYPES.find((item) => item.id === card.characterCore?.archetypeId)?.label],
                        ["目标", GUIDED_DRIVES.find((item) => item.id === card.characterCore?.driveId)?.label],
                        ["冲突", GUIDED_CONFLICTS.find((item) => item.id === card.characterCore?.conflictId)?.label],
                        ["开场", GUIDED_OPENINGS.find((item) => item.id === card.characterCore?.openingId)?.label],
                      ].map(([label, value]) => <p key={label}><span>{label}</span><strong>{value ?? "未设置"}</strong></p>)}
                    </div>
                  </section>}
                </details>
              </div>
              <aside className="creation-plan-focus-rail" aria-label="本次创作摘要">
                <div><p className="eyebrow">本次创作</p><h4>{currentCharacterExtension.label}</h4></div>
                <div className="creation-plan-facts">
                  {currentCreationPlanItems.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}
                </div>
                <div className="creation-plan-next">
                  <span>{characterExtensionNeedsScene ? "选择一个场景即可继续" : "已保存到本地，可继续选择剧情方向"}</span>
                  <button type="button" className="primary-button" disabled={characterExtensionNeedsScene} onClick={() => setCreationStudioStage("candidates")}>{characterExtensionNeedsScene ? "请先选择场景" : "下一步 · 选择方向"}</button>
                </div>
              </aside>
            </div> : <>
            {card.candidatePlan?.length && (
              <section className="creation-sequence-summary" aria-label={card.deliveryMode === "series_pack" ? "当前镜头计划" : "当前执行计划"}>
                <header><span>{card.deliveryMode === "series_pack" ? "镜头计划" : "执行计划"}</span><strong>{card.candidatePlan.length} 个生成项</strong></header>
                <ol>
                  {card.candidatePlan.map((item, index) => <li key={`${index}-${item.id}`}>
                    <i>{String(index + 1).padStart(2, "0")}</i>
                    <span><strong>{item.label}</strong><small>{item.directive}</small></span>
                  </li>)}
                </ol>
              </section>
            )}
            {card.characterCore && (
              <section className="creation-character-core-summary" aria-label="当前角色内核">
                <header><span>角色内核</span><strong>已写入人物资产</strong></header>
                <div>
                  {[
                    ["身份", GUIDED_ROLES.find((item) => item.id === card.characterCore?.roleId)?.label],
                    ["性格", GUIDED_MOODS.find((item) => item.id === card.characterCore?.personalityId)?.label],
                    ["声线", GUIDED_VOICES.find((item) => item.id === card.characterCore?.voiceId)?.label],
                    ["关系", GUIDED_RELATIONSHIPS.find((item) => item.id === card.characterCore?.relationshipId)?.label],
                    ["兴趣", GUIDED_INTERESTS.find((item) => item.id === card.characterCore?.interestId)?.label],
                    ["表演", GUIDED_PERFORMANCES.find((item) => item.id === card.characterCore?.performanceId)?.label],
                    ["原型", GUIDED_ARCHETYPES.find((item) => item.id === card.characterCore?.archetypeId)?.label],
                    ["目标", GUIDED_DRIVES.find((item) => item.id === card.characterCore?.driveId)?.label],
                    ["冲突", GUIDED_CONFLICTS.find((item) => item.id === card.characterCore?.conflictId)?.label],
                    ["开场", GUIDED_OPENINGS.find((item) => item.id === card.characterCore?.openingId)?.label],
                  ].map(([label, value]) => <p key={label}><span>{label}</span><strong>{value ?? "未设置"}</strong></p>)}
                </div>
              </section>
            )}
            <div className="creation-plan-next">
              <span>方案已保存在本地，可以继续选择方向。</span>
              <button type="button" className="primary-button" onClick={() => setCreationStudioStage("candidates")}>下一步 · 选择方向</button>
            </div>
            </>}
          </section>}
          {creationStudioStage !== "plan" && <>
          {creationStudioStage === "candidates" && (activeTaskCandidates.length > 0 || isGeneratingCandidates) && <section className="creation-control-bar creation-candidate-controls" aria-label="候选生成设置">
            <div className="compact-control">
              <label>画幅<select value={normalizeCreativeAspectRatio(card.aspectRatio)} onChange={(event) => updateCard("aspectRatio", event.target.value)}>{CREATIVE_ASPECT_RATIOS.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
              <label>候选数<select value={creationCandidateCount} onChange={(event) => setCreationCandidateCount(Number(event.target.value) as 1 | 2 | 4)}><option value="1">1 张</option><option value="2">2 张</option><option value="4">4 张</option></select></label>
              <span className="creation-context-count">{card.referenceAssetIds.length ? `${card.referenceAssetIds.length} 张参考图` : "当前方案"}</span>
            </div>
            {canGenerateCurrentImage
              ? <button className="primary-button creation-generate-button" disabled={Boolean(characterReferenceIssues) || isGeneratingCandidates} onClick={() => void generateFirstVersion()}>{isGeneratingCandidates ? "正在生成…" : activeTaskCandidates.length ? "再生成一组" : "生成候选"}</button>
              : <span className="creation-service-note">方案可继续编辑；需要出图时再连接生成服务。</span>}
          </section>}
          <section className={`creation-studio-grid stage-${creationStudioStage}`} aria-label="候选与继续创作">
            {activeTaskCandidates.length || isGeneratingCandidates
              ? <CreationCandidateGallery
                candidates={activeTaskCandidates}
                selectedId={selectedCreationCandidate?.id}
                generating={isGeneratingCandidates}
                comparisonIds={activeTaskComparisonIds}
                detailsByAssetId={activeTaskCandidateDetails}
                emptyPreviewSrc={localDirectionPreviewSrc}
                emptyTitle={creationWorkspaceCopy.emptyTitle}
                emptyDescription={creationWorkspaceCopy.emptyDescription}
                onSelect={(assetId) => {
                  setSelectedCreationCandidateId(assetId);
                  setSelectedAssetId(assetId);
                }}
                onToggleComparison={toggleCandidateComparison}
              />
              : <LocalDirectionCandidateGallery
                previewSrc={localDirectionPreviewSrc}
                variations={localDirectionCandidates}
                selectedId={effectiveLocalDirectionId}
                onSelect={(variationId) => {
                  setSelectedLocalDirectionId(variationId);
                  setConfirmedLocalDirectionId("");
                  setLocalRefinementApplied(false);
                }}
              />}
            <aside className="creation-iteration-panel">
              <header>
                <p className="eyebrow">继续创作</p>
                <h3>{selectedCreationCandidate
                  ? "基于所选候选继续"
                  : creationStudioStage === "candidates"
                    ? "选择一个方案方向"
                    : creationStudioStage === "refine"
                      ? "一次只调整一个变量"
                    : creationStudioStage === "asset"
                      ? "保存并继续复用"
                      : creationWorkspaceCopy.pendingTitle}</h3>
              </header>
              {selectedCreationCandidate ? <>
                <div className="creation-selected-summary">
                  <strong>{selectedCreationCandidate.name}</strong>
                  <span>{selectedCreationCandidate.confirmation === "confirmed" ? "已确认" : selectedCreationCandidate.confirmation === "rejected" ? "已淘汰" : "待确认"} · {selectedCreationCandidate.rightsStatus === "original" ? "原创" : selectedCreationCandidate.rightsStatus === "authorized" ? "已授权" : "权利待复核"}</span>
                </div>
                {creationStudioStage === "candidates" && <>
                <div className="candidate-decision-actions">
                  {selectedCreationCandidate.confirmation === "draft" && <>
                    <button type="button" onClick={() => void reviewAsset("confirmed", selectedCreationCandidate.id)}>确认候选</button>
                    <button type="button" onClick={() => void reviewAsset("rejected", selectedCreationCandidate.id)}>淘汰</button>
                  </>}
                  <button type="button" onClick={() => { setSelectedAssetId(selectedCreationCandidate.id); setScreen("review"); }}>完整审片</button>
                </div>
                <button type="button" className="primary-button creation-stage-next" onClick={() => setCreationStudioStage("refine")}>下一步 · 局部调整</button>
                </>}
                {creationStudioStage === "refine" && <>
                  <div className="creation-section-heading"><span>只改变一项</span><small>其他约束继续锁定</small></div>
                  <div className="refinement-choice-grid" role="group" aria-label="候选变化方式">
                    {activeCreationRefinements.map((preset) => <button type="button" key={preset.id} aria-pressed={creationRefinementId === preset.id} className={creationRefinementId === preset.id ? "refinement-choice refinement-selected" : "refinement-choice"} onClick={() => setCreationRefinementId(preset.id)}><strong>{preset.label}</strong><small>{preset.description}</small></button>)}
                  </div>
                  <button type="button" className="iteration-generate-button" onClick={() => void applyRefinementToPlan()}>先应用到方案</button>
                  {canGenerateCurrentImage && <button type="button" className="iteration-generate-button secondary" disabled={isGeneratingCandidates} onClick={() => void generateSelectedRefinement()}>{isGeneratingCandidates ? "正在生成变化…" : "生成变化候选"}</button>}
                  <button type="button" className="primary-button creation-stage-next" onClick={() => setCreationStudioStage("asset")}>下一步 · 沉淀资产</button>
                </>}
                {creationStudioStage === "asset" && <>
                {selectedCreationCandidate.confirmation === "confirmed" && !["authorized", "original"].includes(selectedCreationCandidate.rightsStatus) && (
                  <div className="creation-inline-rights">
                    <strong>入库前复核使用权</strong>
                    <AssetRightsEditor asset={selectedCreationCandidate} onSaved={async () => {
                      await refresh();
                      setAssets(await window.studio.assets.list({ projectId: selectedProjectId || undefined }));
                    }} />
                  </div>
                )}
                <div className="creation-output-actions">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={selectedCreationCandidate.confirmation !== "confirmed" || !["authorized", "original"].includes(selectedCreationCandidate.rightsStatus)}
                    onClick={() => void setSelectedAssetAsMaster(selectedCreationCandidate)}
                  >锁定为母版</button>
                  <button
                    type="button"
                    disabled={Boolean(activeTask?.characterProfileId) || selectedCreationCandidate.confirmation !== "confirmed" || !["authorized", "original"].includes(selectedCreationCandidate.rightsStatus)}
                    onClick={() => void saveCandidateAsCharacter(selectedCreationCandidate)}
                  >{activeTask?.characterProfileId ? "角色资产已关联" : "沉淀为角色资产"}</button>
                  <button type="button" onClick={() => {
                    setSelectedAssetId(selectedCreationCandidate.id);
                    setShotPurpose("video");
                    setShot((current) => ({ ...current, referenceAssetIds: [selectedCreationCandidate.id], startFrame: card.scene || card.intent }));
                    setActiveDomain("production");
                    setScreen("shot");
                  }}>继续做动态</button>
                </div>
                </>}
              </> : creationStudioStage === "candidates" && selectedLocalDirection ? <div className="creation-local-direction-summary">
                <span className="creation-local-badge">本地方案候选</span>
                <h3>{selectedLocalDirection.label}</h3>
                <p>{selectedLocalDirection.directive}</p>
                <dl>
                  <div><dt>人物身份</dt><dd>保持锁定</dd></div>
                  <div><dt>造型场景</dt><dd>保持锁定</dd></div>
                  <div><dt>本次变化</dt><dd>{selectedLocalDirection.label}</dd></div>
                </dl>
                <button type="button" className="primary-button creation-stage-next" onClick={() => void confirmLocalDirectionCandidate()}>确认方向 · 继续调整</button>
                <small>方向已经保存，可以继续调整。</small>
              </div> : creationStudioStage === "refine" ? <div className="creation-plan-refinement">
                <strong>一次只调整一个变量</strong>
                <p>选择一个变化方向，人物、服装和场景继续保持锁定。</p>
                <div className="refinement-choice-grid" role="group" aria-label="方案变化方式">
                  {activeCreationRefinements.map((preset) => <button type="button" key={preset.id} aria-pressed={creationRefinementId === preset.id} className={creationRefinementId === preset.id ? "refinement-choice refinement-selected" : "refinement-choice"} onClick={() => setCreationRefinementId(preset.id)}><strong>{preset.label}</strong><small>{preset.description}</small></button>)}
                </div>
                <button type="button" className="primary-button creation-stage-next" onClick={() => void applyRefinementToPlan()}>应用到当前方案</button>
                {confirmedLocalDirectionId && <button type="button" className="secondary-button creation-stage-next" onClick={() => setCreationStudioStage("asset")}>完成调整 · 保存资产</button>}
              </div> : creationStudioStage === "asset" && confirmedLocalDirectionId ? <div className="creation-local-asset-panel">
                <span className="creation-local-badge">方案资产</span>
                <h3>{creationAssetCopy.title}</h3>
                <p>{creationAssetCopy.description}</p>
                <div className="creation-local-asset-facts">
                  <div><span>方向</span><strong>{localDirectionCandidates.find((item) => item.id === confirmedLocalDirectionId)?.label ?? "已确认"}</strong></div>
                  <div><span>调整</span><strong>{localRefinementApplied ? "已写入" : "沿用方案"}</strong></div>
                  <div><span>资产</span><strong>{creationAssetCopy.status}</strong></div>
                </div>
                <div className="creation-output-actions local-output-actions">
                  {creationStudioKind === "character" && !activeTask?.characterProfileId && <button type="button" className="primary-button" onClick={() => void saveCharacter()}>保存为角色方案</button>}
                  {creationStudioKind === "scene" && card.sceneProfileId && <button type="button" className="primary-button" onClick={() => {
                    setSelectedSceneId(card.sceneProfileId ?? "");
                    setActiveDomain("assets");
                    setScreen("scenes");
                  }}>查看场景资产</button>}
                  {creationStudioKind === "scene" && !card.sceneProfileId && <button type="button" className="primary-button" onClick={() => void saveCurrentPlanAsSceneAsset()}>保存为场景资产</button>}
                  <button type="button" onClick={() => void saveCurrentTask()}>保存创作任务</button>
                  <button type="button" onClick={() => { setActiveDomain("production"); setScreen("production"); }}>进入生产准备</button>
                </div>
                <small>方案与资产已经保存在当前任务中。</small>
              </div> : <div className="creation-iteration-empty">
                <ol>
                  <li><span>1</span><div><strong>生成候选</strong><small>确认后再开始，不会自动调用</small></div></li>
                  <li><span>2</span><div><strong>选择一张</strong><small>支持并排比较和淘汰</small></div></li>
                  <li><span>3</span><div><strong>继续变化</strong><small>只换表情、动作、造型或场景</small></div></li>
                </ol>
              </div>}
            </aside>
            <div className="creation-inline-compare">
              <CandidateComparePanel
                items={activeTaskCandidateItems.filter(({ asset }) => activeTaskComparisonIds.includes(asset.id))}
                renderAsset={(asset) => <AssetVisual asset={asset} />}
                onClear={() => setCompareAssetIds((current) => current.filter((assetId) => !activeTaskComparisonIds.includes(assetId)))}
                onOpen={(assetId) => { setSelectedAssetId(assetId); setScreen("review"); }}
              />
            </div>
          </section>
          </>}
          {showAdvancedCreation && <section className="form-panel creation-advanced-panel" aria-label="高级创作设置">
            <div className="paradigm-summary">
              <div>
                <p className="eyebrow">视觉范式</p>
                <strong>{card.paradigmIds?.length ? paradigmComposition?.paradigms.map((item) => item.name).join(" × ") || "已带入范式" : "使用当前方案默认视觉方向"}</strong>
              </div>
              <button onClick={() => setScreen("paradigms")}>更换范式</button>
            </div>
            <div className="form-grid">
              {([
                ["intent", "创作目标"], ["subject", "主体"], ["identityAnchor", "身份锚点"], ["mustKeep", "必须保持"],
                ["bodyAndWardrobe", "身材与衣着"], ["expressionAndPose", "表情与动作"], ["scene", "场景"],
                ["lighting", "光线"], ["camera", "镜头与构图"], ["style", "成图质感"], ["avoid", "避免项"],
              ] as [keyof CreativeCard, string][]).map(([key, label]) => <label key={key}>{label}<textarea value={card[key] as string} onChange={(event) => updateCard(key, event.target.value)} /></label>)}
            </div>
            <ReferenceBindingsPanel card={card} assets={assets} onChange={setCard} />
            <div className="form-actions">
              <button disabled={!canUse("text")} onClick={() => void enrichCard()}>{canUse("text") ? "重新智能补全" : "创作模型未连接"}</button>
              <button onClick={() => void saveCurrentTask()}>保存任务修改</button>
            </div>
          </section>}
          {showReuseTools && <section className="form-panel creation-reuse-panel" aria-label="保存与复用">
            <div className="creation-section-heading"><span>沉淀资产</span><small>需要时再保存角色或配方，不影响本次生成</small></div>
            <div className="form-actions">
              <label>角色名称<input value={characterName} onChange={(event) => setCharacterName(event.target.value)} placeholder="例如：蝶灵仙姬" /></label>
              <label>角色组<select value={characterGroup} onChange={(event) => setCharacterGroup(event.target.value as CharacterGroup)}>{Object.entries(CHARACTER_GROUP_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <button onClick={() => void saveCharacter()}>保存角色档案</button>
              <button onClick={() => void saveCurrentTask()}>保存当前任务</button>
            </div>
            <div className="form-actions reuse-recipe-row">
              <label>配方名称<input value={recipeName} onChange={(event) => setRecipeName(event.target.value)} /></label>
              <label>适用用途<input value={recipePurpose} onChange={(event) => setRecipePurpose(event.target.value)} /></label>
              <label>适用条件<input value={recipeApplicability} onChange={(event) => setRecipeApplicability(event.target.value)} /></label>
              <label>失效条件<textarea value={recipeInvalidation} onChange={(event) => setRecipeInvalidation(event.target.value)} /></label>
              <button onClick={() => void saveRecipe()}>保存为配方</button>
            </div>
          </section>}
          {promptBuild && showPromptDetails && (
            <section className="result-panel creation-prompt-panel">
              <p className="eyebrow">可复制的生成指令</p>
              <pre>{translation?.positive ?? promptBuild.positive}</pre>
              <p className="eyebrow">避免项</p>
              <pre>{(translation?.negative ?? promptBuild.negative) || "未填写"}</pre>
              <div className="form-actions">
                <button disabled={!canUse("text")} onClick={() => void translatePrompt()}>{canUse("text") ? "重新适配模型" : "使用原始指令"}</button>
                <button onClick={() => { setTranslation(undefined); window.studio.creation.compilePrompt(card).then(setPromptBuild); }}>重新编译</button>
              </div>
              {translation && <p className="result-note">模型适配：{translation.notes.join("；") || "沿用原始提示词"}；原始指令仍保留。</p>}
            </section>
          )}
        </section>
      )}
      {screen === "recipes" && (
        <section className="workspace">
          <header className="workspace-header">
            <div>
              <p className="eyebrow">创作配方 / 被实际结果验证过的创作起点</p>
              <h2>沉淀可复用配方</h2>
            </div>
            <button className="primary-button" onClick={() => setScreen("creation")}>新建配方</button>
          </header>
          <section className="form-panel">
            <p className="result-note">保存创作卡、提示词和参考资产；验证后再复用。</p>
          </section>
          <section className="form-panel template-feature-card" aria-label="角色设定板模板">
            <div>
              <p className="eyebrow">内置模板 / 角色资产</p>
              <h3>角色设定板（Character Sheet）</h3>
              <p className="result-note">固定同一角色的多角度设定；生成前先选择角色。</p>
            </div>
            <div className="form-actions">
              <button onClick={() => setScreen("characters")}>先选择角色</button>
              <button className="primary-button" disabled={!selectedCharacterId} onClick={() => void createCharacterSheetTask()}>为当前角色建立设定板任务</button>
            </div>
          </section>
          <section className="pattern-list recipe-list">
            {recipes.map((recipe) => (
              <article key={recipe.id}>
                <span className={`pattern-status pattern-${recipe.status}`}>{recipe.status === "validated" ? "已验证" : recipe.status === "rejected" ? "已淘汰" : "待验证"}</span>
                <div>
                  <h3>{recipe.name}</h3>
                  <p>用途：{recipe.purpose} · 参考资产：{recipe.sourceAssetIds.length} 个</p>
                  <p>适用：{recipe.applicability || "未填写"}</p>
                  <p>失效：{recipe.invalidationConditions.length ? recipe.invalidationConditions.join("；") : "未填写"}</p>
                  <p>来源任务：{recipe.creativeTaskId ? creativeTasks.find((task) => task.id === recipe.creativeTaskId)?.name ?? "已归档任务" : "未关联"} · 绘图模型：{providerLabel(recipe.providerId)}</p>
                  <p className="pattern-module">{recipe.prompt.slice(0, 260)}{recipe.prompt.length > 260 ? "…" : ""}</p>
                  {recipe.evidence.length > 0 && <p>验证记录：{recipe.evidence.join("；")}</p>}
                  <div className="pattern-actions">
                    <button onClick={() => loadRecipe(recipe)}>加载到创作卡</button>
                    {recipe.status === "draft" && <>
                      <select aria-label={`${recipe.name}验证成图`} value={recipeReviewSelections[recipe.id] ?? ""}
                        onChange={(event) => setRecipeReviewSelections((current) => ({ ...current, [recipe.id]: event.target.value }))}>
                        <option value="">选择已通过成图</option>
                        {(reviewWorkspace?.reviews ?? []).filter((item) => item.decision === "approved" &&
                          (!recipe.creativeTaskId || item.creativeTaskId === recipe.creativeTaskId)).map((item) => <option value={item.id} key={item.id}>
                          {reviewWorkspace?.candidates.find((candidate) => candidate.asset.id === item.assetId)?.asset.name ?? item.assetId}
                        </option>)}
                      </select>
                      <button disabled={!recipeReviewSelections[recipe.id]} onClick={() => void reviewRecipe(recipe, "validated")}>用成图验证</button>
                      <button onClick={() => void reviewRecipe(recipe, "rejected")}>淘汰配方</button>
                    </>}
                  </div>
                </div>
              </article>
            ))}
            {!recipes.length && <div className="empty-state empty-state-action"><div><strong>还没有创作配方</strong><p>先在创作卡完成一次结构化提示词，再把已经验证有效的方法沉淀为配方。</p></div><button className="primary-button" onClick={() => setScreen("creation")}>去建立配方</button></div>}
          </section>
        </section>
      )}
      {screen === "production" && (
        <section className="workspace">
          <header className="workspace-header">
            <div>
              <p className="eyebrow">批量生产 / 只改变一个变量</p>
              <h2>固定角色，批量测试</h2>
            </div>
          </header>
          <section className="form-panel">
            <p className="result-note">
              先编译提示词；每行只改一个变量。
            </p>
            <label>
              任务名称
              <input
                value={batchName}
                onChange={(event) => setBatchName(event.target.value)}
              />
            </label>
            <label>
              变化项（每行一个）
              <textarea
                value={batchVariables}
                onChange={(event) => setBatchVariables(event.target.value)}
              />
            </label>
            <div className="form-actions">
              <button
                className="primary-button"
                disabled={!canUse("image") || !promptBuild}
                onClick={() => void createBatch()}
              >
                建立候选任务
              </button>
            </div>
          </section>
          <section className="pattern-list">
            {batches.map((batch) => (
              <article key={batch.id}>
                <span
                  className={`pattern-status ${batch.status === "completed" ? "pattern-validated" : ""}`}
                >
                  {batch.status === "draft"
                    ? "待执行"
                    : batch.status === "running"
                      ? "执行中"
                      : batch.status === "completed"
                        ? "已完成"
                        : batch.status === "interrupted"
                          ? "已中断，待核对"
                          : "部分失败"}
                </span>
                <div>
                  <h3>{batch.name}</h3>
                  <p>
                    {providerLabel(batch.providerId)} ·{" "}
                    {batch.variants.length} 个候选 ·{" "}
                    {batch.estimatedCostUsd
                      ? `预计 $${batch.estimatedCostUsd}`
                      : "费用按模型账单结算"}
                  </p>
                  <p className="batch-task-link">
                    {batch.creativeTaskId
                      ? `关联任务：${creativeTasks.find((task) => task.id === batch.creativeTaskId)?.name ?? "已归档任务"}`
                      : "未关联创作任务"}
                  </p>
                  <p className="pattern-module">
                    {batch.variants
                      .map(
                        (item) =>
                          `${item.label}：${item.status === "completed" ? "已入库" : item.status === "failed" ? "失败" : "待生成"}`,
                      )
                      .join("；")}
                  </p>
                  <div className="pattern-actions">
                    {batch.status === "draft" && (
                      <button
                        className="primary-button"
                        onClick={() => void runBatch(batch.id)}
                      >
                        执行这批候选
                      </button>
                    )}
                    {batch.creativeTaskId && (
                      <button onClick={() => {
                        const task = creativeTasks.find((item) => item.id === batch.creativeTaskId);
                        if (task) void openCreativeTask(task);
                      }}>
                        查看关联任务
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
            {!batches.length && (
              <div className="empty-state empty-state-action">
                <div><strong>尚未建立候选任务</strong><p>先生成提示词，再填变化项。</p></div>
                <button className="primary-button" onClick={() => setScreen("creation")}>去创作卡生成提示词</button>
              </div>
            )}
          </section>
          <section className="form-panel">
            <p className="eyebrow">候选审片台</p>
            <p className="result-note">
              选 2–4 张比较，再定主版本。
            </p>
            <CandidateComparePanel
              items={comparedCandidates}
              renderAsset={(asset) => <AssetVisual asset={asset} />}
              onClear={() => setCompareAssetIds([])}
              onOpen={(assetId) => { setSelectedAssetId(assetId); setScreen("review"); }}
            />
            <div className="asset-grid">
              {batches
                .flatMap((batch) =>
                  batch.variants
                    .filter((item) => item.assetId)
                    .map((item) => ({
                      batch,
                      item,
                      asset: assets.find((asset) => asset.id === item.assetId),
                    })),
                )
                .filter(
                  (
                    item,
                  ): item is {
                    batch: GenerationBatch;
                    item: GenerationBatch["variants"][number];
                    asset: Asset;
                  } => Boolean(item.asset),
                )
                .map(({ batch, item, asset }) => (
                  <article
                    className={`${assetClass(asset.type)} ${selectedAssetId === asset.id ? "asset-selected" : ""}`}
                    key={item.id}
                    onClick={() => {
                      setSelectedAssetId(asset.id);
                      if (batch.creativeTaskId) setActiveTaskId(batch.creativeTaskId);
                      setScreen("assets");
                    }}
                  >
                    <AssetVisual asset={asset} />
                    <div className="asset-body">
                      <h3>{item.label}</h3>
                      <p>{batch.name}</p>
                      <small>
                        {asset.confirmation === "confirmed"
                          ? "已确认主版本"
                          : "点击进入审片"}
                      </small>
                      <button
                        className={compareAssetIds.includes(asset.id) ? "compare-selected" : "compare-button"}
                        onClick={(event) => { event.stopPropagation(); toggleCandidateComparison(asset.id); }}
                      >
                        {compareAssetIds.includes(asset.id) ? "已加入比较" : "加入比较"}
                      </button>
                    </div>
                  </article>
                ))}
            </div>
          </section>
        </section>
      )}
      {screen === "review" && (
        <section className="workspace review-page">
          <header className="workspace-header">
            <div>
              <p className="eyebrow">生产 / 审片与母版</p>
              <h2>从候选里选出可复用的生产基线</h2>
            </div>
          </header>
          {!selectedProjectId && <div className="empty-state empty-state-action"><div><strong>先选择项目</strong><p>审片记录、任务来源和母版归属都必须落在明确项目中。</p></div></div>}
          {selectedProjectId && reviewWorkspace && <ReviewWorkspacePanel
            snapshot={reviewWorkspace}
            characters={characters}
            scenes={scenes}
            onChanged={async (workspace) => {
              setReviewWorkspace(workspace);
              const [, , updatedScenes] = await Promise.all([
                refresh(),
                refreshCharacterRelations(),
                window.studio.sceneWorkspace.list(selectedProjectId),
              ]);
              setScenes(updatedScenes);
              setProjectWorkspace(await window.studio.projects.workspace(selectedProjectId));
              setNotice("审片工作台已更新。");
            }}
            onOpenAsset={(assetId) => { setSelectedAssetId(assetId); setScreen("assets"); }}
          />}
          {selectedProjectId && !reviewWorkspace && <p className="result-note">正在读取图片候选…</p>}
        </section>
      )}
      {screen === "shot" && (
        <section className="workspace">
          <header className="workspace-header">
            <div>
              <p className="eyebrow">生产 / 镜头工作室</p>
              <h2>把角色、场景与本镜动作锁进同一条生产记录</h2>
            </div>
          </header>
          <section className="form-panel shot-binding-panel" aria-label="镜头资产绑定">
            <div className="inspector-heading"><div><p className="eyebrow">资产绑定</p><h3>本镜使用什么角色与场景</h3></div><span className="pattern-status">{shotPurpose === "image" ? "静态图片" : "动态视频"}</span></div>
            <div className="form-grid">
              <label>交付类型<select value={shotPurpose} onChange={(event) => {
                const purpose = event.target.value as ShotPlan["purpose"];
                setShotPurpose(purpose);
                setShot((current) => ({
                  ...current,
                  deliveryType: purpose,
                  cameraMotion: ["85mm 平视中景", "缓慢推近"].includes(current.cameraMotion)
                    ? purpose === "image" ? "85mm 平视中景" : "缓慢推近"
                    : current.cameraMotion,
                }));
              }}><option value="image">静态图片</option><option value="video">动态视频</option></select></label>
              <label>角色<select aria-label="镜头角色" value={shotCharacterId} onChange={(event) => { setShotCharacterId(event.target.value); setShotCharacterVersionId(""); setShotCharacterStateId(""); }}><option value="">不使用角色</option>{characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label>
              {shotCharacterWorkspace && <>
                <label>角色版本<select value={shotCharacterVersionId} onChange={(event) => { const versionId = event.target.value; setShotCharacterVersionId(versionId); const state = shotCharacterWorkspace.states.find((item) => item.id === shotCharacterStateId); if (state?.versionId && versionId && state.versionId !== versionId) setShotCharacterStateId(""); }}><option value="">当前档案</option>{shotCharacterWorkspace.versions.map((version) => <option value={version.id} key={version.id}>V{version.versionNumber} · {version.label}</option>)}</select></label>
                <label>角色状态<select value={shotCharacterStateId} onChange={(event) => setShotCharacterStateId(event.target.value)}><option value="">基础状态</option>{shotCharacterWorkspace.states.filter((state) => !shotCharacterVersionId || !state.versionId || state.versionId === shotCharacterVersionId).map((state) => <option value={state.id} key={state.id}>{state.name}</option>)}</select></label>
              </>}
              <label>场景<select aria-label="镜头场景" value={shotSceneId} onChange={(event) => { setShotSceneId(event.target.value); setShotSceneVersionId(""); setShotSceneStateId(""); }}><option value="">不使用场景档案</option>{scenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select></label>
              {shotSceneWorkspace && <>
                <label>场景版本<select value={shotSceneVersionId} onChange={(event) => { const versionId = event.target.value; setShotSceneVersionId(versionId); const state = shotSceneWorkspace.states.find((item) => item.id === shotSceneStateId); if (state?.versionId && versionId && state.versionId !== versionId) setShotSceneStateId(""); }}><option value="">当前空间</option>{shotSceneWorkspace.versions.map((version) => <option value={version.id} key={version.id}>V{version.versionNumber} · {version.label}</option>)}</select></label>
                <label>环境状态<select value={shotSceneStateId} onChange={(event) => setShotSceneStateId(event.target.value)}><option value="">基础环境</option>{shotSceneWorkspace.states.filter((state) => !shotSceneVersionId || !state.versionId || state.versionId === shotSceneVersionId).map((state) => <option value={state.id} key={state.id}>{state.name}</option>)}</select></label>
              </>}
              <label>跨镜连续性<textarea value={shotContinuityNotes} onChange={(event) => setShotContinuityNotes(event.target.value)} placeholder="例如：脸、服装、发型与空间中轴不变" /></label>
            </div>
          </section>
          <section className="form-panel">
            <div className="form-grid">
              <label>
                镜头名称
                <input
                  value={shotName}
                  onChange={(event) => setShotName(event.target.value)}
                  placeholder="例如：01 夜色回眸"
                />
              </label>
              <label>
                {shotPurpose === "image" ? "参考图片" : "起始帧图片"}
                <select
                  value={selectedAssetId}
                  onChange={(event) => setSelectedAssetId(event.target.value)}
                >
                  <option value="">{shotPurpose === "image" ? "不使用参考图（文字生图）" : "不使用起始帧（文字生视频）"}</option>
                  {selectableImages.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                人物/主体锚点
                <textarea
                  value={shot.subjectAnchor}
                  onChange={(event) =>
                    setShot((current) => ({
                      ...current,
                      subjectAnchor: event.target.value,
                    }))
                  }
                  placeholder="哪些特征必须全程不变"
                />
              </label>
              <label>
                {shotPurpose === "image" ? "画面构图" : "起始画面"}
                <textarea
                  value={shot.startFrame}
                  onChange={(event) =>
                    setShot((current) => ({
                      ...current,
                      startFrame: event.target.value,
                    }))
                  }
                  placeholder={shotPurpose === "image" ? "主体位置、景别和画面关系" : "视频第一帧应该是什么样"}
                />
              </label>
              <label>
                {shotPurpose === "image" ? "姿态与动作" : "唯一动作"}
                <textarea
                  value={shot.action}
                  onChange={(event) =>
                    setShot((current) => ({
                      ...current,
                      action: event.target.value,
                    }))
                  }
                  placeholder="例如：微风吹动发丝"
                />
              </label>
              <label>
                {shotPurpose === "image" ? "镜头与机位" : "镜头运动"}
                <textarea
                  value={shot.cameraMotion}
                  onChange={(event) =>
                    setShot((current) => ({
                      ...current,
                      cameraMotion: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <div className="form-actions">
              {shotPurpose === "video" && <label>
                时长
                <select
                  value={shot.durationSeconds}
                  onChange={(event) =>
                    setShot((current) => ({
                      ...current,
                      durationSeconds: Number(event.target.value) as 4 | 8 | 12,
                    }))
                  }
                >
                  <option value="4">4 秒</option>
                  <option value="8">8 秒</option>
                  <option value="12">12 秒</option>
                </select>
              </label>}
              {shotPurpose === "video" && <label>
                输出
                <select
                  value={shot.output.resolution}
                  onChange={(event) =>
                    setShot((current) => ({
                      ...current,
                      output: {
                        ...current.output,
                        resolution: event.target.value as "720p" | "1080p",
                      },
                    }))
                  }
                >
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                </select>
              </label>}
              <label>
                画幅
                <select value={shot.output.aspectRatio} onChange={(event) => setShot((current) => ({ ...current, output: { ...current.output, aspectRatio: normalizeCreativeAspectRatio(event.target.value) } }))}>
                  {CREATIVE_ASPECT_RATIOS.map((ratio) => <option value={ratio} key={ratio}>{ratio}</option>)}
                </select>
              </label>
              <button
                className="primary-button"
                onClick={() => void compileCurrentShot()}
              >
                生成镜头合同
              </button>
            </div>
          </section>
          {shotBuild && (
            <section className="result-panel">
              <p className="eyebrow">可发送给视频生成适配器的约束</p>
              <pre>{shotBuild}</pre>
              <p className="result-note">
                将起始帧、单动作合同和连续性约束一同提交。完成后视频会自动下载并归档为资产。
              </p>
              <div className="form-actions">
                <button onClick={() => void saveShotPlan()}>
                  保存到项目镜头清单
                </button>
                <button className="primary-button" onClick={() => void startShotImageCreation()}>
                  带入图片创作
                </button>
                {shotPurpose === "video" && <button
                  disabled={!canUse("video")}
                  onClick={() => void startVideo()}
                >
                  {canUse("video") ? "提交图生视频任务" : "请先配置视频模型"}
                </button>}
              </div>
            </section>
          )}
          <section className="pattern-list">
            {selectedProjectId &&
              shotPlans.map((plan) => (
                <article key={plan.id}>
                  <span className="pattern-status">镜头</span>
                  <div>
                    <h3>{plan.name}</h3>
                    <p>
                      {plan.purpose === "image" ? "静态图片" : "动态视频"} · {plan.shot.action || "未填写动作"} ·{" "}
                      {plan.shot.durationSeconds} 秒 ·{" "}
                      {plan.shot.output.resolution}
                    </p>
                    <p className="batch-task-link">{[
                      characters.find((item) => item.id === plan.characterProfileId)?.name,
                      scenes.find((item) => item.id === plan.sceneProfileId)?.name,
                    ].filter(Boolean).join(" × ") || "未绑定角色或场景"}</p>
                    <div className="pattern-actions">
                      <button onClick={() => loadShotPlan(plan)}>
                        加载这个镜头
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            {selectedProjectId && !shotPlans.length && (
              <div className="empty-state">
                <strong>这个项目还没有镜头</strong>
                <p>保存镜头合同，建立分镜清单。</p>
              </div>
            )}
            {!selectedProjectId && (
              <div className="empty-state">
                <strong>先选择一个项目</strong>
                <p>
                  先选择项目。
                </p>
              </div>
            )}
          </section>
        </section>
      )}
      {screen === "learning" && (
        <section className="workspace">
          <header className="workspace-header">
            <div>
              <p className="eyebrow">学习库 / 检索、引用、验证</p>
              <h2>
                提示词库有 {promptEntryCount.toLocaleString()} 条可检索案例
              </h2>
            </div>
          </header>
          <section className="form-panel">
            <p className="result-note">
              结果仅作为本轮引用，不会改写角色或执行代码。
            </p>
            <div className="form-actions">
              <label>
                找什么画面
                <input
                  value={promptQuery}
                  onChange={(event) => setPromptQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void searchPromptEntries();
                  }}
                  placeholder="例如：电影人像、光影、产品海报"
                />
              </label>
              <label>
                类别
                <select
                  value={promptCategory}
                  onChange={(event) => setPromptCategory(event.target.value)}
                >
                  <option value="">全部类别</option>
                  {promptCategories.map((item) => (
                    <option value={item} key={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="primary-button"
                onClick={() => void searchPromptEntries()}
              >
                检索案例
              </button>
            </div>
          </section>
          {promptEntries.length > 0 && (
            <section className="pattern-list">
              {promptEntries.map((entry) => (
                <article key={entry.id}>
                  <span className="pattern-status pattern-candidate">
                    {entry.category}
                  </span>
                  <div>
                    <h3>{entry.title}</h3>
                    <p>
                      {entry.sourceRepository} · {entry.license ?? "许可待核对"}
                    </p>
                    <p className="pattern-module">
                      {entry.promptText.slice(0, 360)}
                      {entry.promptText.length > 360 ? "…" : ""}
                    </p>
                    <div className="pattern-actions">
                      <button
                        className="primary-button"
                        onClick={() => applyPromptEntry(entry)}
                      >
                        引用到创作卡
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          )}
          <section className="form-panel">
            <label>
              登记公开提示词来源
              <input
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="粘贴 GitHub 仓库或具体公开提示词页面"
              />
            </label>
            <p className="result-note">
              只保存公开元数据和简介，不抓取图片、不绕过登录。
            </p>
            <div className="form-actions">
              <button onClick={() => void importPromptSource()}>
                纳入来源库
              </button>
            </div>
          </section>
          {promptSources.length > 0 && (
            <section className="pattern-list">
              {promptSources.map((source) => (
                <article key={source.id}>
                  <span
                    className={`pattern-status ${source.status === "imported" ? "pattern-validated" : "pattern-candidate"}`}
                  >
                    {source.status === "imported" ? "已入库" : "待复核"}
                  </span>
                  <div>
                    <h3>{source.repository}</h3>
                    <p>{source.summary}</p>
                    <p className="pattern-module">
                      许可：{source.license ?? "未声明，请人工核对"} ·{" "}
                      <a href={source.url} target="_blank" rel="noreferrer">
                        查看来源
                      </a>
                    </p>
                  </div>
                </article>
              ))}
            </section>
          )}
          <section className="form-panel">
            <label>
              粘贴一条提示词
              <textarea
                className="learning-input"
                value={learningInput}
                onChange={(event) => setLearningInput(event.target.value)}
                placeholder="粘贴完整提示词；系统会保留原文，仅提取可单独验证的镜头、光线或风格模块。"
              />
            </label>
            <div className="form-actions">
              <button
                className="primary-button"
                onClick={() => void learnPrompt()}
              >
                学习这条提示词
              </button>
            </div>
          </section>
          <section className="pattern-list">
            {patterns.map((pattern) => (
              <article key={pattern.id}>
                <span className={`pattern-status pattern-${pattern.status}`}>
                  {pattern.status === "candidate"
                    ? "候选"
                    : pattern.status === "validated"
                      ? "已验证"
                      : "已淘汰"}
                </span>
                <div>
                  <h3>{pattern.name.replace("提示词模式：", "")}</h3>
                  <p>
                    {pattern.scope.join(" / ") || "通用描述"} ·{" "}
                    {pattern.evidence.at(-1)}
                  </p>
                  <p className="pattern-module">
                    本次可试用模块：{pattern.module}
                  </p>
                  <div className="pattern-actions">
                    {pattern.status === "candidate" && (
                      <>
                        <button
                          onClick={() =>
                            void updatePatternStatus(pattern.id, "validated")
                          }
                        >
                          确认有效
                        </button>
                        <button
                          onClick={() =>
                            void updatePatternStatus(pattern.id, "rejected")
                          }
                        >
                          不适合
                        </button>
                      </>
                    )}
                    {pattern.status === "validated" && (
                      <button
                        className="primary-button"
                        onClick={() => applyLearningPattern(pattern)}
                      >
                        用于本轮创作
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
            {!patterns.length && (
              <div className="empty-state">
                <strong>还没有学习模式</strong>
                <p>
                  先导入并验证一条提示词。
                </p>
              </div>
            )}
          </section>
        </section>
      )}
      {screen === "jobs" && (
        <section className="workspace">
          <header className="workspace-header">
            <div>
              <p className="eyebrow">生成队列 / 可追溯任务</p>
              <h2>每次理解、成图和视频生成都留下完整记录</h2>
            </div>
            <button onClick={() => void refreshJobs()}>立即刷新</button>
          </header>
          <p className="result-note">
            视频任务每 8 秒更新；完成后自动归档。
          </p>
          <GenerationQueuePanel
            jobs={jobs}
            retryingJobIds={retryingJobIds}
            onRefresh={() => void refreshJobs()}
            onRetry={(job) => void retryJob(job)}
          />
        </section>
      )}
      {screen === "settings" && (
        <section className="workspace">
          <header className="workspace-header">
            <div>
              <p className="eyebrow">模型连接 / 仅存储在这台 Mac</p>
              <h2>分别接入模型，再按能力选择使用谁</h2>
            </div>
          </header>
          <section className="form-panel">
            <p className="result-note">
              密钥只保存在本机。按能力配置模型路由。
            </p>
            {provider?.network && (
              <p className="result-note">
                当前网络：{provider.network === "system_proxy" ? "使用本机系统代理" : "直连"}
              </p>
            )}
            {(
              [
                ["openai", "OpenAI", "视觉理解、出图、修图、视频"],
                ["flux", "FLUX", "高性价比出图"],
                ["fal", "fal", "低成本出图与参考图修订"],
                ["deepseek", "DeepSeek", "创作对话与提示词规划（路由已预留）"],
                ["gemini", "Gemini", "Gemini 图片生成与参考图修订"],
              ] as [ProviderId, string, string][]
            ).map(([id, label, description]) => {
              const connection = provider?.providers.find((item) => item.id === id);
              const verification = providerVerifications[id];
              return <div className="provider-row" key={id}>
                <div>
                  <strong>{label}</strong>
                  <p className="result-note">
                    {description} ·{" "}
                    {!connection?.configured
                      ? "未配置"
                      : id !== "gemini"
                        ? "已配置"
                        : verification?.ok
                          ? "已验证可访问"
                          : verification
                            ? "验证失败"
                            : "已配置，尚未验证"}
                  </p>
                  {id === "gemini" && verification && (
                    <p className={`provider-verification-detail ${verification.ok ? "success" : "error"}`} role="status">
                      {verification.message}
                    </p>
                  )}
                </div>
                <input
                  type="password"
                  value={providerKeys[id]}
                  onChange={(event) =>
                    setProviderKeys((current) => ({
                      ...current,
                      [id]: event.target.value,
                    }))
                  }
                  placeholder={`粘贴 ${label} API 密钥`}
                />
                <button onClick={() => void saveProviderKey(id)}>保存</button>
                {id === "gemini" && connection?.configured && (
                  <button disabled={verifyingProviderId === id} onClick={() => void verifyProviderConnection(id)}>
                    {verifyingProviderId === id ? "正在验证…" : "测试连接"}
                  </button>
                )}
              </div>;
            })}
          </section>
          <section className="form-panel">
            <p className="eyebrow">能力路由</p>
            {(
              [
                ["text", "人物对话与提示词"],
                ["vision", "图片理解"],
                ["image", "图片生成"],
                ["image_edit", "图片修订"],
                ["video", "图生视频"],
              ] as [ProviderCapability, string][]
            ).map(([capability, label]) => (
              <label key={capability}>
                {label}
                <select
                  value={provider?.routes[capability] ?? ""}
                  onChange={(event) =>
                    void saveRoute(capability, event.target.value as ProviderId)
                  }
                >
                  <option value="">请选择</option>
                  {(
                    provider?.providers.filter((item) =>
                      item.capabilities.includes(capability),
                    ) ?? []
                  ).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.id === "flux"
                        ? "FLUX"
                        : item.id === "fal"
                          ? "fal"
                        : item.id === "deepseek"
                          ? "DeepSeek"
                          : item.id === "gemini"
                            ? "Gemini"
                            : "OpenAI"}
                      {item.configured ? "" : "（未配置）"}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </section>
          <section className="form-panel">
            <p className="eyebrow">费用保护</p>
            <p className="result-note">
              本月已规划：${budget.plannedSpendUsd}
              {budget.monthlyBudgetUsd
                ? ` / 预算 $${budget.monthlyBudgetUsd}，剩余 $${budget.remainingUsd}`
                : "；尚未设置预算。"}
            </p>
            <label>
              月度预算（美元）
              <input
                inputMode="decimal"
                value={budgetInput}
                onChange={(event) => setBudgetInput(event.target.value)}
                placeholder="例如：20"
              />
            </label>
            <div className="form-actions">
              <button onClick={() => void saveBudget()}>保存预算</button>
            </div>
          </section>
          <section className="form-panel">
            <p className="eyebrow">本机数据保护</p>
            <p className="result-note">备份包含数据库和素材；恢复前自动保留回滚副本。</p>
            <div className="form-actions">
              <button onClick={() => void createLocalBackup()}>创建本机备份</button>
              <button onClick={() => void restoreLocalBackup()}>从备份恢复</button>
            </div>
          </section>
          <section className="result-panel">
            <p className="eyebrow">当前已实现</p>
            <p className="result-note">
              已接入图片理解、出图、修图和视频适配；对话路由可单独配置。
            </p>
          </section>
        </section>
      )}
      </main>
      </div>
    </div>
  );
}
