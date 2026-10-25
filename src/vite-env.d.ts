/// <reference types="vite/client" />

interface Window {
  studio: {
    getHealth: () => Promise<{ appDataDir: string; databaseReady: boolean }>;
    selectFiles: () => Promise<string[]>;
    selectCharacterPack: () => Promise<string | undefined>;
    selectDirectory: () => Promise<string | undefined>;
    assets: {
      import: (input: {
        filePath: string;
        type?: import("./shared/types").AssetType;
        projectId?: string;
        rightsStatus: import("./shared/types").RightsStatus;
        rightsReason?: string;
        secondaryCategory?: string;
      }) => Promise<unknown>;
      list: (query?: {
        type?: import("./shared/types").AssetType;
        projectId?: string;
        q?: string;
      }) => Promise<import("./shared/types").Asset[]>;
      usage: (assetId: string) => Promise<import("./shared/types").AssetUsageReference[]>;
      preview: (assetId: string) => Promise<string | undefined>;
      lineage: (
        assetId: string,
      ) => Promise<import("./shared/types").AssetLineageItem[]>;
      updateConfirmation: (
        assetId: string,
        confirmation: import("./shared/types").ConfirmationStatus,
      ) => Promise<import("./shared/types").Asset>;
      updateRights: (assetId: string, rightsStatus: import("./shared/types").RightsStatus, reason: string) => Promise<import("./shared/types").Asset>;
      setMaster: (assetId: string, enabled: boolean, projectId?: string) => Promise<import("./shared/types").Asset>;
      review: (
        assetId: string,
        review: Omit<import("./shared/types").AssetReview, "reviewedAt">,
      ) => Promise<import("./shared/types").Asset>;
    };
    imageReviews: {
      workspace: (projectId: string) => Promise<import("./shared/types").ReviewWorkspaceSnapshot>;
      create: (input: {
        projectId: string;
        assetId: string;
        decision: import("./shared/types").ImageReviewDecision;
        scores: import("./shared/types").ImageReviewScores;
        note?: string;
        nextAction?: string;
        creativeTaskId?: string;
        generationSessionId?: string;
      }) => Promise<import("./shared/types").ImageReviewRecord>;
      promote: (input: {
        reviewId: string;
        targetType: import("./shared/types").MasterPromotionTarget;
        targetId?: string;
        versionId?: string;
        stateId?: string;
      }) => Promise<import("./shared/types").MasterPromotion>;
    };
    collections: {
      create: (input: {
        projectId?: string;
        characterProfileId?: string;
        parentId?: string;
        kind: import("./shared/types").AssetCollectionKind;
        name: string;
        description?: string;
        status?: import("./shared/types").AssetCollectionStatus;
      }) => Promise<import("./shared/types").AssetCollection>;
      list: (projectId?: string) => Promise<import("./shared/types").AssetCollection[]>;
      detail: (id: string) => Promise<import("./shared/types").AssetCollectionDetail | undefined>;
      update: (id: string, patch: Partial<Pick<import("./shared/types").AssetCollection, "name" | "description" | "status" | "parentId">>) => Promise<import("./shared/types").AssetCollection>;
      attachAsset: (collectionId: string, assetId: string, role?: string, moduleKey?: string, notes?: string) => Promise<import("./shared/types").AssetCollectionDetail>;
      detachAsset: (collectionId: string, assetId: string) => Promise<import("./shared/types").AssetCollectionDetail>;
    };
    projects: {
      create: (
        name: string,
        medium: import("./shared/types").ProjectMedium,
      ) => Promise<import("./shared/types").Project>;
      list: () => Promise<import("./shared/types").Project[]>;
      workspace: (projectId: string) => Promise<import("./shared/types").ProjectWorkspace>;
      updateBrief: (
        projectId: string,
        brief: import("./shared/types").ProjectBrief,
      ) => Promise<import("./shared/types").Project>;
      export: (
        projectId: string,
        destinationDirectory: string,
      ) => Promise<string>;
    };
    data: {
      createBackup: (destinationDirectory: string) => Promise<string>;
      restoreBackup: (backupDirectory: string) => Promise<{ recoveryDirectory: string }>;
    };
    recipes: {
      create: (input: Pick<import("./shared/types").CreativeRecipe, "name" | "projectId" | "creativeTaskId" | "providerId" | "purpose" | "applicability" | "invalidationConditions" | "card" | "prompt" | "negative" | "sourceAssetIds">) => Promise<import("./shared/types").CreativeRecipe>;
      list: (projectId?: string) => Promise<import("./shared/types").CreativeRecipe[]>;
      updateStatus: (id: string, status: "validated" | "rejected", evidence: string) => Promise<import("./shared/types").CreativeRecipe>;
    };
    creation: {
      compilePrompt: (
        card: import("./shared/types").CreativeCard,
      ) => Promise<import("./shared/types").PromptBuild>;
      enrichCard: (
        card: import("./shared/types").CreativeCard,
      ) => Promise<import("./shared/types").CreativeCardSuggestion>;
      translatePrompt: (input: {
        prompt: string;
        negative?: string;
        providerId: "openai" | "flux" | "fal" | "gemini";
        qualityTier: import("./shared/types").GenerationQualityTier;
      }) => Promise<import("./shared/types").PromptTranslation>;
      compileShot: (
        shot: import("./shared/types").ShotContract,
      ) => Promise<string>;
    };
    characters: {
      create: (input: {
        name: string;
        card: import("./shared/types").CreativeCard;
        projectId?: string;
        masterAssetId?: string;
        group?: import("./shared/types").CharacterGroup;
        lifecycle?: import("./shared/types").CharacterLifecycle;
      }) => Promise<import("./shared/types").CharacterProfile>;
      list: (
        projectId?: string,
      ) => Promise<import("./shared/types").CharacterProfile[]>;
      detail: (id: string) => Promise<import("./shared/types").CharacterDetail | undefined>;
      importAssetPack: (input: { zipPath: string; projectId?: string; name?: string; rightsStatus?: import("./shared/types").RightsStatus; rightsReason?: string }) => Promise<import("./shared/types").CharacterAssetPackImportResult>;
      createVariant: (id: string, kind: import("./shared/types").CharacterVariantKind, name: string) => Promise<import("./shared/types").CharacterVariant>;
      upsertFact: (id: string, input: import("./shared/types").CharacterFactInput) => Promise<import("./shared/types").CharacterDetail>;
      update: (
        id: string,
        patch: Partial<
          Pick<
            import("./shared/types").CharacterProfile,
            "name" | "group" | "lifecycle" | "masterAssetId" | "card" | "specification"
          >
        >,
      ) => Promise<import("./shared/types").CharacterProfile>;
    };
    characterWorkspace: {
      get: (profileId: string) => Promise<import("./shared/types").CharacterWorkspaceSnapshot>;
      createVersion: (
        profileId: string,
        input?: {
          label?: string;
          status?: import("./shared/types").CharacterVersionStatus;
          changeSummary?: string;
        },
      ) => Promise<import("./shared/types").CharacterVersion>;
      createState: (
        profileId: string,
        input: {
          versionId?: string;
          name: string;
          kind: import("./shared/types").CharacterStateKind;
          status?: import("./shared/types").CharacterStateStatus;
          wardrobe?: string;
          hair?: string;
          expression?: string;
          pose?: string;
          scene?: string;
          emotion?: string;
          continuityNotes?: string;
          trackers?: import("./shared/types").CharacterStateTracker[];
        },
      ) => Promise<import("./shared/types").CharacterState>;
      updateState: (
        id: string,
        patch: Partial<Pick<import("./shared/types").CharacterState,
          "name" | "kind" | "status" | "versionId" | "wardrobe" | "hair" | "expression" |
          "pose" | "scene" | "emotion" | "continuityNotes" | "trackers"
        >>,
      ) => Promise<import("./shared/types").CharacterState>;
      createSession: (
        input: Omit<import("./shared/types").GenerationSession, "id" | "createdAt" | "updatedAt" | "status"> & {
          status?: import("./shared/types").GenerationSessionStatus;
        },
      ) => Promise<import("./shared/types").GenerationSession>;
      updateSessionStatus: (
        id: string,
        status: import("./shared/types").GenerationSessionStatus,
      ) => Promise<import("./shared/types").GenerationSession>;
      attachMedia: (
        profileId: string,
        input: Omit<import("./shared/types").CharacterMediaLink, "id" | "profileId" | "createdAt">,
      ) => Promise<import("./shared/types").CharacterMediaLink>;
    };
    sceneWorkspace: {
      create: (input: {
        projectId?: string;
        name: string;
        kind: import("./shared/types").SceneKind;
        lifecycle?: import("./shared/types").SceneLifecycle;
        anchor: string;
        layout?: string;
        materials?: string;
        colorSystem?: string;
        requiredElements?: string;
        forbiddenChanges?: string;
        masterAssetId?: string;
      }) => Promise<import("./shared/types").SceneProfile>;
      list: (projectId?: string) => Promise<import("./shared/types").SceneProfile[]>;
      update: (id: string, patch: Partial<Omit<import("./shared/types").SceneProfile, "id" | "createdAt" | "updatedAt">>) => Promise<import("./shared/types").SceneProfile>;
      get: (profileId: string) => Promise<import("./shared/types").SceneWorkspaceSnapshot>;
      createVersion: (profileId: string, input?: { label?: string; status?: import("./shared/types").SceneVersionStatus; changeSummary?: string }) => Promise<import("./shared/types").SceneVersion>;
      createState: (profileId: string, input: {
        versionId?: string; name: string; status?: import("./shared/types").SceneStateStatus;
        timeOfDay?: string; weather?: string; season?: string; lighting?: string; atmosphere?: string;
        setDressing?: string; continuityNotes?: string;
      }) => Promise<import("./shared/types").SceneState>;
      updateState: (id: string, patch: Partial<Pick<import("./shared/types").SceneState,
        "versionId" | "name" | "status" | "timeOfDay" | "weather" | "season" | "lighting" | "atmosphere" | "setDressing" | "continuityNotes"
      >>) => Promise<import("./shared/types").SceneState>;
      attachMedia: (profileId: string, input: Omit<import("./shared/types").SceneMediaLink, "id" | "profileId" | "createdAt">) => Promise<import("./shared/types").SceneMediaLink>;
    };
    tasks: {
      create: (input: Pick<import("./shared/types").CreativeTask, "projectId" | "characterProfileId" | "name" | "objective" | "collectionIds" | "card">) => Promise<import("./shared/types").CreativeTask>;
      list: (projectId?: string) => Promise<import("./shared/types").CreativeTask[]>;
      update: (id: string, patch: Partial<Pick<import("./shared/types").CreativeTask, "characterProfileId" | "name" | "objective" | "status" | "collectionIds" | "card" | "resultAssetId">>) => Promise<import("./shared/types").CreativeTask>;
    };
    batches: {
      create: (input: {
        name: string;
        projectId?: string;
        creativeTaskId?: string;
        aspectRatio: import("./shared/types").CreativeCard["aspectRatio"];
        referenceAssetIds?: string[];
        referenceBindings?: import("./shared/types").ReferenceAssetBinding[];
        variants: Array<{ label: string; prompt: string }>;
      }) => Promise<import("./shared/types").GenerationBatch>;
      list: (
        projectId?: string,
      ) => Promise<import("./shared/types").GenerationBatch[]>;
      run: (
        batchId: string,
      ) => Promise<import("./shared/types").GenerationBatch>;
    };
    shots: {
      create: (input: {
        projectId: string;
        name: string;
        shot: import("./shared/types").ShotContract;
        compiledPrompt: string;
        referenceAssetId?: string;
        purpose?: import("./shared/types").ShotPlan["purpose"];
        status?: import("./shared/types").ShotPlan["status"];
        creativeTaskId?: string;
        characterProfileId?: string;
        characterVersionId?: string;
        characterStateId?: string;
        sceneProfileId?: string;
        sceneVersionId?: string;
        sceneStateId?: string;
        continuityNotes?: string;
      }) => Promise<import("./shared/types").ShotPlan>;
      list: (projectId: string) => Promise<import("./shared/types").ShotPlan[]>;
    };
    learning: {
      ingestPrompt: (
        prompt: string,
      ) => Promise<import("./shared/types").LearningPattern>;
      list: () => Promise<import("./shared/types").LearningPattern[]>;
      updateStatus: (
        id: string,
        status: "validated" | "rejected",
      ) => Promise<import("./shared/types").LearningPattern>;
      importGitHubSource: (
        url: string,
      ) => Promise<import("./shared/types").PromptSource>;
      importWebSource: (
        url: string,
      ) => Promise<import("./shared/types").PromptSource>;
      listSources: () => Promise<import("./shared/types").PromptSource[]>;
      searchEntries: (input?: {
        query?: string;
        category?: string;
        limit?: number;
      }) => Promise<import("./shared/types").PromptEntry[]>;
      entryCategories: () => Promise<string[]>;
      entryCount: () => Promise<number>;
    };
    paradigms: {
      list: () => Promise<import("./shared/types").VisualParadigm[]>;
      compose: (
        ids: string[],
      ) => Promise<import("./shared/types").ParadigmComposition>;
      create: (
        input: Pick<
          import("./shared/types").VisualParadigm,
          "name" | "role" | "description" | "promptModule"
        >,
      ) => Promise<import("./shared/types").VisualParadigm>;
    };
    settings: {
      providerStatus: () => Promise<import("./shared/types").ProviderStatus>;
      verifyProvider: (providerId: import("./shared/types").ProviderId) => Promise<import("./shared/types").ProviderVerificationResult>;
      budgetStatus: () => Promise<import("./shared/types").BudgetStatus>;
      saveMonthlyBudget: (
        value: number,
      ) => Promise<import("./shared/types").BudgetStatus>;
      saveProviderKey: (
        providerId: import("./shared/types").ProviderId,
        key: string,
      ) => Promise<import("./shared/types").ProviderStatus>;
      saveRoute: (
        capability: import("./shared/types").ProviderCapability,
        providerId: import("./shared/types").ProviderId,
      ) => Promise<import("./shared/types").ProviderStatus>;
    };
    vision: {
      analyze: (assetId: string) => Promise<import("./shared/types").StudioJob>;
      buildReversePrompt: (
        report: import("./shared/types").ImageUnderstandingReport,
      ) => Promise<import("./shared/types").ReversePrompt>;
    };
    generation: {
      image: (input: {
        prompt: string;
        negative?: string;
        projectId?: string;
        creativeTaskId?: string;
        generationSessionId?: string;
        retryOfJobId?: string;
        aspectRatio: import("./shared/types").CreativeCard["aspectRatio"];
        referenceAssetIds?: string[];
        referenceBindings?: import("./shared/types").ReferenceAssetBinding[];
        qualityTier?: import("./shared/types").GenerationQualityTier;
        candidateLabel?: string;
        candidateIndex?: number;
        candidateCount?: number;
        deliveryMode?: import("./shared/types").CreativeDeliveryMode;
      }) => Promise<import("./shared/types").StudioJob>;
      refineImage: (input: {
        assetId: string;
        prompt: string;
        negative?: string;
        projectId?: string;
        creativeTaskId?: string;
        generationSessionId?: string;
        retryOfJobId?: string;
        aspectRatio: import("./shared/types").CreativeCard["aspectRatio"];
      }) => Promise<import("./shared/types").StudioJob>;
      video: (input: {
        prompt: string;
        projectId?: string;
        referenceAssetId?: string;
        generationSessionId?: string;
        aspectRatio: import("./shared/types").CreativeCard["aspectRatio"];
        seconds: 4 | 8 | 12;
      }) => Promise<import("./shared/types").StudioJob>;
      pollVideo: (jobId: string) => Promise<import("./shared/types").StudioJob>;
      pollImage?: (jobId: string) => Promise<import("./shared/types").StudioJob>;
      jobs: (
        projectId?: string,
      ) => Promise<import("./shared/types").StudioJob[]>;
    };
  };
}
