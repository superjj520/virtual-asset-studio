import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import type { IpcMain } from "electron";
import { StudioDatabase } from "./db/client";
import { AssetRepository } from "./services/assets/repository";
import { ManagedStore } from "./services/files/managed-store";
import {
  ImportService,
  type ImportAssetInput,
} from "./services/import/import-service";
import { ProjectRepository } from "./services/projects/repository";
import { LearningPatternRepository } from "./services/learning/repository";
import { extractPromptPattern } from "./services/learning/prompt-learning";
import {
  compilePrompt,
  compileShotContract,
} from "./services/creation/prompt-compiler";
import { imageSizeForAspectRatio } from "../src/shared/types";
import { normalizeReferenceBindings } from "../src/shared/reference-bindings";
import type {
  Asset,
  CreativeCard,
  ReferenceAssetBinding,
  ProviderCapability,
  ProviderId,
  ProviderStatus,
  ShotContract,
} from "../src/shared/types";
import { SettingsRepository } from "./services/settings/repository";
import { OpenAIProvider } from "./services/providers/openai-provider";
import { FluxProvider } from "./services/providers/flux-provider";
import { FalProvider, FalRemoteTaskError, type FalRemoteTask } from "./services/providers/fal-provider";
import { GeminiProvider } from "./services/providers/gemini-provider";
import { DeepSeekProvider } from "./services/providers/deepseek-provider";
import { GenerationBatchRepository } from "./services/batches/repository";
import { JobRepository } from "./services/jobs/repository";
import { hashBuffer } from "./services/files/hash";
import { exportProject } from "./services/export/project-exporter";
import { RelationshipRepository } from "./services/relationships/repository";
import { ShotPlanRepository, type CreateShotPlanInput } from "./services/shots/repository";
import { CharacterProfileRepository } from "./services/characters/repository";
import { CharacterWorkspaceRepository } from "./services/characters/workspace-repository";
import { SceneWorkspaceRepository } from "./services/scenes/workspace-repository";
import { PromptSourceRepository } from "./services/learning/source-repository";
import { importGitHubPromptSource } from "./services/learning/github-source-importer";
import { importWebPromptSource } from "./services/learning/web-source-importer";
import { PromptEntryRepository } from "./services/learning/prompt-entry-repository";
import { VisualParadigmRepository } from "./services/paradigms/repository";
import { buildReversePrompt } from "./services/understanding/reverse-prompt";
import { CreativeRecipeRepository } from "./services/recipes/repository";
import { CreativeTaskRepository } from "./services/tasks/repository";
import { AssetCollectionRepository } from "./services/collections/repository";
import { CharacterAssetPackImporter } from "./services/import/character-pack-importer";
import { BackupService } from "./services/backup/backup-service";
import { ImageReviewRepository } from "./services/reviews/repository";

type SecretCipher = {
  isAvailable: () => boolean;
  encrypt: (value: string) => string;
  decrypt: (value: string) => string;
};

const isNetworkOutcomeUnknown = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /网络请求失败|请求超时|响应内容读取超时|fetch failed|未能连接服务/i.test(message);
};

const remoteTaskFromJob = (job: import("../src/shared/types").StudioJob): FalRemoteTask | undefined => {
  const value = job.result?.remoteTask;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const task = value as Record<string, unknown>;
  if (typeof task.requestId !== "string" || typeof task.statusUrl !== "string" || typeof task.responseUrl !== "string" || typeof task.model !== "string") return undefined;
  return { requestId: task.requestId, statusUrl: task.statusUrl, responseUrl: task.responseUrl, model: task.model };
};

const absolutePath = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim() || value.includes("\0") || !isAbsolute(value))
    throw new Error(`${label}必须是绝对路径。`);
  return value;
};

export const createStudioRuntime = (
  userDataDirectory: string,
  cipher?: SecretCipher,
) => {
  mkdirSync(userDataDirectory, { recursive: true });
  const database = new StudioDatabase(
    join(userDataDirectory, "virtual-asset-studio.sqlite"),
  );
  const assets = new AssetRepository(database);
  const projects = new ProjectRepository(database);
  const learning = new LearningPatternRepository(database);
  const store = new ManagedStore(join(userDataDirectory, "managed-assets"));
  const importer = new ImportService(assets, store);
  const settings = new SettingsRepository(database);
  const jobs = new JobRepository(database);
  const relationships = new RelationshipRepository(database);
  const shots = new ShotPlanRepository(database);
  const characters = new CharacterProfileRepository(database);
  const characterWorkspace = new CharacterWorkspaceRepository(database, characters);
  const sceneWorkspace = new SceneWorkspaceRepository(database);
  const batches = new GenerationBatchRepository(database);
  const promptSources = new PromptSourceRepository(database);
  const promptEntries = new PromptEntryRepository(database);
  const paradigms = new VisualParadigmRepository(database);
  const recipes = new CreativeRecipeRepository(database);
  const tasks = new CreativeTaskRepository(database);
  const collections = new AssetCollectionRepository(database);
  const characterPackImporter = new CharacterAssetPackImporter(importer, characters, collections, projects);
  const backupService = new BackupService(join(userDataDirectory, "virtual-asset-studio.sqlite"), join(userDataDirectory, "managed-assets"));
  const imageReviews = new ImageReviewRepository(database);
  const libraryProject = projects.getOrCreateLibraryProject();
  let databaseClosedForRestore = false;
  jobs.recoverInterrupted();
  batches.recoverInterrupted();
  const apiKeyFor = (providerId: ProviderId) => {
    const encrypted = settings.get(`${providerId}_api_key`);
    if (!encrypted || !cipher?.isAvailable()) return undefined;
    try {
      return cipher.decrypt(encrypted);
    } catch {
      return undefined;
    }
  };
  // 首页只需要知道本机是否保存过凭据。不要在状态查询中初始化安全存储；
  // 真正调用模型或保存新密钥时才检查并解密，避免应用启动即触发 macOS 钥匙串授权。
  const hasStoredApiKey = (providerId: ProviderId) =>
    Boolean(settings.get(`${providerId}_api_key`));
  const openai = new OpenAIProvider({ apiKey: () => apiKeyFor("openai") });
  const flux = new FluxProvider({ apiKey: () => apiKeyFor("flux") });
  const fal = new FalProvider({ apiKey: () => apiKeyFor("fal") });
  const gemini = new GeminiProvider({ apiKey: () => apiKeyFor("gemini") });
  const deepseek = new DeepSeekProvider({
    apiKey: () => apiKeyFor("deepseek"),
  });
  const imageProviders: Partial<
    Record<
      ProviderId,
      {
        generateImage: (input: {
          prompt: string;
          size: "1024x1024" | "1024x1536" | "1536x1024";
          quality?: "medium" | "high";
        }) => Promise<Buffer>;
      }
    >
  > = { openai, flux, fal, gemini };
  const imageEditProviders: Partial<Record<ProviderId, {
    refineImage: (input: {
      prompt: string;
      size: "1024x1024" | "1024x1536" | "1536x1024";
      referencePath: string;
      referenceMediaType: string;
    }) => Promise<Buffer>;
  }>> = { openai, fal, gemini };
  const videoProviders: Partial<
    Record<
      ProviderId,
      {
        createVideo: OpenAIProvider["createVideo"];
        getVideo: OpenAIProvider["getVideo"];
        downloadVideo: OpenAIProvider["downloadVideo"];
      }
    >
  > = { openai };
  const generateWith = (
    providerId: ProviderId,
    input: {
      prompt: string;
      size: "1024x1024" | "1024x1536" | "1536x1024";
      quality?: "medium" | "high";
    },
  ) => {
    const provider = imageProviders[providerId];
    if (!provider)
      throw new Error(`模型 ${providerId} 尚未安装图片生成适配器。`);
    return provider.generateImage(input);
  };
  const generateWithResult = async (
    providerId: ProviderId,
    input: { prompt: string; size: "1024x1024" | "1024x1536" | "1536x1024"; quality?: "medium" | "high"; onRemoteTask?: (task: FalRemoteTask) => void },
  ): Promise<{ image: Buffer; remoteTask?: FalRemoteTask }> => {
    if (providerId === "fal") {
      const result = await fal.generateImageWithTask(input);
      return { image: result.image, remoteTask: result.remoteTask };
    }
    return { image: await generateWith(providerId, input) };
  };
  const refineWithResult = async (
    providerId: ProviderId,
    input: { prompt: string; size: "1024x1024" | "1024x1536" | "1536x1024"; referencePath: string; referenceMediaType: string; onRemoteTask?: (task: FalRemoteTask) => void },
  ): Promise<{ image: Buffer; remoteTask?: FalRemoteTask }> => {
    if (providerId === "fal") {
      const result = await fal.refineImageWithTask(input);
      return { image: result.image, remoteTask: result.remoteTask };
    }
    const provider = imageEditProviders[providerId];
    if (!provider) throw new Error(`模型 ${providerId} 尚未安装图片修订适配器。`);
    return { image: await provider.refineImage(input) };
  };
  const videoProviderFor = (providerId: ProviderId) => {
    const provider = videoProviders[providerId];
    if (!provider) throw new Error(`模型 ${providerId} 尚未安装视频适配器。`);
    return provider;
  };
  const providerConnections = () => [
      {
        id: "openai",
        configured: hasStoredApiKey("openai"),
        capabilities: ["vision", "image", "image_edit", "video"],
      },
      { id: "flux", configured: hasStoredApiKey("flux"), capabilities: ["image"] },
      { id: "fal", configured: hasStoredApiKey("fal"), capabilities: ["image", "image_edit"] },
      { id: "gemini", configured: hasStoredApiKey("gemini"), capabilities: ["image", "image_edit"] },
      {
        id: "deepseek",
        configured: hasStoredApiKey("deepseek"),
        capabilities: ["text"],
      },
    ] satisfies ProviderStatus["providers"];
  const defaultRouteFor = (
    capability: ProviderCapability,
    providers: ProviderStatus["providers"],
  ): ProviderId | undefined => {
    const priorities: Record<ProviderCapability, ProviderId[]> = {
      text: ["deepseek", "gemini", "openai"],
      vision: ["openai"],
      image: ["fal", "gemini", "openai", "flux"],
      image_edit: ["fal", "gemini", "openai"],
      video: ["openai"],
    };
    const compatible = (providerId: ProviderId) => providers.find(
      (provider) => provider.id === providerId && provider.capabilities.includes(capability),
    );
    return priorities[capability].find((providerId) => compatible(providerId)?.configured)
      ?? priorities[capability].find((providerId) => compatible(providerId))
      ?? undefined;
  };
  const providerStatus = (): ProviderStatus => {
    const providers = providerConnections();
    const routes = (Object.keys({ text: true, vision: true, image: true, image_edit: true, video: true }) as ProviderCapability[])
      .reduce<ProviderStatus["routes"]>((result, capability) => {
        result[capability] = (settings.get(`route_${capability}`) as ProviderId | undefined)
          ?? defaultRouteFor(capability, providers);
        return result;
      }, {});
    return {
      providers,
      routes,
      network: process.env.NODE_USE_ENV_PROXY === "1" && (process.env.HTTPS_PROXY || process.env.HTTP_PROXY)
        ? "system_proxy"
        : "direct",
    };
  };
  const routeFor = (capability: ProviderCapability): ProviderId => {
    const configured = providerStatus();
    const providerId = configured.routes[capability];
    const connection = configured.providers.find(
      (item) => item.id === providerId,
    );
    if (
      !providerId ||
      !connection?.configured ||
      !connection.capabilities.includes(capability)
    ) {
      throw new Error(
        `“${capability}”尚未配置可用模型。请在模型连接页保存密钥并选择路由。`,
      );
    }
    return providerId;
  };
  const budgetStatus = () => {
    const monthlyBudgetUsd =
      Number(settings.get("monthly_budget_usd")) || undefined;
    const plannedSpendUsd = batches.plannedSpendSince(
      new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      ).toISOString(),
    );
    return {
      monthlyBudgetUsd,
      plannedSpendUsd,
      remainingUsd:
        monthlyBudgetUsd === undefined
          ? undefined
          : Number(Math.max(0, monthlyBudgetUsd - plannedSpendUsd).toFixed(2)),
    };
  };

  const referenceForGeneration = (assetId: string, projectId?: string): Asset => {
    if (typeof assetId !== "string" || !assetId.trim())
      throw new Error("参考素材编号无效。");
    const asset = assets.findById(assetId);
    if (!asset) throw new Error("参考素材不存在，请重新选择。");
    if (!asset.mediaType.startsWith("image/"))
      throw new Error("参考素材必须是图片。");
    if (!existsSync(asset.managedPath))
      throw new Error("参考素材文件不存在，请重新导入。");
    if (asset.confirmation !== "confirmed")
      throw new Error("参考素材尚未确认，不能用于生产。");
    if (asset.rightsStatus !== "original" && asset.rightsStatus !== "authorized")
      throw new Error("参考素材权利状态未获确认，不能用于生产。");
    const assignments = database.database.prepare(
      "SELECT project_id FROM project_assets WHERE asset_id = ?",
    ).all(asset.id) as Array<{ project_id: string }>;
    const isLibrary = !projectId || projectId === libraryProject.id;
    if (isLibrary) {
      if (assignments.some((assignment) => assignment.project_id !== libraryProject.id))
        throw new Error("参考素材归属于其他项目，请先切换项目或明确归档关系。");
    } else if (!assignments.some((assignment) => assignment.project_id === projectId)) {
      throw new Error("参考素材未关联当前项目，请先在项目中归档。");
    }
    return asset;
  };

  const sessionForGeneration = (
    sessionId: string | undefined,
    allowedModes: import("../src/shared/types").GenerationSessionMode[],
  ) => {
    if (!sessionId) return undefined;
    const session = characterWorkspace.getSession(sessionId);
    if (!session) throw new Error("生成会话不存在，请重新从人物或场景工作室开始。");
    if (!allowedModes.includes(session.mode)) throw new Error("生成会话模式与当前生产操作不一致。");
    if (session.status === "completed" || session.status === "archived")
      throw new Error("生成会话已结束，请新建会话后再生产。");
    return session;
  };

  const attachSessionOutput = (
    session: import("../src/shared/types").GenerationSession | undefined,
    assetId: string,
    parentAssetId?: string,
  ) => {
    if (!session) return;
    if (session.characterProfileId) characterWorkspace.attachMedia(session.characterProfileId, {
      versionId: session.characterVersionId, stateId: session.characterStateId, sessionId: session.id,
      assetId, parentAssetId, role: "candidate",
    });
    if (session.sceneProfileId) sceneWorkspace.attachMedia(session.sceneProfileId, {
      versionId: session.sceneVersionId, stateId: session.sceneStateId, sessionId: session.id,
      assetId, parentAssetId, role: "candidate",
    });
    characterWorkspace.updateSessionStatus(session.id, "review");
  };

  const writeGeneratedAsset = (
    value: Buffer,
    input: {
      type: "image" | "video";
      mediaType: string;
      extension: string;
      jobId: string;
      projectId?: string;
      sourceAssetIds?: string[];
    },
  ) => {
    const sha256 = hashBuffer(value);
    if (assets.findByHash(sha256))
      throw new Error("生成内容与已有资产重复，未创建新候选；请到现有资产复核来源和权利。");
    const managedPath = store.writeGenerated(value, sha256, input.extension);
    const sourceAssetIds = [
      ...new Set((input.sourceAssetIds ?? []).filter(Boolean)),
    ];
    const result = assets.createOrGet({
      type: input.type,
      name: `${input.type === "image" ? "生成图" : "生成视频"}-${new Date().toISOString().replace(/[:.]/g, "-")}`,
      managedPath,
      sourcePath: `generated://job/${input.jobId}`,
      sha256,
      mediaType: input.mediaType,
      rightsStatus: "unknown",
      metadata: {
        generatedFromJobId: input.jobId,
        sourceAssetIds,
        provenance: "ai_generated",
        rightsReview: "pending",
      },
    });
    if (input.projectId) projects.attachAsset(input.projectId, result.asset.id);
    for (const sourceAssetId of sourceAssetIds)
      relationships.create(
        result.asset.id,
        sourceAssetId,
        input.type === "video" ? "shot_from" : "derived_from",
      );
    return result.asset;
  };

  return {
    register(ipcMain: IpcMain) {
      ipcMain.handle("studio:health", () => ({
        appDataDir: userDataDirectory,
        databaseReady: true,
      }));
      ipcMain.handle(
        "assets:import",
        async (_event, input: ImportAssetInput) => {
          input = { ...input, filePath: absolutePath(input?.filePath, "素材路径") };
          const result = await importer.import(input);
          if (input.projectId)
            projects.attachAsset(input.projectId, result.asset.id);
          return result;
        },
      );
      ipcMain.handle("assets:list", (_event, query) => assets.list(query));
      ipcMain.handle("assets:usage", (_event, assetId: string) => assets.usage(assetId));
      ipcMain.handle("collections:create", (_event, input) => collections.create(input));
      ipcMain.handle("collections:list", (_event, projectId?: string) => collections.list(projectId));
      ipcMain.handle("collections:detail", (_event, id: string) => collections.getDetail(id));
      ipcMain.handle("collections:update", (_event, id: string, patch) => collections.update(id, patch));
      ipcMain.handle("collections:attach-asset", (_event, collectionId: string, assetId: string, role?: string, moduleKey?: string, notes?: string) => collections.attachAsset(collectionId, assetId, role, moduleKey, notes));
      ipcMain.handle("collections:detach-asset", (_event, collectionId: string, assetId: string) => collections.detachAsset(collectionId, assetId));
      ipcMain.handle(
        "assets:update-confirmation",
        (
          _event,
          assetId: string,
          confirmation: "draft" | "confirmed" | "rejected",
        ) => assets.updateConfirmation(assetId, confirmation),
      );
      ipcMain.handle("assets:update-rights", (_event, assetId: string, rightsStatus: import("../src/shared/types").RightsStatus, reason: string) =>
        assets.updateRights(assetId, rightsStatus, reason));
      ipcMain.handle(
        "assets:set-master",
        (_event, assetId: string, enabled: boolean, projectId?: string) => {
          if (!projectId) throw new Error("请先选择项目，再锁定项目母版。");
          return assets.setProjectMaster(projectId, assetId, Boolean(enabled));
        },
      );
      ipcMain.handle(
        "assets:review",
        (
          _event,
          assetId: string,
          review: {
            identity: number;
            scene: number;
            realism: number;
            videoReady: number;
            note?: string;
          },
        ) => {
          const values = [
            review.identity,
            review.scene,
            review.realism,
            review.videoReady,
          ];
          if (
            values.some(
              (value) => !Number.isInteger(value) || value < 1 || value > 5,
            )
          )
            throw new Error("每项审片评分须为 1 到 5 分。");
          return assets.mergeMetadata(assetId, {
            review: { ...review, reviewedAt: new Date().toISOString() },
          });
        },
      );
      ipcMain.handle("image-reviews:workspace", (_event, projectId: string) => imageReviews.workspace(projectId));
      ipcMain.handle("image-reviews:create", (_event, input) => imageReviews.create(input));
      ipcMain.handle("image-reviews:promote", (_event, input) => imageReviews.promote(input));
      ipcMain.handle("assets:lineage", (_event, assetId: string) =>
        relationships.listForAsset(assetId).flatMap((relationship) => {
          const direction =
            relationship.fromAssetId === assetId ? "source" : "derived";
          const otherAssetId =
            direction === "source"
              ? relationship.toAssetId
              : relationship.fromAssetId;
          const asset = assets.findById(otherAssetId);
          return asset
            ? [
                {
                  relationship,
                  direction,
                  asset: { id: asset.id, name: asset.name, type: asset.type },
                },
              ]
            : [];
        }),
      );
      ipcMain.handle("assets:preview", (_event, assetId: string) => {
        const asset = assets.findById(assetId);
        if (!asset || !asset.mediaType.startsWith("image/")) return undefined;
        const thumbnail = join(dirname(asset.managedPath), "thumbnail.webp");
        const previewPath = existsSync(thumbnail)
          ? thumbnail
          : asset.managedPath;
        const mediaType =
          previewPath === thumbnail ? "image/webp" : asset.mediaType;
        return `data:${mediaType};base64,${readFileSync(previewPath).toString("base64")}`;
      });
      ipcMain.handle("projects:create", (_event, name, medium) =>
        projects.create(name, medium),
      );
      ipcMain.handle("projects:list", () => projects.list());
      ipcMain.handle(
        "recipes:create",
        (_event, input: {
          name: string; projectId?: string; creativeTaskId?: string; providerId?: ProviderId; purpose: string; card: CreativeCard;
          applicability: string; invalidationConditions: string[]; prompt: string; negative: string; sourceAssetIds: string[];
        }) => {
          if (!input.name?.trim() || !input.purpose?.trim() || !input.applicability?.trim() || !input.prompt?.trim())
            throw new Error("请填写配方名称、用途、适用条件和提示词后再保存。");
          if (!Array.isArray(input.invalidationConditions) || !input.invalidationConditions.some((item) => typeof item === "string" && item.trim()))
            throw new Error("请至少填写一条配方失效条件。");
          if (input.creativeTaskId && !tasks.get(input.creativeTaskId))
            throw new Error("关联的创作任务不存在，无法保存方法卡。");
          return recipes.create({ ...input, name: input.name.trim(), purpose: input.purpose.trim() });
        },
      );
      ipcMain.handle("recipes:list", (_event, projectId?: string) => recipes.list(projectId));
      ipcMain.handle(
        "recipes:update-status",
        (_event, id: string, status: "validated" | "rejected", evidence: string) =>
          recipes.updateStatus(id, status, evidence),
      );
      ipcMain.handle("projects:workspace", (_event, projectId: string) =>
        projects.getWorkspace(projectId),
      );
      ipcMain.handle(
        "projects:update-brief",
        (_event, projectId: string, brief: import("../src/shared/types").ProjectBrief) => {
          const values = [brief?.goal, brief?.audience, brief?.visualWorld, brief?.delivery, brief?.acceptance];
          if (values.some((value) => typeof value !== "string"))
            throw new Error("项目简报格式不完整。\n");
          return projects.updateBrief(projectId, {
            goal: brief.goal.trim(),
            audience: brief.audience.trim(),
            visualWorld: brief.visualWorld.trim(),
            delivery: brief.delivery.trim(),
            acceptance: brief.acceptance.trim(),
          });
        },
      );
      ipcMain.handle(
        "projects:export",
        (_event, projectId: string, destinationDirectory: string) => {
          const project = projects.list().find((item) => item.id === projectId);
          if (!project) throw new Error("项目不存在。");
          destinationDirectory = absolutePath(destinationDirectory, "导出位置");
          return exportProject(
            project,
            projects.listAssets(projectId),
            destinationDirectory,
            {
              characters: characters.list(projectId).map((profile) => characters.getDetail(profile.id)),
              collections: collections.list(projectId).map((collection) => collections.getDetail(collection.id)),
              shots: shots.list(projectId),
              recipes: recipes.list(projectId),
              tasks: tasks.list(projectId),
            },
          );
        },
      );
      ipcMain.handle("data:create-backup", async (_event, destinationDirectory: string) => {
        destinationDirectory = absolutePath(destinationDirectory, "备份位置");
        return backupService.create(database.database, destinationDirectory);
      });
      ipcMain.handle("data:restore-backup", (_event, backupDirectory: string) => {
        backupDirectory = absolutePath(backupDirectory, "备份目录");
        database.database.pragma("wal_checkpoint(TRUNCATE)");
        database.close();
        databaseClosedForRestore = true;
        return backupService.restore(backupDirectory);
      });
      ipcMain.handle(
        "creation:compile-prompt",
        (_event, card: CreativeCard) => {
          paradigms.recordUse(card.paradigmIds ?? []);
          return compilePrompt(card);
        },
      );
      ipcMain.handle(
        "creation:enrich-card",
        async (_event, card: CreativeCard) => {
          const providerId = routeFor("text");
          if (providerId !== "deepseek")
            throw new Error(`模型 ${providerId} 尚未安装创作理解适配器。`);
          return deepseek.enrichCreativeCard(card);
        },
      );
      ipcMain.handle(
        "creation:translate-prompt",
        async (
          _event,
          input: {
            prompt: string;
            negative?: string;
            providerId: "openai" | "flux";
            qualityTier: "draft" | "standard" | "premium";
          },
        ) => {
          if (routeFor("text") !== "deepseek")
            throw new Error("当前文字路由尚未安装提示词适配器。");
          if (!input.prompt?.trim()) throw new Error("请先生成结构化提示词。");
          return deepseek.translatePrompt(input);
        },
      );
      ipcMain.handle(
        "characters:create",
        (
          _event,
          input: {
            name: string;
            card: CreativeCard;
            projectId?: string;
            masterAssetId?: string;
            group?: "lead" | "supporting" | "ensemble" | "guest";
            lifecycle?: "draft" | "confirmed" | "archived";
          },
        ) => {
          if (!input.name.trim()) throw new Error("请为角色填写名称。");
          if (!input.card.identityAnchor.trim() && !input.card.subject.trim())
            throw new Error("至少填写人物主体或不变特征后再保存角色。");
          return characters.create({ ...input, name: input.name.trim() });
        },
      );
      ipcMain.handle("characters:list", (_event, projectId?: string) =>
        characters.list(projectId),
      );
      ipcMain.handle(
        "characters:import-asset-pack",
        (_event, input: { zipPath: string; projectId?: string; name?: string; rightsStatus?: import("../src/shared/types").RightsStatus; rightsReason?: string }) =>
          characterPackImporter.import({ ...input, zipPath: absolutePath(input?.zipPath, "人物资产包路径") }),
      );
      ipcMain.handle("characters:detail", (_event, id: string) => characters.getDetail(id));
      // 保留旧桥名称，兼容已安装的旧渲染层；新界面统一走 characters:import-asset-pack。
      ipcMain.handle(
        "character-pack:import",
        (_event, input: { zipPath: string; projectId?: string; name?: string; rightsStatus?: import("../src/shared/types").RightsStatus; rightsReason?: string }) =>
          characterPackImporter.import({ ...input, zipPath: absolutePath(input?.zipPath, "人物资产包路径") }),
      );
      ipcMain.handle("characters:create-variant", (_event, id: string, kind, name) => characters.createVariant(id, kind, name));
      ipcMain.handle("characters:upsert-fact", (_event, id: string, input) => characters.upsertFact(id, input));
      ipcMain.handle("tasks:create", (_event, input) => tasks.create(input));
      ipcMain.handle("tasks:list", (_event, projectId?: string) => tasks.list(projectId));
      ipcMain.handle("tasks:update", (_event, id: string, patch) => tasks.update(id, patch));
      ipcMain.handle("characters:update", (_event, id: string, patch) =>
        characters.update(id, patch),
      );
      ipcMain.handle("character-workspace:get", (_event, profileId: string) =>
        characterWorkspace.getWorkspace(profileId),
      );
      ipcMain.handle("character-versions:create", (_event, profileId: string, input) =>
        characterWorkspace.createVersion(profileId, input),
      );
      ipcMain.handle("character-states:create", (_event, profileId: string, input) =>
        characterWorkspace.createState(profileId, input),
      );
      ipcMain.handle("character-states:update", (_event, id: string, patch) =>
        characterWorkspace.updateState(id, patch),
      );
      ipcMain.handle("generation-sessions:create", (_event, input) =>
        characterWorkspace.createSession(input),
      );
      ipcMain.handle("generation-sessions:update-status", (_event, id: string, status) =>
        characterWorkspace.updateSessionStatus(id, status),
      );
      ipcMain.handle("character-media:attach", (_event, profileId: string, input) =>
        characterWorkspace.attachMedia(profileId, input),
      );
      ipcMain.handle("scenes:create", (_event, input) => sceneWorkspace.createProfile(input));
      ipcMain.handle("scenes:list", (_event, projectId?: string) => sceneWorkspace.listProfiles(projectId));
      ipcMain.handle("scenes:update", (_event, id: string, patch) => sceneWorkspace.updateProfile(id, patch));
      ipcMain.handle("scene-workspace:get", (_event, profileId: string) => sceneWorkspace.getWorkspace(profileId));
      ipcMain.handle("scene-versions:create", (_event, profileId: string, input) => sceneWorkspace.createVersion(profileId, input));
      ipcMain.handle("scene-states:create", (_event, profileId: string, input) => sceneWorkspace.createState(profileId, input));
      ipcMain.handle("scene-states:update", (_event, id: string, patch) => sceneWorkspace.updateState(id, patch));
      ipcMain.handle("scene-media:attach", (_event, profileId: string, input) => sceneWorkspace.attachMedia(profileId, input));
      ipcMain.handle(
        "batches:create",
        (
          _event,
          input: {
            name: string;
            projectId?: string;
            creativeTaskId?: string;
            aspectRatio: CreativeCard["aspectRatio"];
            referenceAssetIds?: string[];
            referenceBindings?: ReferenceAssetBinding[];
            variants: Array<{ label: string; prompt: string }>;
          },
        ) => {
          if (!input.name.trim() || !input.variants.length)
            throw new Error("批量任务需要名称和至少一个变体。");
          if (input.creativeTaskId && !tasks.get(input.creativeTaskId))
            throw new Error("关联的创作任务不存在，无法建立候选批次。");
          const referenceSelection = normalizeReferenceBindings(input.referenceAssetIds ?? [], input.referenceBindings);
          const { referenceAssetIds, referenceBindings } = referenceSelection;
          const references = referenceAssetIds.map((id) => referenceForGeneration(id, input.projectId));
          const providerId = routeFor("image");
          if (references.length && !imageEditProviders[providerId])
            throw new Error("当前图片模型不支持批量参考图编辑，请切换到可用的修图模型。");
          const perImageCost = providerId === "fal"
            ? (input.aspectRatio === "1:1" ? 0.003 : 0.006)
            : providerId === "flux" ? 0.04 : undefined;
          const estimatedCostUsd = perImageCost === undefined
            ? undefined
            : Number((input.variants.length * perImageCost).toFixed(2));
          const budget = budgetStatus();
          if (
            estimatedCostUsd &&
            budget.monthlyBudgetUsd !== undefined &&
            budget.plannedSpendUsd + estimatedCostUsd > budget.monthlyBudgetUsd
          )
            throw new Error(
              `本批预计 $${estimatedCostUsd}，会超过本月预算 $${budget.monthlyBudgetUsd}。请调整批量数量或提高预算。`,
            );
          return batches.create({
            ...input,
            referenceAssetIds,
            referenceBindings,
            name: input.name.trim(),
            providerId,
            estimatedCostUsd,
          });
        },
      );
      ipcMain.handle("batches:list", (_event, projectId?: string) =>
        batches.list(projectId),
      );
      ipcMain.handle("batches:run", async (_event, batchId: string) => {
        const batch = batches.claimForRun(batchId);
        if (!batch)
          throw new Error("批量任务不存在、已完成或正在运行；请刷新队列后再操作。");
        let failed = false;
        try {
          if (batch.creativeTaskId)
            tasks.update(batch.creativeTaskId, { status: "producing" });
          const size = imageSizeForAspectRatio(batch.aspectRatio);
          const references = batch.referenceAssetIds.map((id) => referenceForGeneration(id, batch.projectId));
          for (const item of batch.variants.filter(
            (variant) => variant.status === "planned",
          )) {
            let job: import("../src/shared/types").StudioJob | undefined;
            try {
              job = jobs.create({
                projectId: batch.projectId ?? libraryProject.id,
                kind: "image_generation",
                providerId: batch.providerId,
                request: { prompt: item.prompt, size, requestedAspectRatio: batch.aspectRatio, actualAspectRatio: size === "1024x1024" ? "1:1" : size === "1024x1536" ? "2:3" : "3:2", referenceAssetIds: batch.referenceAssetIds, referenceBindings: batch.referenceBindings, appliedReferenceAssetIds: references.length ? [references[0].id] : [], referenceUsage: batch.referenceBindings.map((binding) => ({ ...binding, status: binding.priority === "primary" ? "sent" : "recorded" })), batchId, variantId: item.id },
              });
              jobs.update(job.id, { status: "in_progress" });
              // 先落盘关联，再调用服务；进程中断后不会把可能已付费的变体伪装成 planned。
              batches.updateVariant(item.id, { status: "planned", jobId: job.id });
              const generated = references.length
                ? await refineWithResult(batch.providerId, { prompt: `${item.prompt}\n参考图仅用于保持人物身份和服装连续性。`, size, referencePath: references[0].managedPath, referenceMediaType: references[0].mediaType, onRemoteTask: (remoteTask) => jobs.update(job!.id, { status: "in_progress", result: { remoteTask, requestedAspectRatio: batch.aspectRatio, actualSize: size, batchId, variantId: item.id } }) })
                : await generateWithResult(batch.providerId, { prompt: item.prompt, size, onRemoteTask: (remoteTask) => jobs.update(job!.id, { status: "in_progress", result: { remoteTask, requestedAspectRatio: batch.aspectRatio, actualSize: size, batchId, variantId: item.id } }) });
              const asset = writeGeneratedAsset(generated.image, {
                type: "image",
                mediaType: "image/png",
                extension: ".png",
                jobId: job.id,
                projectId: batch.projectId,
                sourceAssetIds: references.length ? [references[0].id] : [],
              });
              jobs.update(job.id, {
                status: "completed",
                result: { assetId: asset.id, remoteTask: generated.remoteTask, requestedAspectRatio: batch.aspectRatio, actualSize: size, batchId, variantId: item.id },
                error: null,
              });
              batches.updateVariant(item.id, {
                status: "completed",
                jobId: job.id,
                assetId: asset.id,
                error: undefined,
              });
            } catch (error) {
              failed = true;
              const message = error instanceof Error ? error.message : "批量出图失败。";
              if (job) {
                const remoteTask = error instanceof FalRemoteTaskError ? error.remoteTask : undefined;
                jobs.update(job.id, {
                  status: remoteTask || isNetworkOutcomeUnknown(error) ? "unknown" : "failed",
                  ...(remoteTask ? { result: { remoteTask, requestedAspectRatio: batch.aspectRatio, actualSize: size, batchId, variantId: item.id } } : {}),
                  error: message,
                });
                batches.updateVariant(item.id, {
                  status: "failed",
                  jobId: job.id,
                  error: isNetworkOutcomeUnknown(error) ? `状态未知：${message} 请勿盲目重试。` : message,
                });
              } else {
                batches.updateVariant(item.id, { status: "failed", error: message });
              }
            }
          }
          const completedBatch = batches.updateStatus(batchId, failed ? "partially_failed" : "completed");
          if (batch.creativeTaskId)
            tasks.update(batch.creativeTaskId, { status: failed ? "ready" : "review" });
          return completedBatch;
        } catch (error) {
          try { batches.updateStatus(batchId, "interrupted"); } catch { /* 保留首个异常，避免掩盖数据库故障 */ }
          if (batch.creativeTaskId) {
            try { tasks.update(batch.creativeTaskId, { status: "ready" }); } catch { /* best effort */ }
          }
          throw error;
        }
      });
      ipcMain.handle("creation:compile-shot", (_event, shot: ShotContract) =>
        compileShotContract(shot),
      );
      ipcMain.handle(
        "shots:create",
        (_event, input: CreateShotPlanInput) => {
          if (
            !projects.list().some((project) => project.id === input.projectId)
          )
            throw new Error("请先选择一个项目。");
          if (!input.name.trim()) throw new Error("请为镜头填写一个名称。");
          return shots.create({ ...input, name: input.name.trim() });
        },
      );
      ipcMain.handle("shots:list", (_event, projectId: string) =>
        shots.list(projectId),
      );
      ipcMain.handle("learning:ingest-prompt", (_event, prompt: string) => {
        if (typeof prompt !== "string" || !prompt.trim())
          throw new Error("请输入需要学习的提示词。");
        return learning.create(extractPromptPattern(prompt));
      });
      ipcMain.handle("learning:list", () => learning.list());
      ipcMain.handle(
        "learning:import-github-source",
        async (_event, url: string) => {
          const source = promptSources.create({
            ...(await importGitHubPromptSource(url)),
            sourceType: "github",
          });
          learning.create(
            extractPromptPattern(
              `外部提示词库来源：${source.repository}\n${source.summary}\n使用方式：仅作为检索与试用候选；不得自动覆盖角色设定。`,
            ),
          );
          return source;
        },
      );
      ipcMain.handle(
        "learning:import-web-source",
        async (_event, url: string) => {
          const source = promptSources.create(await importWebPromptSource(url));
          learning.create(
            extractPromptPattern(
              `外部公开参考页面：${source.title}\n来源：${source.url}\n页面简介：${source.summary}\n使用方式：页面仅登记为来源；具体提示词须由用户选择后再导入为候选模块，不得自动复制整站内容。`,
            ),
          );
          return source;
        },
      );
      ipcMain.handle("learning:list-sources", () => promptSources.list());
      ipcMain.handle(
        "learning:search-entries",
        (
          _event,
          input: { query?: string; category?: string; limit?: number } = {},
        ) => promptEntries.search(input.query, input.category, input.limit),
      );
      ipcMain.handle("learning:entry-categories", () =>
        promptEntries.categories(),
      );
      ipcMain.handle("learning:entry-count", () => promptEntries.count());
      ipcMain.handle("paradigms:list", () => paradigms.list());
      ipcMain.handle("paradigms:compose", (_event, ids: string[]) =>
        paradigms.compose(Array.isArray(ids) ? ids : []),
      );
      ipcMain.handle(
        "paradigms:create",
        (
          _event,
          input: {
            name: string;
            role: import("../src/shared/types").VisualParadigmRole;
            description: string;
            promptModule: string;
          },
        ) => {
          if (
            !input.name?.trim() ||
            !input.description?.trim() ||
            !input.promptModule?.trim()
          )
            throw new Error("请填写范式名称、它解决的视觉问题和可复用模块。");
          return paradigms.create(input);
        },
      );
      ipcMain.handle(
        "learning:update-status",
        (_event, id: string, status: "validated" | "rejected") => {
          if (status !== "validated" && status !== "rejected")
            throw new Error("学习模式状态不正确。");
          const note =
            status === "validated"
              ? `用户于 ${new Date().toISOString()} 确认此策略可复用。`
              : `用户于 ${new Date().toISOString()} 确认此策略不适合当前创作。`;
          return learning.updateStatus(id, status, note);
        },
      );
      ipcMain.handle("settings:provider-status", () => providerStatus());
      ipcMain.handle("settings:budget-status", () => budgetStatus());
      ipcMain.handle(
        "settings:save-monthly-budget",
        (_event, value: number) => {
          if (!Number.isFinite(value) || value <= 0)
            throw new Error("月度预算必须大于 0。");
          settings.set("monthly_budget_usd", String(value));
          return budgetStatus();
        },
      );
      ipcMain.handle(
        "settings:save-provider-key",
        (_event, providerId: ProviderId, key: string) => {
          if (!["openai", "flux", "fal", "deepseek", "gemini"].includes(providerId))
            throw new Error("不支持的模型提供方。");
          if (typeof key !== "string" || key.trim().length < 20)
            throw new Error("API 密钥格式不正确。");
          if (!cipher?.isAvailable())
            throw new Error("当前系统无法使用本机加密存储。");
          settings.set(`${providerId}_api_key`, cipher.encrypt(key.trim()));
          return providerStatus();
        },
      );
      ipcMain.handle(
        "settings:save-route",
        (_event, capability: ProviderCapability, providerId: ProviderId) => {
          const connection = providerStatus().providers.find(
            (item) => item.id === providerId,
          );
          if (!connection?.capabilities.includes(capability))
            throw new Error("该模型不支持此能力。");
          if (!connection.configured)
            throw new Error("请先保存该模型的 API 密钥，再把它设为能力路由。");
          settings.set(`route_${capability}`, providerId);
          return providerStatus();
        },
      );
      ipcMain.handle("vision:analyze", async (_event, assetId: string) => {
        const asset = assets.findById(assetId);
        if (!asset || !asset.mediaType.startsWith("image/"))
          throw new Error("请选择一张图片资产。");
        if (asset.confirmation !== 'confirmed' || !['authorized', 'original'].includes(asset.rightsStatus))
          throw new Error('图片尚未完成审片和使用权确认，不能外传视觉模型。');
        if (!existsSync(asset.managedPath)) throw new Error('图片文件不存在，请重新导入。');
        const assignedProjects = database.database.prepare('SELECT project_id FROM project_assets WHERE asset_id = ?')
          .all(asset.id) as { project_id: string }[];
        const providerId = routeFor("vision");
        if (providerId !== "openai")
          throw new Error(
            "当前视觉理解适配器仅支持 OpenAI；已保留路由扩展位。",
          );
        const job = jobs.create({
          projectId: assignedProjects[0]?.project_id ?? libraryProject.id,
          kind: "vision_analysis",
          providerId,
          request: { assetId, projectIds: assignedProjects.map((item) => item.project_id) },
        });
        jobs.update(job.id, { status: "in_progress" });
        try {
          const report = await openai.analyzeImage({
            filePath: asset.managedPath,
            mediaType: asset.mediaType,
          });
          assets.mergeMetadata(asset.id, {
            understanding: report,
            understoodAt: new Date().toISOString(),
          });
          return jobs.update(job.id, {
            status: "completed",
            result: { report, assetId },
          });
        } catch (error) {
          jobs.update(job.id, {
            status: isNetworkOutcomeUnknown(error) ? "unknown" : "failed",
            error: error instanceof Error ? error.message : "视觉理解失败。",
          });
          throw error;
        }
      });
      ipcMain.handle(
        "vision:build-reverse-prompt",
        (_event, report: import("../src/shared/types").ImageUnderstandingReport) =>
          buildReversePrompt(report),
      );
      ipcMain.handle(
        "generation:image",
        async (
          _event,
          input: {
            prompt: string;
            negative?: string;
            projectId?: string;
            creativeTaskId?: string;
            generationSessionId?: string;
            retryOfJobId?: string;
            aspectRatio: CreativeCard["aspectRatio"];
            referenceAssetIds?: string[];
            referenceBindings?: ReferenceAssetBinding[];
            qualityTier?: "draft" | "standard" | "premium";
          },
        ) => {
          const size = imageSizeForAspectRatio(input.aspectRatio);
          const session = sessionForGeneration(input.generationSessionId, ["text_to_image", "image_edit"]);
          if (input.referenceAssetIds !== undefined && !Array.isArray(input.referenceAssetIds))
            throw new Error("参考素材列表格式不正确。");
          const referenceSelection = normalizeReferenceBindings(
            input.referenceAssetIds ?? [],
            input.referenceBindings,
          );
          const { referenceAssetIds, referenceBindings } = referenceSelection;
          if (input.creativeTaskId && !tasks.get(input.creativeTaskId))
            throw new Error("关联的创作任务不存在，请重新打开当前任务后再生成。");
          const references = referenceAssetIds.map((id) =>
            referenceForGeneration(id, input.projectId),
          );
          const providerId = routeFor("image");
          if (references.length && !imageEditProviders[providerId])
            throw new Error("当前图片模型不支持参考图编辑，请切换到可用的修图模型。");
          const quality = input.qualityTier === "draft" ? "medium" : "high";
          const job = jobs.create({
            projectId: input.projectId ?? libraryProject.id,
            kind: "image_generation",
            providerId,
            request: {
              prompt: input.prompt,
              negative: input.negative ?? "",
              size,
              requestedAspectRatio: input.aspectRatio,
              actualAspectRatio: size === "1024x1024" ? "1:1" : size === "1024x1536" ? "2:3" : "3:2",
              referenceAssetIds,
              referenceBindings,
              appliedReferenceAssetIds: references.length ? [references[0].id] : [],
              referenceUsage: referenceBindings.map((binding) => ({
                ...binding,
                status: binding.priority === "primary" ? "sent" : "recorded",
              })),
              qualityTier: input.qualityTier ?? "premium",
              creativeTaskId: input.creativeTaskId,
              generationSessionId: session?.id,
              retryOfJobId: input.retryOfJobId,
            },
          });
          if (session) characterWorkspace.updateSessionStatus(session.id, "running");
          jobs.update(job.id, { status: "in_progress" });
          try {
            const generated =
              references.length
                ? await refineWithResult(providerId, {
                    prompt: `${input.prompt}${input.negative ? `\n避免：${input.negative}` : ""}\n参考图仅用于保持人物、服装和构图连续性；只按文字要求变化。`,
                    size,
                    referencePath: references[0].managedPath,
                    referenceMediaType: references[0].mediaType,
                    onRemoteTask: (remoteTask) => jobs.update(job.id, { status: "in_progress", result: { remoteTask, requestedAspectRatio: input.aspectRatio, actualSize: size } }),
                  })
                : await generateWithResult(providerId, {
                    prompt: `${input.prompt}${input.negative ? `\n避免：${input.negative}` : ""}`,
                    size,
                    quality,
                    onRemoteTask: (remoteTask) => jobs.update(job.id, { status: "in_progress", result: { remoteTask, requestedAspectRatio: input.aspectRatio, actualSize: size } }),
                  });
            const asset = writeGeneratedAsset(generated.image, {
              type: "image",
              mediaType: "image/png",
              extension: ".png",
              jobId: job.id,
              projectId: input.projectId,
              sourceAssetIds: references.length ? [references[0].id] : [],
            });
            attachSessionOutput(session, asset.id, references[0]?.id);
            return jobs.update(job.id, {
              status: "completed",
              result: { assetId: asset.id, remoteTask: generated.remoteTask, requestedAspectRatio: input.aspectRatio, actualSize: size },
            });
          } catch (error) {
            const remoteTask = error instanceof FalRemoteTaskError ? error.remoteTask : undefined;
            jobs.update(job.id, {
              status: remoteTask || isNetworkOutcomeUnknown(error) ? "unknown" : "failed",
              ...(remoteTask ? { result: { remoteTask, requestedAspectRatio: input.aspectRatio, actualSize: size } } : {}),
              error: error instanceof Error ? error.message : "图片生成失败。",
            });
            if (session && !remoteTask && !isNetworkOutcomeUnknown(error))
              characterWorkspace.updateSessionStatus(session.id, "failed");
            throw error;
          }
        },
      );
      ipcMain.handle(
        "generation:refine-image",
        async (
          _event,
          input: {
            assetId: string;
            prompt: string;
            negative?: string;
            projectId?: string;
            aspectRatio: CreativeCard["aspectRatio"];
            creativeTaskId?: string;
            generationSessionId?: string;
            retryOfJobId?: string;
          },
        ) => {
          const reference = referenceForGeneration(input.assetId, input.projectId);
          const session = sessionForGeneration(input.generationSessionId, ["image_edit"]);
          if (!input.prompt.trim()) throw new Error("请描述本次只要优化什么。");
          const size = imageSizeForAspectRatio(input.aspectRatio);
          const providerId = routeFor("image_edit");
          if (!imageEditProviders[providerId])
            throw new Error("当前高保真修图模型尚未安装适配器。");
          const job = jobs.create({
            projectId: input.projectId ?? libraryProject.id,
            kind: "image_generation",
            providerId,
            request: {
              prompt: input.prompt,
              negative: input.negative ?? "",
              size,
              requestedAspectRatio: input.aspectRatio,
              actualAspectRatio: size === "1024x1024" ? "1:1" : size === "1024x1536" ? "2:3" : "3:2",
              referenceAssetId: reference.id,
              mode: "refine",
              creativeTaskId: input.creativeTaskId,
              generationSessionId: session?.id,
              retryOfJobId: input.retryOfJobId,
            },
          });
          if (session) characterWorkspace.updateSessionStatus(session.id, "running");
          jobs.update(job.id, { status: "in_progress" });
          try {
            const generated = await refineWithResult(providerId, {
              prompt: `${input.prompt}${input.negative ? `\n避免：${input.negative}` : ""}`,
              size,
              referencePath: reference.managedPath,
              referenceMediaType: reference.mediaType,
              onRemoteTask: (remoteTask) => jobs.update(job.id, { status: "in_progress", result: { remoteTask, requestedAspectRatio: input.aspectRatio, actualSize: size } }),
            });
            const asset = writeGeneratedAsset(generated.image, {
              type: "image",
              mediaType: "image/png",
              extension: ".png",
              jobId: job.id,
              projectId: input.projectId,
              sourceAssetIds: [reference.id],
            });
            attachSessionOutput(session, asset.id, reference.id);
            return jobs.update(job.id, {
              status: "completed",
              result: { assetId: asset.id, remoteTask: generated.remoteTask, requestedAspectRatio: input.aspectRatio, actualSize: size },
            });
          } catch (error) {
            const remoteTask = error instanceof FalRemoteTaskError ? error.remoteTask : undefined;
            jobs.update(job.id, {
              status: remoteTask || isNetworkOutcomeUnknown(error) ? "unknown" : "failed",
              ...(remoteTask ? { result: { remoteTask, requestedAspectRatio: input.aspectRatio, actualSize: size } } : {}),
              error: error instanceof Error ? error.message : "图片修订失败。",
            });
            if (session && !remoteTask && !isNetworkOutcomeUnknown(error))
              characterWorkspace.updateSessionStatus(session.id, "failed");
            throw error;
          }
        },
      );
      ipcMain.handle(
        "generation:video",
        async (
          _event,
          input: {
            prompt: string;
            projectId?: string;
            referenceAssetId?: string;
            generationSessionId?: string;
            aspectRatio: CreativeCard["aspectRatio"];
            seconds: 4 | 8 | 12;
          },
        ) => {
          const reference = input.referenceAssetId !== undefined
            ? referenceForGeneration(input.referenceAssetId, input.projectId)
            : undefined;
          const session = sessionForGeneration(input.generationSessionId, ["text_to_video", "image_to_video", "video_extend", "talking"]);
          const size = input.aspectRatio === "9:16" ? "720x1280" : "1280x720";
          const providerId = routeFor("video");
          const videoProvider = videoProviderFor(providerId);
          const job = jobs.create({
            projectId: input.projectId ?? libraryProject.id,
            kind: "image_to_video",
            providerId,
            status: "in_progress",
            request: {
              prompt: input.prompt,
              referenceAssetId: reference?.id,
              generationSessionId: session?.id,
              size,
              seconds: input.seconds,
              submissionState: "submitting",
            },
          });
          if (session) characterWorkspace.updateSessionStatus(session.id, "running");
          try {
            const remote = await videoProvider.createVideo({
              prompt: input.prompt,
              model: "sora-2-pro",
              size,
              seconds: input.seconds,
              referencePath: reference?.managedPath,
              referenceMediaType: reference?.mediaType,
            });
            if (!remote || typeof remote.id !== "string" || !remote.id.trim()) {
              const message = "视频提交响应缺少有效远程编号，无法确认服务端是否已接收；禁止盲目重试。";
              jobs.update(job.id, { status: "unknown", error: message });
              throw new Error(message);
            }
            return jobs.update(job.id, {
              status:
                remote.status === "completed" ? "completed" : "in_progress",
              result: { remoteId: remote.id, progress: remote.progress ?? 0 },
              error: null,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : "视频任务创建失败。";
            jobs.update(job.id, {
              status: isNetworkOutcomeUnknown(error) || /禁止盲目重试/.test(message) ? "unknown" : "failed",
              error: message,
            });
            if (session && !isNetworkOutcomeUnknown(error) && !/禁止盲目重试/.test(message))
              characterWorkspace.updateSessionStatus(session.id, "failed");
            throw error;
          }
        },
      );
      ipcMain.handle("generation:poll-image", async (_event, jobId: string) => {
        const job = jobs.get(jobId);
        if (job?.status === "completed" && typeof job.result?.assetId === "string") return job;
        const remoteTask = job ? remoteTaskFromJob(job) : undefined;
        if (!job || job.kind !== "image_generation" || job.providerId !== "fal" || !remoteTask)
          throw new Error("图片任务不存在或尚未获得可查询的远程编号。");
        try {
          const image = await fal.pollImage(remoteTask);
          const referenceIds = Array.isArray(job.request.referenceAssetIds)
            ? job.request.referenceAssetIds.filter((value): value is string => typeof value === "string")
            : typeof job.request.referenceAssetId === "string" ? [job.request.referenceAssetId] : [];
          const asset = writeGeneratedAsset(image, {
            type: "image",
            mediaType: "image/png",
            extension: ".png",
            jobId: job.id,
            projectId: job.projectId,
            sourceAssetIds: referenceIds.length ? [referenceIds[0]] : [],
          });
          const sessionId = typeof job.request.generationSessionId === "string"
            ? job.request.generationSessionId
            : undefined;
          const session = sessionId ? characterWorkspace.getSession(sessionId) : undefined;
          attachSessionOutput(session, asset.id, referenceIds[0]);
          return jobs.update(job.id, {
            status: "completed",
            result: { ...(job.result ?? {}), remoteTask, assetId: asset.id },
            error: null,
          });
        } catch (error) {
          const nextRemoteTask = error instanceof FalRemoteTaskError ? error.remoteTask : remoteTask;
          return jobs.update(job.id, {
            status: error instanceof FalRemoteTaskError ? "unknown" : "failed",
            result: { ...(job.result ?? {}), remoteTask: nextRemoteTask },
            error: error instanceof Error ? error.message : "图片状态查询失败。",
          });
        }
      });
      ipcMain.handle("generation:poll-video", async (_event, jobId: string) => {
        const job = jobs.get(jobId);
        if (job?.status === "completed" && typeof job.result?.assetId === "string")
          return job;
        const remoteId = job?.result?.remoteId;
        if (
          !job ||
          job.kind !== "image_to_video" ||
          typeof remoteId !== "string"
        )
          throw new Error("视频任务不存在或尚未获得远程编号。");
        try {
          const videoProvider = videoProviderFor(job.providerId as ProviderId);
          const remote = await videoProvider.getVideo(remoteId);
          if (remote.status === "completed") {
            const video = await videoProvider.downloadVideo(remoteId);
            const sourceAssetId =
              typeof job.request.referenceAssetId === "string"
                ? job.request.referenceAssetId
                : undefined;
            const asset = writeGeneratedAsset(video, {
              type: "video",
              mediaType: "video/mp4",
              extension: ".mp4",
              jobId: job.id,
              projectId: job.projectId,
              sourceAssetIds: sourceAssetId ? [sourceAssetId] : [],
            });
            const sessionId = typeof job.request.generationSessionId === "string"
              ? job.request.generationSessionId
              : undefined;
            const session = sessionId ? characterWorkspace.getSession(sessionId) : undefined;
            attachSessionOutput(session, asset.id, sourceAssetId);
            return jobs.update(job.id, {
              status: "completed",
              result: { remoteId, progress: 100, assetId: asset.id },
            });
          }
          if (remote.status === "failed")
            return jobs.update(job.id, {
              status: "failed",
              error: remote.error?.message ?? "远程视频生成失败。",
            });
          return jobs.update(job.id, {
            status: "in_progress",
            result: { remoteId, progress: remote.progress ?? 0 },
            error: null,
          });
        } catch (error) {
          return jobs.update(job.id, {
            // 轮询失败不等于远程任务失败；保留 remoteId 与 unknown，避免把查询错误变成可盲重试的普通失败。
            status: "unknown",
            error:
              error instanceof Error ? error.message : "视频状态查询失败。",
          });
        }
      });
      ipcMain.handle("jobs:list", (_event, projectId?: string) =>
        jobs.list(projectId),
      );
    },
    close() {
      if (!databaseClosedForRestore) database.close();
    },
  };
};
