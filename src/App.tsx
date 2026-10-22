import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdaptiveDomainNavigation } from "./ui-adapters/AdaptiveDomainNavigation";
import { CharacterInspector } from "./character/CharacterInspector";
import { CharacterWorkspacePanel } from "./character/CharacterWorkspacePanel";
import { SceneWorkspacePanel } from "./scene/SceneWorkspacePanel";
import { ReviewWorkspacePanel } from "./review/ReviewWorkspacePanel";
import { ProjectPipelinePanel } from "./project/ProjectPipelinePanel";
import { composeCharacterCard, evaluateCharacterCoverage, type CharacterUseCase, type CharacterVariantSelection } from "./shared/character-slots";
import { collectUsableReferenceAssetIds, getAssetCollectionBlueprint } from "./shared/asset-collection-blueprints";
import { CREATIVE_ASPECT_RATIOS, normalizeCreativeAspectRatio, aspectRatioForImageSize } from "./shared/types";
import type {
  Asset,
  AssetCollection,
  AssetCollectionDetail,
  AssetCollectionKind,
  AssetLineageItem,
  AssetType,
  BudgetStatus,
  CharacterProfile,
  CharacterDetail,
  CharacterWorkspaceSnapshot,
  CharacterFactInput,
  CharacterVariantKind,
  CharacterGroup,
  CreativeCard,
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

const normalizeCreativeCard = (card: CreativeCard): CreativeCard => ({
  ...card,
  aspectRatio: normalizeCreativeAspectRatio(card.aspectRatio),
  referenceAssetIds: Array.isArray(card.referenceAssetIds) ? [...new Set(card.referenceAssetIds)] : [],
});

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
  const selectedCharacterIdRef = useRef("");
  const selectCharacter = (id: string) => {
    selectedCharacterIdRef.current = id;
    setSelectedCharacterDetail(undefined);
    setSelectedCharacterWorkspace(undefined);
    setSelectedCharacterId(id);
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
  const [creativeTasks, setCreativeTasks] = useState<CreativeTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState("");
  const [guideMode, setGuideMode] = useState<"new" | "saved" | "reference">("new");
  const [guideCharacterId, setGuideCharacterId] = useState("");
  const [guideGoal, setGuideGoal] = useState("");
  const [guideSubject, setGuideSubject] = useState("");
  const [guideScene, setGuideScene] = useState("");
  const [guideMustKeep, setGuideMustKeep] = useState("");
  const [guideReferenceAssetId, setGuideReferenceAssetId] = useState("");
  const [guideCollectionIds, setGuideCollectionIds] = useState<string[]>([]);
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
    if (selectedAssetId)
      window.studio.assets
        .lineage(selectedAssetId)
        .then(setLineage)
        .catch(() => setLineage([]));
    else setLineage([]);
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
          await window.studio.generation.image({
            prompt: job.request.prompt,
            negative: typeof job.request.negative === "string" ? job.request.negative : undefined,
            projectId: job.projectId,
            creativeTaskId: typeof job.request.creativeTaskId === "string" ? job.request.creativeTaskId : undefined,
            generationSessionId: typeof job.request.generationSessionId === "string" ? job.request.generationSessionId : undefined,
            retryOfJobId: job.id,
            aspectRatio,
            referenceAssetIds: Array.isArray(job.request.referenceAssetIds) ? job.request.referenceAssetIds.filter((item): item is string => typeof item === "string") : [],
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
    if (screen !== "jobs") return;
    void refreshJobs();
    const timer = window.setInterval(() => void refreshJobs(), 8_000);
    return () => window.clearInterval(timer);
  }, [screen, refreshJobs]);
  useEffect(() => {
    const domainForScreen: Partial<Record<typeof screen, typeof activeDomain>> = {
      workspace: "creation", start: "creation", creation: "creation",
      assets: "assets", characters: "assets", collections: "assets",
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
            })),
        ),
      ).filter((item): item is { asset: Asset; label: string; prompt: string } => Boolean(item.asset)),
    [assets, batches, compareAssetIds],
  );
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
  const saveProviderKey = async (providerId: ProviderId) => {
    try {
      const key = providerKeys[providerId];
      setProvider(
        await window.studio.settings.saveProviderKey(providerId, key),
      );
      setProviderKeys((current) => ({ ...current, [providerId]: "" }));
      setNotice(
        `${providerId === "flux" ? "FLUX" : providerId === "fal" ? "fal" : providerId === "deepseek" ? "DeepSeek" : providerId === "gemini" ? "Gemini" : "OpenAI"} 已连接；密钥已使用本机系统加密保存。`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存连接配置失败。");
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
  const startCharacterImageCreation = (
    workspace: CharacterWorkspaceSnapshot,
    context: { versionId?: string; stateId?: string },
  ) => {
    const state = context.stateId
      ? workspace.states.find((item) => item.id === context.stateId)
      : workspace.activeState;
    const base = composeCharacterCard(
      workspace.character,
      characterVariantSelections[workspace.character.id],
    );
    const nextCard = normalizeCreativeCard({
      ...base,
      projectId: selectedProjectId || workspace.character.projectId,
      bodyAndWardrobe: mergeText(base.bodyAndWardrobe, [state?.wardrobe, state?.hair].filter(Boolean).join("；")),
      expressionAndPose: mergeText(base.expressionAndPose, [state?.expression, state?.pose, state?.emotion].filter(Boolean).join("；")),
      scene: mergeText(base.scene, state?.scene ?? ""),
      mustKeep: mergeText(base.mustKeep ?? "", state?.continuityNotes ?? ""),
    });
    setCard(nextCard);
    setCharacterName(workspace.character.name);
    setActiveCharacterContext({ profileId: workspace.character.id, ...context });
    setPromptBuild(undefined);
    setTranslation(undefined);
    if (nextCard.referenceAssetIds[0]) setSelectedAssetId(nextCard.referenceAssetIds[0]);
    setActiveDomain("creation");
    setScreen("creation");
    setNotice(`已带入「${workspace.character.name}」${state ? `的“${state.name}”状态` : "的基础设定"}；补充本次目标后生成提示词。`);
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
  const generateImage = async () => {
    if (!promptBuild) {
      setNotice("请先生成结构化提示词。");
      return;
    }
    if (characterReferenceIssues) {
      setNotice(characterReferenceIssues);
      return;
    }
    try {
      const normalizedCard = normalizeCreativeCard(card);
      setCard(normalizedCard);
      if (activeTaskId) {
        const updated = await window.studio.tasks.update(activeTaskId, { status: "producing", card: normalizedCard });
        setCreativeTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
      }
      const prompt = translation?.positive ?? promptBuild.positive;
      const characterId = activeCharacterContext?.profileId ?? activeTask?.characterProfileId;
      const characterWorkspace = characterId
        ? await window.studio.characterWorkspace.get(characterId)
        : undefined;
      const sceneWorkspace = activeSceneContext?.profileId
        ? await window.studio.sceneWorkspace.get(activeSceneContext.profileId)
        : undefined;
      const session = characterId || sceneWorkspace ? await window.studio.characterWorkspace.createSession({
        projectId: selectedProjectId || characterWorkspace?.character.projectId || sceneWorkspace?.scene.projectId,
        characterProfileId: characterId,
        characterVersionId: activeCharacterContext?.versionId ?? characterWorkspace?.activeVersion?.id,
        characterStateId: activeCharacterContext?.stateId ?? characterWorkspace?.activeState?.id,
        sceneProfileId: sceneWorkspace?.scene.id,
        sceneVersionId: activeSceneContext?.versionId ?? sceneWorkspace?.activeVersion?.id,
        sceneStateId: activeSceneContext?.stateId ?? sceneWorkspace?.activeState?.id,
        creativeTaskId: activeTaskId || undefined,
        title: `${characterWorkspace?.character.name ?? sceneWorkspace?.scene.name ?? "图片创作"} · ${normalizedCard.scene || normalizedCard.intent || "候选"}`.slice(0, 80),
        mode: normalizedCard.referenceAssetIds.length ? "image_edit" : "text_to_image",
        prompt,
        negativePrompt: translation?.negative ?? promptBuild.negative,
        providerId: provider?.routes.image,
        aspectRatio: normalizedCard.aspectRatio,
        referenceAssetIds: normalizedCard.referenceAssetIds,
        settings: { qualityTier },
      }) : undefined;
      const job = await window.studio.generation.image({
        prompt,
        negative: translation?.negative ?? promptBuild.negative,
        projectId: selectedProjectId || characterWorkspace?.character.projectId || sceneWorkspace?.scene.projectId,
        creativeTaskId: activeTaskId || undefined,
        generationSessionId: session?.id,
        aspectRatio: normalizedCard.aspectRatio,
        referenceAssetIds: normalizedCard.referenceAssetIds,
        qualityTier,
      });
      const assetId = String(job.result?.assetId ?? "");
      if (activeTaskId && assetId) {
        const updated = await window.studio.tasks.update(activeTaskId, { status: "review", resultAssetId: assetId });
        setCreativeTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
      }
      setNotice(`成图已归档为新资产${assetId ? `：${assetId}` : ""}；任务已进入候选审片。`);
      await refresh();
      if (characterId && selectedCharacterIdRef.current === characterId)
        setSelectedCharacterWorkspace(await window.studio.characterWorkspace.get(characterId));
      if (sceneWorkspace && selectedSceneId === sceneWorkspace.scene.id)
        setSelectedSceneWorkspace(await window.studio.sceneWorkspace.get(sceneWorkspace.scene.id));
    } catch (error) {
      if (activeTaskId) {
        try {
          const updated = await window.studio.tasks.update(activeTaskId, { status: "blocked", card: normalizeCreativeCard(card) });
          setCreativeTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
        } catch {
          // 生成错误本身已经需要保留；任务状态更新失败不覆盖原始错误。
        }
      }
      setNotice(`${error instanceof Error ? error.message : "成图任务失败。"} 任务已标记为生成阻塞，可从生成队列按原请求重试。`);
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
    setNotice(`已加载配方「${recipe.name}」；建议只改本轮场景、动作或镜头。`);
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
    const imageProvider = provider?.routes.image;
    if (imageProvider !== "openai" && imageProvider !== "flux" && imageProvider !== "fal") {
      setNotice("请先在模型连接页选择 OpenAI、FLUX 或 fal 的图片路由。");
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
  const reviewAsset = async (confirmation: "confirmed" | "rejected") => {
    if (!selectedAssetId) return;
    try {
      await window.studio.assets.updateConfirmation(
        selectedAssetId,
        confirmation,
      );
      if (confirmation === "confirmed") {
        const taskId = batchForSelectedAsset?.creativeTaskId || activeTaskId;
        if (taskId) {
          const task = await window.studio.tasks.update(taskId, {
            status: "review",
            resultAssetId: selectedAssetId,
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
        `已保存角色档案「${profile.name}」${profile.masterAssetId ? "，并绑定了已确认主参考图" : ""}。后续可直接加载后更换场景和镜头。`,
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
  const beginGuidedCreation = async () => {
    const savedCharacter = characters.find(
      (profile) => profile.id === guideCharacterId,
    );
    if (!guideGoal.trim()) {
      setNotice("先用一句话说清这次要做什么。\n");
      return;
    }
    if (guideMode === "saved" && !savedCharacter) {
      setNotice("请选择一个已经保存的角色。\n");
      return;
    }
    if (
      !savedCharacter &&
      !guideSubject.trim() &&
      !guideReferenceAssetId
    ) {
      setNotice("请填写人物主体，或选择一张参考图。\n");
      return;
    }
    if (!guideMustKeep.trim()) {
      setNotice("请写下最希望保持的 1—3 件事，这是保证贴合度的关键。\n");
      return;
    }
    const detail = savedCharacter ? await window.studio.characters.detail(savedCharacter.id) : undefined;
    const selection = savedCharacter ? characterVariantSelections[savedCharacter.id] : undefined;
    if (detail && selection && Object.entries(selection).some(([kind, id]) => id && !detail.variants.some((variant) => variant.id === id && variant.kind === kind))) {
      setNotice("所选角色变体已失效，请重新选择造型、表情或动作。"); return;
    }
    if (guideReferenceAssetId && !selectableImages.some((asset) => asset.id === guideReferenceAssetId)) {
      setNotice("参考图还未完成审片和使用权核实，请先到资产库处理。"); return;
    }
    const base = detail ? composeCharacterCard(detail, selection) : savedCharacter?.card ?? EMPTY_CARD;
    const referenceAssetIds = [
      ...base.referenceAssetIds,
      ...(guideReferenceAssetId ? [guideReferenceAssetId] : []),
    ].filter((value, index, values) => values.indexOf(value) === index);
    const characterCollectionIds = savedCharacter
      ? collections.filter((collection) => collection.characterProfileId === savedCharacter.id).map((collection) => collection.id)
      : [];
    const inheritedCollectionDetails = await Promise.all([...new Set([...characterCollectionIds, ...guideCollectionIds])]
      .map((id) => window.studio.collections.detail(id)));
    const nextCard: CreativeCard = {
      ...base,
      projectId: selectedProjectId || savedCharacter?.projectId,
      intent: guideGoal.trim(),
      subject: guideSubject.trim() || base.subject,
      scene: guideScene.trim() || base.scene,
      mustKeep: mergeText(base.mustKeep ?? "", guideMustKeep),
      referenceAssetIds: [...new Set([...referenceAssetIds, ...collectUsableReferenceAssetIds(inheritedCollectionDetails)])],
    };
    setCard(normalizeCreativeCard(nextCard));
    const task = await window.studio.tasks.create({
      projectId: selectedProjectId || savedCharacter?.projectId,
      characterProfileId: savedCharacter?.id,
      name: guideGoal.trim().slice(0, 48),
      objective: guideGoal.trim(),
      collectionIds: [...new Set([...characterCollectionIds, ...guideCollectionIds])],
      card: nextCard,
    });
    setCreativeTasks((current) => [task, ...current]);
    setActiveTaskId(task.id);
    setPromptBuild(await window.studio.creation.compilePrompt(nextCard));
    setTranslation(undefined);
    if (referenceAssetIds[0]) setSelectedAssetId(referenceAssetIds[0]);
    setScreen("creation");
    const missing = detail ? evaluateCharacterCoverage(detail, guidePurpose, selection).missingRequiredKeys.length : 0;
    setNotice(
      missing ? `已建立创作任务并继承已确认细项；当前用途仍缺 ${missing} 项，出图前建议到角色档案补齐，避免身份漂移。` : "已建立创作任务并继承已确认细项；下一步检查结果并出第一版。",
    );
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
  const setSelectedAssetAsMaster = async () => {
    if (!selectedAsset) return;
    try {
      await window.studio.assets.setMaster(selectedAsset.id, true, selectedProjectId || undefined);
      const taskId = batchForSelectedAsset?.creativeTaskId || activeTaskId;
      if (taskId) {
        const task = await window.studio.tasks.update(taskId, {
          status: "completed",
          resultAssetId: selectedAsset.id,
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
    creation: [["workspace", "项目总览"], ["start", "新建创作单"], ["creation", "当前创作卡"]],
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

  return (
    <div className="app-shell">
      <AdaptiveDomainNavigation
        activeDomain={activeDomain}
        connected={connected}
        onNavigate={openDomain}
        onOpenSettings={() => setScreen("settings")}
      />
      <div className="app-main">
        <header className="context-bar">
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
            <button className="header-create" onClick={() => { setNotice(""); setActiveDomain("creation"); setScreen("start"); }}>新建创作任务</button>
            <nav className="domain-subnav" aria-label="当前工作域功能">
              {domainSections[activeDomain].map(([target, label]) => <button key={target} className={screen === target ? "selected" : ""} onClick={() => { setNotice(""); setScreen(target); }}>{label}</button>)}
            </nav>
          </div>
        </header>
      <main id="main-content" tabIndex={-1}>
      {screen === "start" && (
        <section className="workspace guided-workspace">
          <header className="workspace-header">
            <div>
              <p className="eyebrow">贴合优先 / 简易设定</p>
              <h2>从一句创作意图开始</h2>
              <p className="result-note">只填影响结果的内容，先锁定基线。</p>
            </div>
          </header>
          <section className="guided-grid" aria-label="简易创作设定">
            <article className="guided-step">
              <span>01</span>
              <h3>你从哪里开始？</h3>
              <div className="choice-row">
                {([
                  ["new", "新建一个角色"],
                  ["saved", "用已保存角色"],
                  ["reference", "按参考图创作"],
                ] as const).map(([mode, label]) => (
                  <button key={mode} className={guideMode === mode ? "choice-selected" : ""} onClick={() => setGuideMode(mode)}>{label}</button>
                ))}
              </div>
              {guideMode === "saved" && (
                <label>选择角色
                  <select value={guideCharacterId} onChange={(event) => setGuideCharacterId(event.target.value)}>
                    <option value="">请选择</option>
                    {characters.filter((profile) => profile.lifecycle !== "archived").map((profile) => <option value={profile.id} key={profile.id}>{CHARACTER_GROUP_LABELS[profile.group]} · {profile.name}</option>)}
                  </select>
                </label>
              )}
              {guideMode === "saved" && guideCharacterDetail?.id === guideCharacterId && <div className="guide-variant-panel">
                <label>本轮用途<select value={guidePurpose} onChange={(event) => setGuidePurpose(event.target.value as CharacterUseCase)}><option value="portrait">肖像</option><option value="full_body">全身设定</option><option value="series">连续镜头</option></select></label>
                {(["look", "expression", "pose", "scene"] as CharacterVariantKind[]).map((kind) => <label key={kind}>{kind === "look" ? "造型" : kind === "expression" ? "表情" : kind === "pose" ? "动作" : "情境"}
                  <select value={characterVariantSelections[guideCharacterDetail.id]?.[kind] ?? ""} onChange={(event) => setCharacterVariantSelections((current) => ({ ...current, [guideCharacterDetail.id]: { ...current[guideCharacterDetail.id], [kind]: event.target.value || undefined } }))}>
                    <option value="">基础配置</option>{guideCharacterDetail.variants.filter((item) => item.kind === kind).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>)}
                <p>本轮还缺 {evaluateCharacterCoverage(guideCharacterDetail, guidePurpose, characterVariantSelections[guideCharacterId]).missingRequiredKeys.length} 个必需细项；只继承已确认且来源有效的设定。</p>
              </div>}
              {guideMode === "reference" && (<>
                <label>选择参考图
                  <select value={guideReferenceAssetId} onChange={(event) => setGuideReferenceAssetId(event.target.value)}>
                    <option value="">请选择</option>
                    {selectableImages.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
                  </select>
                </label>
                {!selectableImages.length && <small>没有可生产参考图：先在资产库完成审片和使用权核实。</small>}
              </>)}
              {collections.length > 0 && (
                <div className="guide-collections">
                  <small>本次继承哪些资产包（可选）</small>
                  <div className="choice-row">
                    {collections.filter((collection) => collection.status !== "archived").map((collection) => (
                      <button key={collection.id} className={guideCollectionIds.includes(collection.id) ? "choice-selected" : ""} onClick={() => setGuideCollectionIds((current) => current.includes(collection.id) ? current.filter((id) => id !== collection.id) : [...current, collection.id])}>{collection.name}</button>
                    ))}
                  </div>
                </div>
              )}
            </article>
            <article className="guided-step guided-step-wide">
              <span>02</span>
              <h3>这次要做什么？</h3>
              <label>一句话目标（必填）
                <textarea value={guideGoal} onChange={(event) => setGuideGoal(event.target.value)} placeholder="例如：为蝶灵角色做一张夜晚温室的真人感全身时装图" />
              </label>
              {guideMode !== "saved" && <label>人物主体（没有参考图时必填）
                <input value={guideSubject} onChange={(event) => setGuideSubject(event.target.value)} placeholder="例如：25 岁原创成年东亚女性，清冷但有力量感" />
              </label>}
              <label>这次变化的场景或动作（可选）
                <input value={guideScene} onChange={(event) => setGuideScene(event.target.value)} placeholder="例如：雨后玻璃温室，缓慢回头看向镜头" />
              </label>
            </article>
            <article className="guided-step guided-lock">
              <span>03</span>
              <h3>必须保持</h3>
              <p>这是贴合度的核心。只写最不能漂移的 1—3 件事。</p>
              <textarea value={guideMustKeep} onChange={(event) => setGuideMustKeep(event.target.value)} placeholder="例如：脸型和黑色长发不变；保持真实皮肤；不要文字和水印" />
              <button className="primary-button" onClick={() => void beginGuidedCreation()}>建立创作基线</button>
            </article>
          </section>
          {notice && <p className="notice" role="status">{notice}</p>}
        </section>
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
                <div>
                  <span className="pattern-status">{CHARACTER_GROUP_LABELS[profile.group]}</span>
                  <h3>{profile.name}</h3>
                  <p>{profile.card.identityAnchor || profile.card.subject || "尚未填写身份锚点"}</p>
                  <small>{profile.masterAssetId ? "已绑定主参考图" : "尚未绑定主参考图"} · {CHARACTER_LIFECYCLE_LABELS[profile.lifecycle]}</small>
                </div>
                <div className="character-actions">
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
                  <button onClick={() => { setGuideMode("saved"); setGuideCharacterId(profile.id); setGuideCollectionIds(collections.filter((collection) => collection.characterProfileId === profile.id).map((collection) => collection.id)); setGuideGoal(""); setGuideMustKeep(""); setScreen("start"); }}>用此角色做新场景</button>
                  <button className="primary-button" onClick={() => selectCharacter(profile.id)}>管理细项</button>
                  <button type="button" onClick={() => void openMasterPicker(profile)}>{profile.masterAssetId ? "更换主参考图" : "选择主参考图"}</button>
                </div>
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
          {selectedCharacterWorkspace?.character.id === selectedCharacterId && <CharacterWorkspacePanel
            snapshot={selectedCharacterWorkspace}
            onChanged={(workspace) => {
              setSelectedCharacterWorkspace(workspace);
              setSelectedCharacterDetail(workspace.character);
              setCharacters((current) => current.map((item) => item.id === workspace.character.id ? workspace.character : item));
            }}
            onStartImage={(context) => startCharacterImageCreation(selectedCharacterWorkspace, context)}
          />}
          {selectedCharacterDetail?.id === selectedCharacterId && <CharacterInspector
            key={selectedCharacterDetail.id}
            detail={selectedCharacterDetail}
            selection={characterVariantSelections[selectedCharacterDetail.id] ?? {}}
            onSelectionChange={(selection) => setCharacterVariantSelections((current) => ({ ...current, [selectedCharacterDetail.id]: selection }))}
            onSaveFact={(input) => saveCharacterFact(selectedCharacterDetail.id, input)}
            onCreateVariant={(kind, name) => addCharacterVariant(selectedCharacterDetail.id, kind, name)}
            onOpenAsset={(assetId) => { setSelectedAssetId(assetId); setScreen("assets"); }}
            onOpenLibrary={() => setScreen("assets")}
          />}
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
        <section className="workspace project-workspace">
          <header className="workspace-header">
            <div>
              <p className="eyebrow">创作主线 / {projectName ?? "尚未选择项目"}</p>
              <h2>把创作收敛成可复用项目</h2>
            </div>
            {selectedProjectId && (
              <button className="primary-button" onClick={() => setScreen("creation")}>
                从创作卡开始
              </button>
            )}
          </header>
          {!selectedProjectId ? (
            <section className="onboarding-panel" aria-label="建立第一个创作项目">
              <div className="onboarding-intro">
                <span>开始工作</span>
                <strong>先建项目，再组织角色、素材和出图。</strong>
                <p>项目集中保存创作进度。</p>
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
                <button className="primary-button" onClick={() => void createProject()}>创建第一个项目</button>
              </div>
              <div className="onboarding-options">
                <button onClick={() => setScreen("start")}><strong>先做一张图</strong><span>跳过项目，直接开始。</span></button>
                <button onClick={() => setScreen("assets")}><strong>先导入素材</strong><span>把参考图放入素材库。</span></button>
              </div>
            </section>
          ) : (
            <>
              <ProjectPipelinePanel snapshot={projectWorkspace} onNavigate={openPipelineTarget} />
              <section className="task-board" aria-label="创作任务">
                <div className="task-board-header">
                  <div><p className="eyebrow">创作任务</p><strong>每次创作都有记录</strong></div>
                  <button className="primary-button" onClick={() => setScreen("start")}>新建任务</button>
                </div>
                <div className="task-grid">
                  {creativeTasks.slice(0, 6).map((task) => (
                    <button className={activeTaskId === task.id ? "task-card task-current" : "task-card"} key={task.id} onClick={() => { setActiveTaskId(task.id); setCard(normalizeCreativeCard(task.card)); setPromptBuild(undefined); setScreen("creation"); }}>
                      <span>{taskStatusLabel(task.status)}</span>
                      <strong>{task.name}</strong>
                      <small>{task.objective}</small>
                    </button>
                  ))}
                  {!creativeTasks.length && <p className="task-empty">还没有任务。创建后，角色、候选和母版会自动关联。</p>}
                </div>
              </section>
              <section className="form-panel brief-panel">
                <div>
                  <p className="eyebrow">项目简报 / 所有创作的共同验收标准</p>
                  <p className="result-note">先写目标，细节在创作卡补充。</p>
                </div>
                <div className="form-grid">
                  {([
                    ["goal", "这次要完成什么", "例如：建立可连续使用的古风女主资产"],
                    ["audience", "给谁看", "例如：竖屏漫剧观众"],
                    ["visualWorld", "整体视觉世界", "例如：写实东方幻想、夜色电影感"],
                    ["delivery", "最后要交付什么", "例如：角色定妆、三张场景图、一个镜头"],
                    ["acceptance", "怎样算这次成功", "例如：换场景仍能一眼认出同一角色"],
                  ] as Array<[keyof ProjectBrief, string, string]>).map(([key, label, placeholder]) => (
                    <label key={key}>
                      {label}
                      <textarea value={projectBrief[key]} placeholder={placeholder} onChange={(event) => setProjectBrief((current) => ({ ...current, [key]: event.target.value }))} />
                    </label>
                  ))}
                </div>
                <div className="form-actions">
                  <button onClick={() => void saveProjectBrief()}>保存项目简报</button>
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
                <section className="collection-modules" aria-label="资产包模块完整度"><div className="collection-section-heading"><div><p className="eyebrow">模块完整度</p><strong>按模块补齐素材</strong></div><small>{selectedCollection.readiness.moduleCoverage?.confirmedRequiredCount ?? 0}/{selectedCollection.readiness.moduleCoverage?.requiredCount ?? 0} 个必需模块</small></div><div className="collection-module-grid">{(selectedCollection.readiness.moduleCoverage?.modules ?? getAssetCollectionBlueprint(selectedCollection.kind).modules.map((module) => ({ key: module.key, label: module.label, required: module.required, assetCount: 0, confirmedAssetCount: 0 }))).map((module) => <div key={module.key} className={module.required && module.confirmedAssetCount === 0 ? "collection-module module-missing" : "collection-module"}><span>{module.required ? "必需" : "可选"}</span><strong>{module.label}</strong><small>{module.confirmedAssetCount}/{module.assetCount} 项可用</small></div>)}</div></section>
                {selectedCollection.characterProfileId && <button type="button" onClick={() => { selectCharacter(selectedCollection.characterProfileId!); setScreen("characters"); }}>打开所属角色细项</button>}
                <div className="collection-assets">
                  <div className="collection-section-heading"><div><p className="eyebrow">已归档素材</p><strong>{selectedCollection.assets.length} 项</strong></div><small>素材仍可被多个资产包引用。</small></div>
                  {selectedCollection.assets.map((asset) => <div key={asset.id} className="collection-member"><button type="button" className="collection-member-main" onClick={() => { setSelectedAssetId(asset.id); setScreen("assets"); }}><span>{getAssetCollectionBlueprint(selectedCollection.kind).modules.find((module) => module.key === asset.moduleKey)?.label ?? "未分配模块"} · {asset.membershipRole}</span><strong>{asset.name}</strong><small>{ASSET_TYPE_LABELS[asset.type]} · {asset.confirmation === "confirmed" ? "已确认" : "待审核"}{asset.notes ? ` · ${asset.notes}` : ""}</small></button><button type="button" className="collection-member-remove" onClick={() => void detachSelectedCollectionAsset(asset.id)}>移除</button></div>)}
                  {!selectedCollection.assets.length && <p className="task-empty">这个资产包还没有素材。到“资产库”选中一个素材后，先选择模块，再点击“归入当前资产包”。</p>}
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
      {screen === "creation" && (
        <section className="workspace">
          <header className="workspace-header">
            <div>
              <p className="eyebrow">当前任务 / 模块化提示词</p>
              <h2>{creativeTasks.find((task) => task.id === activeTaskId)?.name ?? "先建立一个创作任务"}</h2>
              <p className="result-note">{activeTaskId ? "人物、候选和结果都会回写到此任务。" : "先建任务，再开始出图。"}</p>
            </div>
          </header>
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
          <section className="form-panel">
            <div className="paradigm-summary">
              <div>
                <p className="eyebrow">视觉生产范式</p>
                <strong>
                  {card.paradigmIds?.length
                    ? paradigmComposition?.paradigms
                        .map((item) => item.name)
                        .join(" × ") || "已带入范式"
                    : "尚未选择：先决定这次要生产哪一种视觉作品"}
                </strong>
                <p className="result-note">
                  范式定方向；创作卡补人物、场景和细节。
                </p>
              </div>
              <button onClick={() => setScreen("paradigms")}>
                选择视觉范式
              </button>
            </div>
            <div className="form-grid">
              {(
                [
                  ["intent", "想做什么"],
                  ["subject", "人物主体"],
                  ["identityAnchor", "人物不变的关键特征"],
                  ["mustKeep", "必须贴合（本轮不能漂移）"],
                  ["bodyAndWardrobe", "身材与衣着"],
                  ["expressionAndPose", "表情与动作"],
                  ["scene", "现实或幻想场景"],
                  ["lighting", "光线"],
                  ["camera", "镜头与构图"],
                  ["style", "成图质感"],
                  ["avoid", "一定避免什么"],
                ] as [keyof CreativeCard, string][]
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <textarea
                    value={card[key] as string}
                    onChange={(event) => updateCard(key, event.target.value)}
                    placeholder={`填写${label}`}
                  />
                </label>
              ))}
            </div>
            <p className="result-note">
              已关联参考资产：
              {card.referenceAssetIds.length
                ? `${card.referenceAssetIds.length} 张；主参考会送入模型。`
                : "暂无；先到资产库选择参考图。"}
              <br />主参考需已确认且具备使用权。
            </p>
            <div className="form-actions">
              <label>
                角色档案名称
                <input
                  value={characterName}
                  onChange={(event) => setCharacterName(event.target.value)}
                  placeholder="例如：蝶灵仙姬"
                />
              </label>
              <label>
                角色组
                <select value={characterGroup} onChange={(event) => setCharacterGroup(event.target.value as CharacterGroup)}>
                  {Object.entries(CHARACTER_GROUP_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>
              <button onClick={() => void saveCharacter()}>保存角色档案</button>
              <button onClick={() => void saveCurrentTask()}>保存当前任务</button>
              <label>
                画幅
                <select
                  value={normalizeCreativeAspectRatio(card.aspectRatio)}
                  onChange={(event) =>
                    updateCard("aspectRatio", event.target.value)
                  }
                >
                  {CREATIVE_ASPECT_RATIOS.map((value) => (
                    <option value={value} key={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={!canUse("text")}
                onClick={() => void enrichCard()}
              >
                {canUse("text") ? "用创作模型补全" : "先配置创作模型"}
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  setTranslation(undefined);
                  window.studio.creation
                    .compilePrompt(card)
                    .then(setPromptBuild);
                }}
              >
                生成结构化提示词
              </button>
            </div>
          </section>
          {characters.length > 0 && (
            <section className="pattern-list">
              {characters.map((profile) => (
                <article key={profile.id}>
                  <span className="pattern-status">角色</span>
                  <div>
                    <h3>{profile.name}</h3>
                    <p>
                      {profile.card.identityAnchor ||
                        profile.card.subject ||
                        "未填写身份锚点"}{" "}
                      ·{" "}
                      {profile.masterAssetId
                        ? "已绑定主参考图"
                        : "尚未绑定主参考图"}
                    </p>
                    <div className="pattern-actions">
                      <button onClick={() => void loadCharacter(profile)}>
                        加载后做新场景
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          )}
          {promptBuild && (
            <section className="result-panel">
              <p className="eyebrow">可复制的生成指令</p>
              <pre>{translation?.positive ?? promptBuild.positive}</pre>
              <p className="eyebrow">避免项</p>
              <pre>
                {(translation?.negative ?? promptBuild.negative) || "未填写"}
              </pre>
              {characterReferenceIssues && <p className="notice notice-warning" role="alert">生成前检查：{characterReferenceIssues}</p>}
              <div className="form-actions">
                <label>
                  配方名称
                  <input value={recipeName} onChange={(event) => setRecipeName(event.target.value)} />
                </label>
                <label>
                  适用用途
                  <input value={recipePurpose} onChange={(event) => setRecipePurpose(event.target.value)} />
                </label>
                <button onClick={() => void saveRecipe()}>保存为配方</button>
                <label>
                  成图档位
                  <select
                    value={qualityTier}
                    onChange={(event) => {
                      setQualityTier(
                        event.target.value as GenerationQualityTier,
                      );
                      setTranslation(undefined);
                    }}
                  >
                    <option value="draft">草稿：更快验证构图</option>
                    <option value="standard">标准：日常候选</option>
                    <option value="premium">高质：主版本与精修</option>
                  </select>
                </label>
                <button
                  disabled={!canUse("text")}
                  onClick={() => void translatePrompt()}
                >
                  {canUse("text") ? "适配当前绘图模型" : "先配置创作模型"}
                </button>
                <button
                  className="primary-button"
                  disabled={!canUse("image") || Boolean(characterReferenceIssues)}
                  onClick={() => void generateImage()}
                >
                  {canUse("image")
                    ? "使用已选绘图模型生成成图"
                    : "请先配置绘图模型"}
                </button>
              </div>
              {translation && (
                <p className="result-note">
                  模型适配：
                  {translation.notes.join("；") ||
                    "沿用原始提示词"}；原始提示词已保留。
                </p>
              )}
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
                        if (task) {
                          setActiveTaskId(task.id);
                          setCard(normalizeCreativeCard(task.card));
                          setScreen("creation");
                        }
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
            {comparedCandidates.length >= 2 && (
              <section className="candidate-compare" aria-label="候选横向比较">
                <div className="candidate-compare-heading">
                  <strong>横向比较：{comparedCandidates.length} 张候选</strong>
                  <button onClick={() => setCompareAssetIds([])}>清空比较</button>
                </div>
                <div className="candidate-compare-grid">
                  {comparedCandidates.map(({ asset, label, prompt }) => (
                    <article key={asset.id}>
                      <AssetVisual asset={asset} />
                      <strong>{label}</strong>
                      <p>{prompt.slice(0, 180)}{prompt.length > 180 ? "…" : ""}</p>
                      <button onClick={() => { setSelectedAssetId(asset.id); setScreen("assets"); }}>查看并审片</button>
                    </article>
                  ))}
                </div>
              </section>
            )}
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
          <section className="pattern-list">
            {jobs.map((job) => (
              <article key={job.id}>
                <span className={`pattern-status job-${job.status}`}>
                  {job.status === "queued"
                    ? "等待中"
                    : job.status === "in_progress"
                      ? "生成中"
                      : job.status === "completed"
                        ? "已完成"
                        : job.status === "unknown"
                          ? "状态未知"
                          : "失败"}
                </span>
                <div>
                  <h3>
                    {job.kind === "vision_analysis"
                      ? "视觉理解"
                      : job.kind === "image_generation"
                        ? "图片生成"
                        : "图生视频"}
                  </h3>
                  <p>
                    {job.error ||
                      `${String(job.result?.progress ?? "")}${job.status === "in_progress" ? "% · 正在自动更新" : ""}`}
                  </p>
                </div>
                {job.kind === "image_to_video" && (job.status === "in_progress" || job.status === "unknown") && typeof job.result?.remoteId === "string" && (
                  <button onClick={() => void refreshJobs()}>安全查询</button>
                )}
                {(
                  job.status === "failed" ||
                  (job.kind === "image_generation" &&
                    job.status === "queued" &&
                    job.error === "应用关闭前任务中断，可由用户确认后重试。")
                ) &&
                  !retryingJobIds.has(job.id) &&
                  !jobs.some(
                    (candidate) => candidate.request.retryOfJobId === job.id,
                  ) && (
                    <button onClick={() => void retryJob(job)}>
                      {job.status === "queued" ? "确认重试" : "按原请求重试"}
                    </button>
                  )}
              </article>
            ))}
            {!jobs.length && (
              <div className="empty-state">
                <strong>没有生成任务</strong>
                <p>
                  先生成图片，或提交图生视频任务。
                </p>
              </div>
            )}
          </section>
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
            ).map(([id, label, description]) => (
              <div className="provider-row" key={id}>
                <div>
                  <strong>{label}</strong>
                  <p className="result-note">
                    {description} ·{" "}
                    {provider?.providers.find((item) => item.id === id)
                      ?.configured
                      ? "已配置"
                      : "未配置"}
                  </p>
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
              </div>
            ))}
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
