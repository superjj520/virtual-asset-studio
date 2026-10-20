export const ASSET_TYPES = [
  "character",
  "reference_image",
  "scene",
  "wardrobe",
  "pose",
  "prop",
  "style",
  "camera",
  "prompt_pattern",
  "image",
  "video",
  "audio",
  "game_export",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];
export type RightsStatus = "unknown" | "authorized" | "original" | "restricted";
export type ConfirmationStatus = "draft" | "confirmed" | "rejected";
export type AssetRelationshipKind =
  | "reference_for"
  | "derived_from"
  | "used_in"
  | "wears"
  | "appears_in"
  | "shot_from";
export type ProjectMedium =
  "image" | "series" | "comic_drama" | "game" | "freeform";

export type Asset = {
  id: string;
  type: AssetType;
  name: string;
  managedPath: string;
  sourcePath?: string;
  sha256: string;
  mediaType: string;
  rightsStatus: RightsStatus;
  confirmation: ConfirmationStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AssetReview = {
  identity: number;
  scene: number;
  realism: number;
  videoReady: number;
  note?: string;
  reviewedAt: string;
};

export type AssetRelationship = {
  id: string;
  fromAssetId: string;
  toAssetId: string;
  kind: AssetRelationshipKind;
  createdAt: string;
};

export type AssetLineageItem = {
  relationship: AssetRelationship;
  direction: "source" | "derived";
  asset: Pick<Asset, "id" | "name" | "type">;
};

/** 资产包是 B 端管理的最小归档单元：一个角色、一套场景或一个可复用主题。 */
export type AssetCollectionKind =
  | "character"
  | "scene"
  | "wardrobe"
  | "prop"
  | "style"
  | "reference";
export type AssetCollectionStatus = "draft" | "active" | "archived";
export type AssetCollection = {
  id: string;
  projectId?: string;
  characterProfileId?: string;
  parentId?: string;
  kind: AssetCollectionKind;
  name: string;
  description: string;
  status: AssetCollectionStatus;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
};
export type AssetCollectionMember = Asset & {
  membershipRole: string;
  projectMaster?: boolean;
  moduleKey?: string;
  notes?: string;
  sortOrder?: number;
};
export type AssetCollectionModuleCoverage = {
  key: string;
  label: string;
  required: boolean;
  assetCount: number;
  confirmedAssetCount: number;
};
export type AssetCollectionReadiness = {
  status: "empty" | "incomplete" | "ready";
  confirmedAssetCount: number;
  masterReferenceCount: number;
  nextAction: string;
  moduleCoverage?: {
    requiredCount: number;
    confirmedRequiredCount: number;
    missingRequiredKeys: string[];
    modules: AssetCollectionModuleCoverage[];
  };
  characterCoverage?: import("./character-slots").CharacterCoverage;
};
export type AssetCollectionDetail = AssetCollection & {
  assets: AssetCollectionMember[];
  readiness: AssetCollectionReadiness;
};

export type Project = {
  id: string;
  name: string;
  medium: ProjectMedium;
  brief?: ProjectBrief;
  createdAt: string;
  updatedAt: string;
};

/** 项目启动时的创作北极星；不直接等同于一次提示词。 */
export type ProjectBrief = {
  goal: string;
  audience: string;
  visualWorld: string;
  delivery: string;
  acceptance: string;
};

/** 项目内资产的可复用身份信息，供角色连续性与后续工作流读取。 */
export type AssetDna = {
  identity?: string[];
  wardrobe?: string[];
  environment?: string[];
  visualMotifs?: string[];
  continuityLocks?: string[];
};

export type ProjectHealth = {
  assetCount: number;
  confirmedAssetCount: number;
  candidateAssetCount: number;
  masterAssetCount: number;
  generationCount: number;
};

export type ProjectWorkspace = {
  project: Project;
  health: ProjectHealth;
  masterAssets: Asset[];
  recommendedNextAction: string;
};

export type CreativeAspectRatio = "1:1" | "2:3" | "3:2" | "4:3" | "9:16" | "16:9";

export const CREATIVE_ASPECT_RATIOS: CreativeAspectRatio[] = [
  "1:1",
  "2:3",
  "3:2",
  "4:3",
  "9:16",
  "16:9",
];

/** 兼容早期角色资产包写入的非工作台画幅，避免下拉框与实际提示词不一致。 */
export const normalizeCreativeAspectRatio = (value: unknown): CreativeAspectRatio => {
  if (typeof value === "string" && (CREATIVE_ASPECT_RATIOS as string[]).includes(value))
    return value as CreativeAspectRatio;
  if (value === "4:5") return "2:3";
  return "1:1";
};

export type ImageGenerationSize = "1024x1024" | "1024x1536" | "1536x1024";

/** 当前图片适配器统一支持的尺寸；请求仍保留用户选择的目标画幅，便于后续裁切或换模型。 */
export const imageSizeForAspectRatio = (aspectRatio: CreativeAspectRatio): ImageGenerationSize => {
  if (aspectRatio === "1:1") return "1024x1024";
  if (aspectRatio === "2:3" || aspectRatio === "9:16") return "1024x1536";
  return "1536x1024";
};

export const aspectRatioForImageSize = (size: ImageGenerationSize): "1:1" | "2:3" | "3:2" =>
  size === "1024x1024" ? "1:1" : size === "1024x1536" ? "2:3" : "3:2";

export type CreativeCard = {
  projectId?: string;
  intent: string;
  subject: string;
  identityAnchor: string;
  bodyAndWardrobe: string;
  expressionAndPose: string;
  scene: string;
  lighting: string;
  camera: string;
  style: string;
  /** 每次出图都优先服从的贴合锚点；用于避免简化输入后画面漂移。 */
  mustKeep?: string;
  paradigmIds?: string[];
  paradigmModule?: string;
  learningModule?: string;
  avoid: string;
  aspectRatio: CreativeAspectRatio;
  referenceAssetIds: string[];
};

export type CreativeTaskStatus = "draft" | "ready" | "producing" | "blocked" | "review" | "completed" | "archived";
/** 贯穿创作、资产、生产与模板的工作单元。 */
export type CreativeTask = {
  id: string;
  projectId?: string;
  characterProfileId?: string;
  name: string;
  objective: string;
  status: CreativeTaskStatus;
  /** 本次任务继承的资产包，避免只带单张参考图而丢失完整上下文。 */
  collectionIds: string[];
  card: CreativeCard;
  resultAssetId?: string;
  createdAt: string;
  updatedAt: string;
};

export type CharacterGroup = "lead" | "supporting" | "ensemble" | "guest";
export type CharacterLifecycle = "draft" | "confirmed" | "archived";

export type VisualParadigmRole =
  "主体表达" | "摄影与媒介" | "版式与构图" | "作品用途" | "世界观与气质";
export type VisualParadigmStatus = "candidate" | "validated" | "rejected";

export type VisualParadigm = {
  id: string;
  name: string;
  role: VisualParadigmRole;
  description: string;
  promptModule: string;
  compatibleRoles: VisualParadigmRole[];
  conflictsWith: string[];
  status: VisualParadigmStatus;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ParadigmComposition = {
  paradigms: VisualParadigm[];
  acceptance: string;
  promptModule: string;
  warnings: string[];
  canApply: boolean;
};

export type CharacterProfile = {
  id: string;
  projectId?: string;
  name: string;
  card: CreativeCard;
  masterAssetId?: string;
  specification: CharacterSpecification;
  group: CharacterGroup;
  lifecycle: CharacterLifecycle;
  createdAt: string;
  updatedAt: string;
};

export type CharacterSpecification = {
  identityLocks: string[];
  wardrobeLocks: string[];
  visualMotifs: string[];
  forbiddenChanges: string[];
  requiredAssetKinds: AssetType[];
};

/** 一张参考图可以在不同细项中引用不同区域；数值坐标为可选的相对比例。 */
export type CharacterFactEvidence = {
  assetId: string;
  regionNote?: string;
  region?: { x: number; y: number; width: number; height: number };
};
export type CharacterFactState = "draft" | "confirmed" | "not_applicable";
export type CharacterVariantKind = "look" | "expression" | "pose" | "scene";
export type CharacterVariant = {
  id: string;
  profileId: string;
  kind: CharacterVariantKind;
  name: string;
  createdAt: string;
  updatedAt: string;
};
export type CharacterFact = {
  id: string;
  profileId: string;
  slotKey: string;
  group: string;
  label: string;
  variantId?: string;
  value: string;
  state: CharacterFactState;
  note: string;
  evidence: CharacterFactEvidence[];
  updatedAt: string;
};
export type CharacterFactInput = Pick<CharacterFact, "slotKey" | "value" | "state" | "evidence"> &
  Partial<Pick<CharacterFact, "variantId" | "note" | "group" | "label">>;
export type CharacterDetail = CharacterProfile & {
  facts: CharacterFact[];
  variants: CharacterVariant[];
  evidenceAssets: Asset[];
};

/**
 * 人物资产包导入结果：把外部压缩包转成可继续管理的角色档案、资产包和素材集合。
 * rightsStatus/confirmation 仍由导入后的审片流程决定，不在导入时伪造为可生产状态。
 */
export type CharacterAssetPackImportResult = {
  profile: CharacterDetail;
  collection: AssetCollection;
  assets: Asset[];
  importedCount: number;
  duplicateCount: number;
  warnings: string[];
  sourcePath: string;
};

export type GenerationBatchStatus =
  "draft" | "running" | "completed" | "partially_failed" | "interrupted";
export type GenerationVariantStatus = "planned" | "completed" | "failed";
export type GenerationVariant = {
  id: string;
  batchId: string;
  label: string;
  prompt: string;
  status: GenerationVariantStatus;
  jobId?: string;
  assetId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};
export type GenerationBatch = {
  id: string;
  projectId?: string;
  /** 批量生产必须回到一个创作任务，避免候选成为孤立图片。 */
  creativeTaskId?: string;
  name: string;
  providerId: ProviderId;
  aspectRatio: CreativeCard["aspectRatio"];
  /** 批量候选继承的参考链，所有变体都必须使用同一组身份锚点。 */
  referenceAssetIds: string[];
  estimatedCostUsd?: number;
  status: GenerationBatchStatus;
  variants: GenerationVariant[];
  createdAt: string;
  updatedAt: string;
};

export type PromptBuild = {
  positive: string;
  negative: string;
  modules: { label: string; value: string }[];
};

export type RecipeStatus = "draft" | "validated" | "rejected";
export type CreativeRecipe = {
  id: string;
  projectId?: string;
  /** 方法卡回溯到实际生产任务，而不是脱离成图结果的提示词片段。 */
  creativeTaskId?: string;
  providerId?: ProviderId;
  name: string;
  purpose: string;
  card: CreativeCard;
  prompt: string;
  negative: string;
  sourceAssetIds: string[];
  status: RecipeStatus;
  evidence: string[];
  createdAt: string;
  updatedAt: string;
};

export type GenerationQualityTier = "draft" | "standard" | "premium";

export type PromptTranslation = {
  providerId: Extract<ProviderId, "openai" | "flux" | "fal">;
  qualityTier: GenerationQualityTier;
  positive: string;
  negative: string;
  notes: string[];
};

export type CreativeCardSuggestion = Partial<
  Pick<
    CreativeCard,
    | "subject"
    | "identityAnchor"
    | "bodyAndWardrobe"
    | "expressionAndPose"
    | "scene"
    | "lighting"
    | "camera"
    | "style"
    | "avoid"
  >
> & { reasoning?: string };

export type ImageUnderstandingReport = {
  subject: string;
  identityAnchor: string;
  bodyAndWardrobe: string;
  expressionAndPose: string;
  scene: string;
  lighting: string;
  camera: string;
  style: string;
  continuityLocks: string[];
  risks: string[];
  editablePrompt: string;
  rawResponse: string;
};

export type ReversePrompt = {
  prompt: string;
  modules: { label: string; value: string }[];
  changeOptions: Array<"场景" | "姿势" | "服装" | "光线" | "镜头">;
};

export type ShotContract = {
  subjectAnchor: string;
  referenceAssetIds: string[];
  startFrame: string;
  action: string;
  cameraMotion: string;
  durationSeconds: number;
  frameRate: 24 | 25 | 30;
  keep: string[];
  avoid: string[];
  output: {
    aspectRatio: CreativeCard["aspectRatio"];
    resolution: "720p" | "1080p";
  };
};

export type ShotPlan = {
  id: string;
  projectId: string;
  name: string;
  shot: ShotContract;
  compiledPrompt: string;
  referenceAssetId?: string;
  createdAt: string;
  updatedAt: string;
};

export type LearningPattern = {
  id: string;
  name: string;
  status: "candidate" | "validated" | "rejected";
  scope: string[];
  module: string;
  rawInput: string;
  evidence: string[];
  contraindications: string[];
  createdAt: string;
  updatedAt: string;
};

export type PromptSource = {
  id: string;
  url: string;
  repository: string;
  title: string;
  license?: string;
  summary: string;
  sourceType: "github" | "web";
  status: "imported" | "needs_review" | "failed";
  importedAt: string;
};

export type PromptEntry = {
  id: string;
  sourceRepository: string;
  sourcePath: string;
  title: string;
  category: string;
  promptText: string;
  usage?: string;
  license?: string;
  createdAt: string;
};

export type JobKind = "vision_analysis" | "image_generation" | "image_to_video";
export type JobStatus = "queued" | "in_progress" | "completed" | "failed" | "unknown";

export type StudioJob = {
  id: string;
  projectId?: string;
  kind: JobKind;
  providerId: string;
  status: JobStatus;
  request: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ProviderId = "openai" | "flux" | "fal" | "deepseek" | "gemini";
export type ProviderCapability =
  "text" | "vision" | "image" | "image_edit" | "video";

export type ProviderConnection = {
  id: ProviderId;
  configured: boolean;
  capabilities: ProviderCapability[];
};

export type ProviderStatus = {
  providers: ProviderConnection[];
  routes: Partial<Record<ProviderCapability, ProviderId>>;
  network?: "system_proxy" | "direct";
};

export type BudgetStatus = {
  monthlyBudgetUsd?: number;
  plannedSpendUsd: number;
  remainingUsd?: number;
};
