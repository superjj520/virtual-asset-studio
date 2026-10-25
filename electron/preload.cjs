const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("studio", {
  getHealth: () => ipcRenderer.invoke("studio:health"),
  selectFiles: () => ipcRenderer.invoke("dialog:select-files"),
  selectCharacterPack: () => ipcRenderer.invoke("dialog:select-character-pack"),
  selectDirectory: () => ipcRenderer.invoke("dialog:select-directory"),
  assets: {
    import: (input) => ipcRenderer.invoke("assets:import", input),
    list: (query) => ipcRenderer.invoke("assets:list", query),
    usage: (assetId) => ipcRenderer.invoke("assets:usage", assetId),
    preview: (assetId) => ipcRenderer.invoke("assets:preview", assetId),
    lineage: (assetId) => ipcRenderer.invoke("assets:lineage", assetId),
    updateConfirmation: (assetId, confirmation) =>
      ipcRenderer.invoke("assets:update-confirmation", assetId, confirmation),
    updateRights: (assetId, rightsStatus, reason) =>
      ipcRenderer.invoke("assets:update-rights", assetId, rightsStatus, reason),
    setMaster: (assetId, enabled, projectId) =>
      ipcRenderer.invoke("assets:set-master", assetId, enabled, projectId),
    review: (assetId, review) =>
      ipcRenderer.invoke("assets:review", assetId, review),
  },
  imageReviews: {
    workspace: (projectId) => ipcRenderer.invoke("image-reviews:workspace", projectId),
    create: (input) => ipcRenderer.invoke("image-reviews:create", input),
    promote: (input) => ipcRenderer.invoke("image-reviews:promote", input),
  },
  collections: {
    create: (input) => ipcRenderer.invoke("collections:create", input),
    list: (projectId) => ipcRenderer.invoke("collections:list", projectId),
    detail: (id) => ipcRenderer.invoke("collections:detail", id),
    update: (id, patch) => ipcRenderer.invoke("collections:update", id, patch),
    attachAsset: (collectionId, assetId, role, moduleKey, notes) => ipcRenderer.invoke("collections:attach-asset", collectionId, assetId, role, moduleKey, notes),
    detachAsset: (collectionId, assetId) => ipcRenderer.invoke("collections:detach-asset", collectionId, assetId),
  },
  projects: {
    create: (name, medium) =>
      ipcRenderer.invoke("projects:create", name, medium),
    list: () => ipcRenderer.invoke("projects:list"),
    workspace: (projectId) => ipcRenderer.invoke("projects:workspace", projectId),
    updateBrief: (projectId, brief) =>
      ipcRenderer.invoke("projects:update-brief", projectId, brief),
    export: (projectId, destinationDirectory) =>
      ipcRenderer.invoke("projects:export", projectId, destinationDirectory),
  },
  data: {
    createBackup: (destinationDirectory) => ipcRenderer.invoke("data:create-backup", destinationDirectory),
    restoreBackup: (backupDirectory) => ipcRenderer.invoke("data:restore-backup", backupDirectory),
  },
  recipes: {
    create: (input) => ipcRenderer.invoke("recipes:create", input),
    list: (projectId) => ipcRenderer.invoke("recipes:list", projectId),
    updateStatus: (id, status, evidence) =>
      ipcRenderer.invoke("recipes:update-status", id, status, evidence),
  },
  creation: {
    compilePrompt: (card) =>
      ipcRenderer.invoke("creation:compile-prompt", card),
    enrichCard: (card) => ipcRenderer.invoke("creation:enrich-card", card),
    translatePrompt: (input) =>
      ipcRenderer.invoke("creation:translate-prompt", input),
    compileShot: (shot) => ipcRenderer.invoke("creation:compile-shot", shot),
  },
  characters: {
    create: (input) => ipcRenderer.invoke("characters:create", input),
    list: (projectId) => ipcRenderer.invoke("characters:list", projectId),
    detail: (id) => ipcRenderer.invoke("characters:detail", id),
    importAssetPack: (input) => ipcRenderer.invoke("characters:import-asset-pack", input),
    createVariant: (id, kind, name) => ipcRenderer.invoke("characters:create-variant", id, kind, name),
    upsertFact: (id, input) => ipcRenderer.invoke("characters:upsert-fact", id, input),
    update: (id, patch) => ipcRenderer.invoke("characters:update", id, patch),
  },
  characterWorkspace: {
    get: (profileId) => ipcRenderer.invoke("character-workspace:get", profileId),
    createVersion: (profileId, input) => ipcRenderer.invoke("character-versions:create", profileId, input),
    createState: (profileId, input) => ipcRenderer.invoke("character-states:create", profileId, input),
    updateState: (id, patch) => ipcRenderer.invoke("character-states:update", id, patch),
    createSession: (input) => ipcRenderer.invoke("generation-sessions:create", input),
    updateSessionStatus: (id, status) => ipcRenderer.invoke("generation-sessions:update-status", id, status),
    attachMedia: (profileId, input) => ipcRenderer.invoke("character-media:attach", profileId, input),
  },
  sceneWorkspace: {
    create: (input) => ipcRenderer.invoke("scenes:create", input),
    list: (projectId) => ipcRenderer.invoke("scenes:list", projectId),
    update: (id, patch) => ipcRenderer.invoke("scenes:update", id, patch),
    get: (profileId) => ipcRenderer.invoke("scene-workspace:get", profileId),
    createVersion: (profileId, input) => ipcRenderer.invoke("scene-versions:create", profileId, input),
    createState: (profileId, input) => ipcRenderer.invoke("scene-states:create", profileId, input),
    updateState: (id, patch) => ipcRenderer.invoke("scene-states:update", id, patch),
    attachMedia: (profileId, input) => ipcRenderer.invoke("scene-media:attach", profileId, input),
  },
  tasks: {
    create: (input) => ipcRenderer.invoke("tasks:create", input),
    list: (projectId) => ipcRenderer.invoke("tasks:list", projectId),
    update: (id, patch) => ipcRenderer.invoke("tasks:update", id, patch),
  },
  batches: {
    create: (input) => ipcRenderer.invoke("batches:create", input),
    list: (projectId) => ipcRenderer.invoke("batches:list", projectId),
    run: (batchId) => ipcRenderer.invoke("batches:run", batchId),
  },
  shots: {
    create: (input) => ipcRenderer.invoke("shots:create", input),
    list: (projectId) => ipcRenderer.invoke("shots:list", projectId),
  },
  learning: {
    ingestPrompt: (prompt) =>
      ipcRenderer.invoke("learning:ingest-prompt", prompt),
    list: () => ipcRenderer.invoke("learning:list"),
    updateStatus: (id, status) =>
      ipcRenderer.invoke("learning:update-status", id, status),
    importGitHubSource: (url) =>
      ipcRenderer.invoke("learning:import-github-source", url),
    importWebSource: (url) =>
      ipcRenderer.invoke("learning:import-web-source", url),
    listSources: () => ipcRenderer.invoke("learning:list-sources"),
    searchEntries: (input) =>
      ipcRenderer.invoke("learning:search-entries", input),
    entryCategories: () => ipcRenderer.invoke("learning:entry-categories"),
    entryCount: () => ipcRenderer.invoke("learning:entry-count"),
  },
  paradigms: {
    list: () => ipcRenderer.invoke("paradigms:list"),
    compose: (ids) => ipcRenderer.invoke("paradigms:compose", ids),
    create: (input) => ipcRenderer.invoke("paradigms:create", input),
  },
  settings: {
    providerStatus: () => ipcRenderer.invoke("settings:provider-status"),
    verifyProvider: (providerId) =>
      ipcRenderer.invoke("settings:verify-provider", providerId),
    budgetStatus: () => ipcRenderer.invoke("settings:budget-status"),
    saveMonthlyBudget: (value) =>
      ipcRenderer.invoke("settings:save-monthly-budget", value),
    saveProviderKey: (providerId, key) =>
      ipcRenderer.invoke("settings:save-provider-key", providerId, key),
    saveRoute: (capability, providerId) =>
      ipcRenderer.invoke("settings:save-route", capability, providerId),
  },
  vision: {
    analyze: (assetId) => ipcRenderer.invoke("vision:analyze", assetId),
    buildReversePrompt: (report) =>
      ipcRenderer.invoke("vision:build-reverse-prompt", report),
  },
  generation: {
    image: (input) => ipcRenderer.invoke("generation:image", input),
    refineImage: (input) =>
      ipcRenderer.invoke("generation:refine-image", input),
    video: (input) => ipcRenderer.invoke("generation:video", input),
    pollImage: (jobId) => ipcRenderer.invoke("generation:poll-image", jobId),
    pollVideo: (jobId) => ipcRenderer.invoke("generation:poll-video", jobId),
    jobs: (projectId) => ipcRenderer.invoke("jobs:list", projectId),
  },
});
