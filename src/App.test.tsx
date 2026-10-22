import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App, { assetCollectionRole } from './App';

beforeEach(() => {
  window.studio = {
    getHealth: vi.fn().mockResolvedValue({ appDataDir: '/tmp/studio', databaseReady: false }),
    selectFiles: vi.fn().mockResolvedValue([]),
    selectCharacterPack: vi.fn().mockResolvedValue(undefined),
    selectDirectory: vi.fn(),
    assets: {
      import: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      preview: vi.fn(),
      lineage: vi.fn().mockResolvedValue([]),
      updateConfirmation: vi.fn(),
      updateRights: vi.fn(),
      setMaster: vi.fn(),
      review: vi.fn(),
    },
    imageReviews: { workspace: vi.fn().mockResolvedValue({ projectId: "", candidates: [], reviews: [], promotions: [] }), create: vi.fn(), promote: vi.fn() },
    collections: { create: vi.fn(), list: vi.fn().mockResolvedValue([]), detail: vi.fn(), update: vi.fn(), attachAsset: vi.fn(), detachAsset: vi.fn() },
    projects: {
      create: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      workspace: vi.fn(),
      updateBrief: vi.fn(),
      export: vi.fn(),
    },
    data: { createBackup: vi.fn(), restoreBackup: vi.fn() },
    recipes: { create: vi.fn(), list: vi.fn().mockResolvedValue([]), updateStatus: vi.fn() },
    creation: { compilePrompt: vi.fn(), enrichCard: vi.fn(), translatePrompt: vi.fn(), compileShot: vi.fn() },
    characters: { create: vi.fn(), list: vi.fn().mockResolvedValue([]), detail: vi.fn(), importAssetPack: vi.fn(), createVariant: vi.fn(), upsertFact: vi.fn(), update: vi.fn() },
    characterWorkspace: {
      get: vi.fn().mockResolvedValue(undefined),
      createVersion: vi.fn(),
      createState: vi.fn(),
      updateState: vi.fn(),
      createSession: vi.fn(),
      updateSessionStatus: vi.fn(),
      attachMedia: vi.fn().mockResolvedValue(undefined),
    },
    sceneWorkspace: {
      create: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      get: vi.fn().mockResolvedValue(undefined),
      createVersion: vi.fn(),
      createState: vi.fn(),
      updateState: vi.fn(),
      attachMedia: vi.fn(),
    },
    tasks: { create: vi.fn(), list: vi.fn().mockResolvedValue([]), update: vi.fn() },
    batches: { create: vi.fn(), list: vi.fn().mockResolvedValue([]), run: vi.fn() },
    shots: { create: vi.fn(), list: vi.fn().mockResolvedValue([]) },
    learning: { ingestPrompt: vi.fn(), list: vi.fn().mockResolvedValue([]), importGitHubSource: vi.fn(), importWebSource: vi.fn(), listSources: vi.fn().mockResolvedValue([]), searchEntries: vi.fn().mockResolvedValue([]), entryCategories: vi.fn().mockResolvedValue([]), entryCount: vi.fn().mockResolvedValue(0), updateStatus: vi.fn() },
    paradigms: { list: vi.fn().mockResolvedValue([]), compose: vi.fn().mockResolvedValue({ paradigms: [], acceptance: '', promptModule: '', warnings: [], canApply: false }), create: vi.fn() },
    settings: { providerStatus: vi.fn().mockResolvedValue({ providers: [{ id: 'openai', configured: false, capabilities: ['vision', 'image', 'image_edit', 'video'] }, { id: 'flux', configured: false, capabilities: ['image'] }, { id: 'deepseek', configured: false, capabilities: ['text'] }], routes: { vision: 'openai', image: 'openai', image_edit: 'openai', video: 'openai', text: 'deepseek' } }), budgetStatus: vi.fn().mockResolvedValue({ plannedSpendUsd: 0 }), saveMonthlyBudget: vi.fn(), saveProviderKey: vi.fn(), saveRoute: vi.fn() },
    vision: { analyze: vi.fn(), buildReversePrompt: vi.fn() },
    generation: { image: vi.fn(), refineImage: vi.fn(), video: vi.fn(), pollVideo: vi.fn(), jobs: vi.fn().mockResolvedValue([]) },
  };
});

afterEach(() => cleanup());

it('资产包成员角色只依据当前项目母版关系，不读取全局 metadata.role', () => {
  const asset = { id: 'shared', metadata: { role: 'master' } } as never;
  expect(assetCollectionRole('shared', [])).toBe('素材');
  expect(assetCollectionRole('shared', [asset])).toBe('项目母版');
});

it('显示工作台标题与本地运行状态', async () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /虚拟资产.*创作工作台/ })).toBeInTheDocument();
  expect(await screen.findByText(/本地服务已连接/)).toBeInTheDocument();
});

it('默认进入创作工作总览，并提供四个工作域入口与主内容区', async () => {
  render(<App />);
  expect(screen.getAllByRole('heading', { name: '把创作收敛成可复用项目' }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole('navigation', { name: '四个工作域' }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole('button', { name: '模板' }).length).toBeGreaterThan(0);
  expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  expect(screen.getByRole('button', { name: '创建第一个项目' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: '项目名称' })).toBeInTheDocument();
});

it('场景档案可从资产域进入工作室，并把锁定场景带入创作卡', async () => {
  const scene = {
    id: 'scene-1', name: '雨夜玻璃温室', kind: 'interior', lifecycle: 'confirmed', anchor: '狭长中轴温室',
    layout: '中央石板路', materials: '潮湿玻璃', colorSystem: '墨绿与冷蓝', requiredElements: '拱形门',
    forbiddenChanges: '不改变中轴结构', createdAt: '', updatedAt: '',
  };
  const version = { id: 'scene-version-1', profileId: scene.id, versionNumber: 1, label: '正式空间 V1', status: 'locked', changeSummary: '', snapshot: scene, createdAt: '' };
  const state = { id: 'scene-state-1', profileId: scene.id, versionId: version.id, name: '雨夜', status: 'active', timeOfDay: '深夜', weather: '小雨', season: '', lighting: '冷月光', atmosphere: '玻璃水汽', setDressing: '', continuityNotes: '保持地面潮湿', createdAt: '', updatedAt: '' };
  const workspace = { scene, versions: [version], states: [state], sessions: [], media: [], activeVersion: version, activeState: state };
  vi.mocked(window.studio.sceneWorkspace.list).mockResolvedValue([scene] as never);
  vi.mocked(window.studio.sceneWorkspace.get).mockResolvedValue(workspace as never);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(await screen.findByRole('button', { name: '场景档案' }));
  expect(await screen.findByRole('heading', { name: '场景档案与环境连续性' })).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: '管理场景' }));
  fireEvent.click(await screen.findByRole('button', { name: '用当前场景开始图片创作' }));
  expect(await screen.findByText('本轮锁定场景')).toBeInTheDocument();
  expect(screen.getByText('狭长中轴温室；中央石板路；拱形门；深夜；小雨；玻璃水汽')).toBeInTheDocument();
});

it('镜头工作室锁定角色与场景上下文，并可带入图片创作', async () => {
  const project = { id: 'project-shot', name: '人物海报', medium: 'image', brief: { goal: '', audience: '', visualWorld: '', delivery: '', acceptance: '' } };
  const character = { ...characterFixture('char-shot', '蝶灵'), projectId: project.id };
  const characterVersion = { id: 'char-version', profileId: character.id, versionNumber: 1, label: '定妆 V1', status: 'locked', changeSummary: '', snapshot: {}, createdAt: '' };
  const characterState = { id: 'char-state', profileId: character.id, versionId: characterVersion.id, name: '回眸', kind: 'performance', status: 'active', wardrobe: '', hair: '', expression: '', pose: '', scene: '', emotion: '', continuityNotes: '', createdAt: '', updatedAt: '' };
  const characterWorkspace = { character, versions: [characterVersion], states: [characterState], sessions: [], media: [], activeVersion: characterVersion, activeState: characterState };
  const scene = { id: 'scene-shot', projectId: project.id, name: '雨夜温室', kind: 'interior', lifecycle: 'confirmed', anchor: '玻璃温室中轴', layout: '中央石板路', materials: '潮湿玻璃', colorSystem: '冷蓝', requiredElements: '拱形门', forbiddenChanges: '不改变中轴', createdAt: '', updatedAt: '' };
  const sceneVersion = { id: 'scene-version', profileId: scene.id, versionNumber: 1, label: '空间 V1', status: 'locked', changeSummary: '', snapshot: scene, createdAt: '' };
  const sceneState = { id: 'scene-state', profileId: scene.id, versionId: sceneVersion.id, name: '雨夜', status: 'active', timeOfDay: '深夜', weather: '小雨', season: '', lighting: '冷月光', atmosphere: '水汽', setDressing: '', continuityNotes: '地面潮湿', createdAt: '', updatedAt: '' };
  const sceneWorkspace = { scene, versions: [sceneVersion], states: [sceneState], sessions: [], media: [], activeVersion: sceneVersion, activeState: sceneState };
  vi.mocked(window.studio.projects.list).mockResolvedValue([project] as never);
  vi.mocked(window.studio.projects.workspace).mockResolvedValue({ project, masterAssets: [], recentGenerations: [], recentTasks: [], health: {} } as never);
  vi.mocked(window.studio.characters.list).mockResolvedValue([character] as never);
  vi.mocked(window.studio.characters.detail).mockResolvedValue({ ...character, facts: [], variants: [], evidenceAssets: [] } as never);
  vi.mocked(window.studio.characterWorkspace.get).mockResolvedValue(characterWorkspace as never);
  vi.mocked(window.studio.sceneWorkspace.list).mockResolvedValue([scene] as never);
  vi.mocked(window.studio.sceneWorkspace.get).mockResolvedValue(sceneWorkspace as never);
  vi.mocked(window.studio.creation.compileShot).mockResolvedValue('主体锚点：蝶灵\n场景：雨夜温室');
  vi.mocked(window.studio.creation.compilePrompt).mockResolvedValue({ positive: '蝶灵在雨夜温室回眸', negative: '', modules: [] });
  vi.mocked(window.studio.shots.create).mockImplementation(async (input) => ({ id: 'shot-1', createdAt: '', updatedAt: '', ...input, purpose: input.purpose ?? 'image', status: input.status ?? 'ready', continuityNotes: input.continuityNotes ?? '' }) as never);

  render(<App />);
  fireEvent.change(await screen.findByRole('combobox', { name: '当前项目' }), { target: { value: project.id } });
  fireEvent.click(screen.getByRole('button', { name: '生产' }));
  fireEvent.click(await screen.findByRole('button', { name: '镜头工作室' }));
  fireEvent.change(screen.getByRole('combobox', { name: '镜头角色' }), { target: { value: character.id } });
  fireEvent.change(screen.getByRole('combobox', { name: '镜头场景' }), { target: { value: scene.id } });
  await screen.findByRole('option', { name: /定妆 V1/ });
  await screen.findByRole('option', { name: '雨夜' });
  fireEvent.change(screen.getByRole('textbox', { name: '跨镜连续性' }), { target: { value: '脸、服装和空间中轴不变' } });
  fireEvent.click(screen.getByRole('button', { name: '生成镜头合同' }));
  expect(await screen.findByText(/主体锚点：蝶灵/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '保存到项目镜头清单' }));
  await waitFor(() => expect(window.studio.shots.create).toHaveBeenCalledWith(expect.objectContaining({
    projectId: project.id, characterProfileId: character.id, characterVersionId: characterVersion.id,
    characterStateId: characterState.id, sceneProfileId: scene.id, sceneVersionId: sceneVersion.id,
    sceneStateId: sceneState.id, purpose: 'image', continuityNotes: '脸、服装和空间中轴不变',
  })));
  fireEvent.click(screen.getByRole('button', { name: '带入图片创作' }));
  expect(await screen.findByText('本轮锁定场景')).toBeInTheDocument();
  expect(screen.getByText('本轮锁定角色')).toBeInTheDocument();
  expect(window.studio.creation.compilePrompt).toHaveBeenCalledWith(expect.objectContaining({ scene: expect.stringContaining('玻璃温室中轴') }));
});

it('审片与母版独立承接图片候选，并保留来源与晋级入口', async () => {
  const project = { id: 'project-review', name: '角色定妆', medium: 'image', brief: { goal: '', audience: '', visualWorld: '', delivery: '', acceptance: '' } };
  const candidate = {
    id: 'candidate-review', type: 'image', name: '候选 A', managedPath: '/tmp/candidate.png', sha256: 'review', mediaType: 'image/png',
    rightsStatus: 'authorized', confirmation: 'confirmed', metadata: {}, createdAt: '', updatedAt: '',
  };
  const review = {
    id: 'review-a', projectId: project.id, assetId: candidate.id, decision: 'approved',
    scores: { identity: 5, scene: 4, realism: 4, composition: 5, technical: 4 }, note: '通过', nextAction: '',
    provenance: { providerId: 'gemini', prompt: '角色定妆', aspectRatio: '2:3', referenceAssetIds: [] }, createdAt: '',
  };
  vi.mocked(window.studio.projects.list).mockResolvedValue([project] as never);
  vi.mocked(window.studio.projects.workspace).mockResolvedValue({ project, health: {}, masterAssets: [], recommendedNextAction: '' } as never);
  vi.mocked(window.studio.assets.preview).mockResolvedValue('data:image/png;base64,AA==');
  vi.mocked(window.studio.imageReviews.workspace).mockResolvedValue({
    projectId: project.id, candidates: [{ asset: candidate, latestReview: review, reviewCount: 1, projectMaster: false }], reviews: [review], promotions: [],
  } as never);

  render(<App />);
  fireEvent.change(await screen.findByRole('combobox', { name: '当前项目' }), { target: { value: project.id } });
  fireEvent.click(screen.getByRole('button', { name: '生产' }));
  fireEvent.click(await screen.findByRole('button', { name: '审片与母版' }));
  expect(await screen.findByRole('heading', { name: '从候选里选出可复用的生产基线' })).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: '候选 A' })).toBeInTheDocument();
  expect(screen.getByText(/模型：gemini/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '晋级母版' })).toBeEnabled();
});

it('重启中断的图片任务可在队列确认重试，并在新任务关联后隐藏重复入口', async () => {
  const interrupted = {
    id: 'job-interrupted', projectId: 'asset-library', kind: 'image_generation', providerId: 'gemini',
    status: 'queued', request: { prompt: '同一角色', size: '1024x1536', referenceAssetIds: ['ref-1'], qualityTier: 'premium' },
    error: '应用关闭前任务中断，可由用户确认后重试。', retryCount: 1, createdAt: '', updatedAt: '',
  };
  const retried = {
    id: 'job-retry', projectId: 'asset-library', kind: 'image_generation', providerId: 'gemini',
    status: 'unknown', request: { ...interrupted.request, retryOfJobId: interrupted.id },
    error: '网络暂时不可达', retryCount: 0, createdAt: '', updatedAt: '',
  };
  let jobs = [interrupted];
  vi.mocked(window.studio.generation.jobs).mockImplementation(async () => jobs as never);
  vi.mocked(window.studio.generation.image).mockImplementation(async () => {
    jobs = [interrupted, retried];
    return retried as never;
  });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '生产' }));
  fireEvent.click(await screen.findByRole('button', { name: '生成队列' }));
  const retry = await screen.findByRole('button', { name: '确认重试' });
  fireEvent.click(retry);

  await waitFor(() => expect(window.studio.generation.image).toHaveBeenCalledWith(expect.objectContaining({
    retryOfJobId: interrupted.id,
    referenceAssetIds: ['ref-1'],
  })));
  await waitFor(() => expect(screen.queryByRole('button', { name: '确认重试' })).not.toBeInTheDocument());
});

it('手机宽度使用独立的工作域导航', () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
  render(<App />);
  expect(screen.getByRole('navigation', { name: '移动端四个工作域' })).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: '四个工作域' })).not.toBeInTheDocument();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
});

it('项目概览把建议下一步变成可直接执行的入口', async () => {
  const project = { id: 'project-next', name: '角色项目', medium: 'image', brief: { goal: '', audience: '', visualWorld: '', delivery: '', acceptance: '' } };
  vi.mocked(window.studio.projects.list).mockResolvedValue([project] as never);
  vi.mocked(window.studio.projects.workspace).mockResolvedValue({
    project,
    health: { assetCount: 0, confirmedAssetCount: 0, candidateAssetCount: 0, masterAssetCount: 0, generationCount: 0 },
    masterAssets: [],
    recentGenerations: [],
    recentTasks: [],
    pipeline: [
      { key: 'creation', label: '创作', status: 'complete', summary: '简报已完成', nextAction: '继续创作', target: 'creation', primaryCount: 1 },
      { key: 'assets', label: '资产', status: 'not_started', summary: '尚无素材', nextAction: '导入第一批素材', target: 'assets', primaryCount: 0 },
      { key: 'production', label: '生产', status: 'not_started', summary: '尚未生成', nextAction: '建立候选', target: 'shot', primaryCount: 0 },
      { key: 'templates', label: '模板', status: 'not_started', summary: '尚无配方', nextAction: '沉淀配方', target: 'recipes', primaryCount: 0 },
    ],
    blockers: [],
    recommendedNextAction: '先导入素材',
  } as never);

  render(<App />);
  fireEvent.change(await screen.findByRole('combobox', { name: '当前项目' }), { target: { value: 'project-next' } });
  expect(await screen.findByRole('button', { name: '导入第一批素材' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '导入第一批素材' }));
  expect(await screen.findByRole('heading', { name: '让每一张参考图都能成为可复用的创作资产' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '资产' })).toHaveAttribute('aria-current', 'page');
});

it('从角色档案入口导入人物资产包后自动打开角色与资产证据', async () => {
  const profile = {
    id: 'pack-character', name: '海军蓝缎面礼服角色（待命名）', group: 'lead', lifecycle: 'draft',
    createdAt: '', updatedAt: '', masterAssetId: undefined,
    card: { intent: '人物资产卡与连续出图基线', subject: '锁定同一位年轻成年中国女性模特', identityAnchor: '长发；御姐式时装姿态', bodyAndWardrobe: '海军蓝缎面束身礼服', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '', avoid: '', aspectRatio: '2:3', referenceAssetIds: [] },
    specification: { identityLocks: [], wardrobeLocks: [], visualMotifs: [], forbiddenChanges: [], requiredAssetKinds: [] },
  };
  const collection = { id: 'pack-collection', projectId: undefined, characterProfileId: profile.id, kind: 'character', name: `${profile.name} · 角色资产包`, description: '', status: 'draft', assetCount: 9 };
  const asset = { id: 'pack-asset', type: 'character', name: '01-front-hero-4k', managedPath: '/tmp/managed.png', sourcePath: '/tmp/character-asset-set-final.zip', sha256: 'hash', mediaType: 'image/png', rightsStatus: 'unknown', confirmation: 'draft', metadata: {}, createdAt: '', updatedAt: '' };
  vi.mocked(window.studio.selectCharacterPack).mockResolvedValue('/tmp/character-asset-set-final.zip');
  vi.mocked(window.studio.characters.importAssetPack).mockResolvedValue({ profile, collection, assets: [asset], importedCount: 1, duplicateCount: 8, warnings: [], sourcePath: '/tmp/character-asset-set-final.zip' } as never);
  vi.mocked(window.studio.characters.list).mockResolvedValue([profile] as never);
  vi.mocked(window.studio.characters.detail).mockResolvedValue({ ...profile, facts: [], variants: [], evidenceAssets: [asset] } as never);
  vi.mocked(window.studio.collections.list).mockResolvedValue([collection] as never);
  vi.mocked(window.studio.collections.detail).mockResolvedValue({ ...collection, assets: [asset], readiness: { status: 'incomplete', confirmedAssetCount: 0, masterReferenceCount: 0, nextAction: '先完成审片' } } as never);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(await screen.findByRole('button', { name: '导入人物资产包' }));

  await waitFor(() => expect(window.studio.characters.importAssetPack).toHaveBeenCalledWith(expect.objectContaining({
    zipPath: '/tmp/character-asset-set-final.zip',
    rightsStatus: 'unknown',
  })));
  expect(await screen.findByRole('heading', { name: '角色档案与素材完整度' })).toBeInTheDocument();
  expect(await screen.findByText(/已导入人物资产包.*1 张新素材.*8 张复用/)).toBeInTheDocument();
  expect(screen.getByText(profile.name)).toBeInTheDocument();
});

it('取消选择人物资产包时不发起导入，也不改变当前界面', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(await screen.findByRole('button', { name: '导入人物资产包' }));

  expect(window.studio.characters.importAssetPack).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: '角色档案与素材完整度' })).toBeInTheDocument();
});

it('人物资产包读取失败时保留角色页面并显示可恢复错误', async () => {
  vi.mocked(window.studio.selectCharacterPack).mockResolvedValue('/tmp/broken-character-pack.zip');
  vi.mocked(window.studio.characters.importAssetPack).mockRejectedValue(new Error('人物资产包缺少必需文件：09-front-transparent-cutout-4k.png'));

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(await screen.findByRole('button', { name: '导入人物资产包' }));

  expect(await screen.findByRole('status')).toHaveTextContent(/人物资产包导入失败.*缺少必需文件/);
  expect(screen.getByRole('heading', { name: '角色档案与素材完整度' })).toBeInTheDocument();
});

it('角色档案空状态直接进入建档，不要求先建立项目或创作任务', async () => {
  const profile = { ...characterFixture('char-new', '蝶灵') };
  vi.mocked(window.studio.characters.create).mockResolvedValue(profile as never);
  vi.mocked(window.studio.characters.detail).mockResolvedValue({ ...profile, facts: [], variants: [], evidenceAssets: [] } as never);
  vi.mocked(window.studio.collections.create).mockResolvedValue({ id: 'collection-new', kind: 'character', name: '蝶灵 · 角色资产包', status: 'draft' } as never);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '创建第一个项目' }));
  expect(await screen.findByText('请先给项目取一个名称。')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(await screen.findByRole('button', { name: '建立角色档案' }));

  expect(await screen.findByRole('heading', { name: '建立角色档案' })).toBeInTheDocument();
  expect(screen.queryByText('请先给项目取一个名称。')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: '项目名称' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '建立创作基线' })).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole('textbox', { name: '角色档案名称' }), { target: { value: '蝶灵' } });
  fireEvent.change(screen.getByRole('textbox', { name: '人物主体' }), { target: { value: '成年女性，东方古典美人' } });
  fireEvent.click(screen.getByRole('button', { name: '保存角色档案' }));

  await waitFor(() => expect(window.studio.characters.create).toHaveBeenCalledWith(expect.objectContaining({ name: '蝶灵', projectId: undefined })));
  expect(window.studio.tasks.create).not.toHaveBeenCalled();
});

it('从已选角色建立角色设定板时锁定角色 ID 与 4:3 画幅', async () => {
  const profile = { ...characterFixture('char-sheet', '蝶灵'), masterAssetId: 'master-1' };
  const task = { id: 'task-sheet', name: '蝶灵 · 角色设定板', objective: '角色设定板', status: 'draft', collectionIds: [], card: profile.card };
  vi.mocked(window.studio.characters.list).mockResolvedValue([profile] as never);
  vi.mocked(window.studio.characters.detail).mockResolvedValue({ ...profile, facts: [], variants: [], evidenceAssets: [] } as never);
  vi.mocked(window.studio.tasks.create).mockResolvedValue(task as never);
  vi.mocked(window.studio.creation.compilePrompt).mockResolvedValue({ positive: '角色设定板', negative: '', modules: [] });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(await screen.findByRole('button', { name: '管理细项' }));
  fireEvent.click(await screen.findByRole('button', { name: '创建角色设定板' }));

  await waitFor(() => expect(window.studio.tasks.create).toHaveBeenCalledWith(expect.objectContaining({
    characterProfileId: 'char-sheet',
    card: expect.objectContaining({ aspectRatio: '4:3', referenceAssetIds: ['master-1'] }),
  })));
  expect(await screen.findByRole('heading', { name: '蝶灵 · 角色设定板' })).toBeInTheDocument();
});

it('角色档案能展开用途化细项、编辑脸型并绑定素材证据', async () => {
  const profile = {
    id: 'char-1', name: '蝶灵', group: 'lead', lifecycle: 'draft', createdAt: '', updatedAt: '',
    card: { intent: '', subject: '成年女性', identityAnchor: '', bodyAndWardrobe: '', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '', avoid: '', aspectRatio: '2:3', referenceAssetIds: [] },
    specification: { identityLocks: [], wardrobeLocks: [], visualMotifs: [], forbiddenChanges: [], requiredAssetKinds: [] },
  };
  vi.mocked(window.studio.characters.list).mockResolvedValue([profile as never]);
  vi.mocked(window.studio.characters.detail).mockResolvedValue({ ...profile, facts: [], variants: [], evidenceAssets: [{ id: 'ref-1', name: '正面参考', confirmation: 'confirmed', rightsStatus: 'authorized' }] } as never);
  vi.mocked(window.studio.characters.upsertFact).mockResolvedValue({ ...profile, facts: [], variants: [], evidenceAssets: [] } as never);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(await screen.findByRole('button', { name: '管理细项' }));
  fireEvent.click(await screen.findByRole('button', { name: '面部五官' }));
  fireEvent.change(screen.getByRole('textbox', { name: '脸型描述' }), { target: { value: '柔和鹅蛋脸' } });
  fireEvent.click(screen.getByRole('button', { name: '保存脸型' }));
  expect(window.studio.characters.upsertFact).toHaveBeenCalledWith('char-1', expect.objectContaining({ slotKey: 'face.shape', value: '柔和鹅蛋脸', state: 'draft' }));
});

function characterFixture(id: string, name: string) {
  return {
    id, name, group: 'lead', lifecycle: 'draft', createdAt: '', updatedAt: '',
    card: { intent: '', subject: '成年女性', identityAnchor: '', bodyAndWardrobe: '', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '', avoid: '', aspectRatio: '2:3', referenceAssetIds: [] },
    specification: { identityLocks: [], wardrobeLocks: [], visualMotifs: [], forbiddenChanges: [], requiredAssetKinds: [] },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

it('创建角色后可从当前项目的合格图片绑定主参考并归入角色包', async () => {
  const project = { id: 'project-1', name: '人物项目', brief: { goal: '', audience: '', visualWorld: '', delivery: '', acceptance: '' } };
  const profile = { ...characterFixture('char-1', '蝶灵'), projectId: project.id };
  const collection = { id: 'collection-1', projectId: project.id, characterProfileId: profile.id, kind: 'character', name: '蝶灵角色包' };
  const available = { id: 'ready', name: '可用正面参考', type: 'reference_image', mediaType: 'image/png', confirmation: 'confirmed', rightsStatus: 'authorized', metadata: {} };
  let bound = false;
  vi.mocked(window.studio.projects.list).mockResolvedValue([project] as never);
  vi.mocked(window.studio.projects.workspace).mockResolvedValue({ project, masterAssets: [], recentGenerations: [], recentTasks: [], health: { assetCount: 0, confirmedAssetCount: 0, candidateAssetCount: 0, masterAssetCount: 0, generationCount: 0 } } as never);
  vi.mocked(window.studio.characters.list).mockResolvedValue([profile] as never);
  vi.mocked(window.studio.characters.detail).mockImplementation(async () => ({ ...profile, facts: [], variants: [], evidenceAssets: bound ? [available] : [] }) as never);
  vi.mocked(window.studio.characterWorkspace.get).mockImplementation(async () => ({
    character: { ...profile, facts: [], variants: [], evidenceAssets: bound ? [available] : [] },
    versions: [], states: [], sessions: [], media: [],
  }) as never);
  vi.mocked(window.studio.collections.list).mockResolvedValue([collection] as never);
  vi.mocked(window.studio.collections.attachAsset).mockResolvedValue({ ...collection, assets: [], readiness: {} } as never);
  vi.mocked(window.studio.characters.update).mockImplementation(async () => { bound = true; return { ...profile, masterAssetId: available.id } as never; });
  vi.mocked(window.studio.assets.list).mockImplementation(async (query) => query?.projectId === project.id ? [
    available,
    { ...available, id: 'unreviewed', name: '未审片', confirmation: 'draft' },
    { ...available, id: 'unknown', name: '权利未明', rightsStatus: 'unknown' },
    { ...available, id: 'video', name: '已授权视频', mediaType: 'video/mp4' },
  ] as never : []);

  render(<App />);
  await screen.findByRole('option', { name: project.name });
  fireEvent.change(screen.getByRole('combobox', { name: '当前项目' }), { target: { value: project.id } });
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(await screen.findByRole('button', { name: '管理细项' }));
  await screen.findByRole('heading', { name: '蝶灵 · 完整度管理' });
  fireEvent.click(await screen.findByRole('button', { name: '选择主参考图' }));
  expect(await screen.findByRole('option', { name: available.name })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: '未审片' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: '权利未明' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: '已授权视频' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: '主参考图' }), { target: { value: available.id } });
  fireEvent.click(screen.getByRole('button', { name: '确认绑定主参考图' }));
  await waitFor(() => expect(window.studio.collections.attachAsset).toHaveBeenCalledWith(collection.id, available.id, '主参考'));
  await waitFor(() => expect(window.studio.characters.update).toHaveBeenCalledWith(profile.id, { masterAssetId: available.id }));
  expect(vi.mocked(window.studio.collections.attachAsset).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(window.studio.characters.update).mock.invocationCallOrder[0]);
  expect(await screen.findByText(/已绑定主参考图/)).toBeInTheDocument();
  expect((await screen.findAllByRole('checkbox', { name: /可用正面参考/, hidden: true })).length).toBeGreaterThan(0);
});

it('提交主参考前素材权利变更时停止绑定并提示重新选择', async () => {
  const profile = characterFixture('char-1', '蝶灵');
  const available = { id: 'ready', name: '原先可用的图片', type: 'reference_image', mediaType: 'image/png', confirmation: 'confirmed', rightsStatus: 'authorized', metadata: {} };
  let pickerRequests = 0;
  vi.mocked(window.studio.characters.list).mockResolvedValue([profile] as never);
  vi.mocked(window.studio.assets.list).mockImplementation(async (query) => {
    if (query && Object.keys(query).length === 1) return [++pickerRequests === 1 ? available : { ...available, rightsStatus: 'restricted' }] as never;
    return [];
  });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(await screen.findByRole('button', { name: '选择主参考图' }));
  fireEvent.change(await screen.findByRole('combobox', { name: '主参考图' }), { target: { value: available.id } });
  fireEvent.click(screen.getByRole('button', { name: '确认绑定主参考图' }));
  expect(await screen.findByText(/主参考图状态已变化/)).toBeInTheDocument();
  expect(window.studio.collections.attachAsset).not.toHaveBeenCalled();
  expect(window.studio.characters.update).not.toHaveBeenCalled();
});

it('无项目角色只可选未归属任何项目的授权图片', async () => {
  const profile = characterFixture('global-char', '独立角色');
  const linked = { id: 'linked', name: '已归甲项目图片', type: 'reference_image', mediaType: 'image/png', confirmation: 'confirmed', rightsStatus: 'authorized', metadata: {} };
  const free = { ...linked, id: 'free', name: '未归项目图片' };
  vi.mocked(window.studio.projects.list).mockResolvedValue([{ id: 'project-a', name: '甲项目' }] as never);
  vi.mocked(window.studio.characters.list).mockResolvedValue([profile] as never);
  vi.mocked(window.studio.assets.list).mockImplementation(async (query) => query?.projectId === 'project-a' ? [linked] as never : [linked, free] as never);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(await screen.findByRole('button', { name: '选择主参考图' }));
  expect(await screen.findByRole('option', { name: free.name })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: linked.name })).not.toBeInTheDocument();
});

it.each([
  ['权利未明图片', 'image/png', 'unknown'],
  ['已授权视频', 'video/mp4', 'authorized'],
  ['已授权图片但未选项目', 'image/png', 'authorized'],
] as const)('旧建档入口选中%s也不会作为角色主参考', async (name, mediaType, rightsStatus) => {
  const asset = { id: 'selected', name, type: 'reference_image', mediaType, confirmation: 'confirmed', rightsStatus, metadata: {} };
  vi.mocked(window.studio.assets.list).mockResolvedValue([asset] as never);
  vi.mocked(window.studio.assets.preview).mockResolvedValue('data:image/png;base64,YQ==' as never);
  vi.mocked(window.studio.characters.create).mockImplementation(async (input) => ({ ...characterFixture('new-char', input.name), ...input } as never));
  vi.mocked(window.studio.characters.detail).mockResolvedValue({ ...characterFixture('new-char', '蝶灵'), facts: [], variants: [], evidenceAssets: [] } as never);
  vi.mocked(window.studio.collections.create).mockResolvedValue({ id: 'collection-1', kind: 'character', name: '角色包', status: 'draft' } as never);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(screen.getByRole('button', { name: '素材库' }));
  fireEvent.click(await screen.findByRole('heading', { name }));
  fireEvent.click(screen.getByRole('button', { name: '创作' }));
  fireEvent.click(screen.getByRole('button', { name: '当前创作卡' }));
  fireEvent.change(screen.getByRole('textbox', { name: '角色档案名称' }), { target: { value: '蝶灵' } });
  fireEvent.click(screen.getByRole('button', { name: '保存角色档案' }));
  await waitFor(() => expect(window.studio.characters.create).toHaveBeenCalledWith(expect.objectContaining({ name: '蝶灵', masterAssetId: undefined })));
  expect(window.studio.collections.attachAsset).not.toHaveBeenCalled();
}, 20_000);

it('切换项目后旧项目的角色列表请求不能覆盖新项目', async () => {
  const first = { ...characterFixture('char-a', '甲角色'), projectId: 'project-a' };
  const second = { ...characterFixture('char-b', '乙角色'), projectId: 'project-b' };
  const slow = deferred<never[]>();
  vi.mocked(window.studio.projects.list).mockResolvedValue([
    { id: 'project-a', name: '甲项目' }, { id: 'project-b', name: '乙项目' },
  ] as never);
  vi.mocked(window.studio.projects.workspace).mockImplementation(async (projectId) => ({
    project: { id: projectId, name: projectId, brief: { goal: '', audience: '', visualWorld: '', delivery: '', acceptance: '' } },
    masterAssets: [], recentGenerations: [], recentTasks: [],
    health: { assetCount: 0, confirmedAssetCount: 0, candidateAssetCount: 0, masterAssetCount: 0, generationCount: 0 },
  }) as never);
  vi.mocked(window.studio.characters.list).mockImplementation((projectId) => projectId === 'project-a' ? slow.promise : Promise.resolve(projectId === 'project-b' ? [second] as never : []));

  render(<App />);
  await screen.findByRole('option', { name: '甲项目' });
  fireEvent.change(screen.getByRole('combobox', { name: '当前项目' }), { target: { value: 'project-a' } });
  await waitFor(() => expect(window.studio.characters.list).toHaveBeenCalledWith('project-a'));
  fireEvent.change(screen.getByRole('combobox', { name: '当前项目' }), { target: { value: 'project-b' } });
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  expect(await screen.findByText('乙角色')).toBeInTheDocument();
  await act(async () => { slow.resolve([first] as never); });
  expect(screen.getByText('乙角色')).toBeInTheDocument();
  expect(screen.queryByText('甲角色')).not.toBeInTheDocument();
});

it('素材复核触发的角色关系刷新完成较晚时不覆盖切换后的项目', async () => {
  const first = { ...characterFixture('char-a', '甲角色'), projectId: 'project-a' };
  const second = { ...characterFixture('char-b', '乙角色'), projectId: 'project-b' };
  const reviewRefresh = deferred<never[]>();
  let firstProjectCalls = 0;
  const asset = { id: 'asset-a', name: '待复核素材', type: 'reference_image', mediaType: 'image/png', confirmation: 'confirmed', rightsStatus: 'unknown', metadata: {} };
  const projects = [{ id: 'project-a', name: '甲项目' }, { id: 'project-b', name: '乙项目' }];
  vi.mocked(window.studio.projects.list).mockResolvedValue(projects as never);
  vi.mocked(window.studio.projects.workspace).mockImplementation(async (projectId) => ({
    project: { id: projectId, name: projectId, brief: { goal: '', audience: '', visualWorld: '', delivery: '', acceptance: '' } },
    masterAssets: [], recentGenerations: [], recentTasks: [],
    health: { assetCount: 0, confirmedAssetCount: 0, candidateAssetCount: 0, masterAssetCount: 0, generationCount: 0 },
  }) as never);
  vi.mocked(window.studio.assets.list).mockImplementation(async (query) => query?.projectId === 'project-a' ? [asset] as never : []);
  vi.mocked(window.studio.assets.preview).mockResolvedValue('data:image/png;base64,YQ==' as never);
  vi.mocked(window.studio.assets.updateRights).mockResolvedValue({ ...asset, rightsStatus: 'authorized' } as never);
  vi.mocked(window.studio.characters.list).mockImplementation((projectId) => {
    if (projectId === 'project-a') return ++firstProjectCalls === 1 ? Promise.resolve([first] as never) : reviewRefresh.promise;
    return Promise.resolve(projectId === 'project-b' ? [second] as never : []);
  });

  render(<App />);
  await screen.findByRole('option', { name: '甲项目' });
  fireEvent.change(screen.getByRole('combobox', { name: '当前项目' }), { target: { value: 'project-a' } });
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(screen.getByRole('button', { name: '素材库' }));
  fireEvent.click(await screen.findByRole('heading', { name: asset.name }));
  fireEvent.change(screen.getByRole('combobox', { name: '素材使用权状态' }), { target: { value: 'authorized' } });
  fireEvent.change(screen.getByRole('textbox', { name: '依据或复核备注' }), { target: { value: '本人拍摄' } });
  fireEvent.click(screen.getByRole('button', { name: '保存权利复核' }));
  await waitFor(() => expect(firstProjectCalls).toBe(2));
  fireEvent.change(screen.getByRole('combobox', { name: '当前项目' }), { target: { value: 'project-b' } });
  fireEvent.click(screen.getByRole('button', { name: '角色档案' }));
  expect(await screen.findByText('乙角色')).toBeInTheDocument();
  await act(async () => { reviewRefresh.resolve([first] as never); });
  expect(screen.getByText('乙角色')).toBeInTheDocument();
  expect(screen.queryByText('甲角色')).not.toBeInTheDocument();
});

it('素材复核刷新旧项目较晚完成时不覆盖新项目素材列表', async () => {
  const firstAsset = { id: 'asset-a', name: '甲项目图片', type: 'reference_image', mediaType: 'image/png', confirmation: 'confirmed', rightsStatus: 'unknown', metadata: {} };
  const secondAsset = { ...firstAsset, id: 'asset-b', name: '乙项目图片' };
  const pendingRefresh = deferred<never[]>();
  let firstProjectCalls = 0;
  vi.mocked(window.studio.projects.list).mockResolvedValue([{ id: 'project-a', name: '甲项目' }, { id: 'project-b', name: '乙项目' }] as never);
  vi.mocked(window.studio.projects.workspace).mockImplementation(async (id) => ({
    project: { id, name: id, brief: { goal: '', audience: '', visualWorld: '', delivery: '', acceptance: '' } },
    masterAssets: [], recentGenerations: [], recentTasks: [], health: { assetCount: 0, confirmedAssetCount: 0, candidateAssetCount: 0, masterAssetCount: 0, generationCount: 0 },
  }) as never);
  vi.mocked(window.studio.assets.list).mockImplementation((query) => {
    if (query?.projectId === 'project-a') return ++firstProjectCalls === 1 ? Promise.resolve([firstAsset] as never) : pendingRefresh.promise;
    return Promise.resolve(query?.projectId === 'project-b' ? [secondAsset] as never : []);
  });
  vi.mocked(window.studio.assets.preview).mockResolvedValue('data:image/png;base64,YQ==' as never);
  vi.mocked(window.studio.assets.updateRights).mockResolvedValue({ ...firstAsset, rightsStatus: 'authorized' } as never);

  render(<App />);
  await screen.findByRole('option', { name: '甲项目' });
  fireEvent.change(screen.getByRole('combobox', { name: '当前项目' }), { target: { value: 'project-a' } });
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(screen.getByRole('button', { name: '素材库' }));
  fireEvent.click(await screen.findByRole('heading', { name: firstAsset.name }));
  fireEvent.change(screen.getByRole('combobox', { name: '素材使用权状态' }), { target: { value: 'authorized' } });
  fireEvent.change(screen.getByRole('textbox', { name: '依据或复核备注' }), { target: { value: '本人拍摄' } });
  fireEvent.click(screen.getByRole('button', { name: '保存权利复核' }));
  await waitFor(() => expect(firstProjectCalls).toBe(2));
  fireEvent.change(screen.getByRole('combobox', { name: '当前项目' }), { target: { value: 'project-b' } });
  expect(await screen.findByRole('heading', { name: secondAsset.name })).toBeInTheDocument();
  await act(async () => { pendingRefresh.resolve([firstAsset] as never); });
  expect(screen.getByRole('heading', { name: secondAsset.name })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: firstAsset.name })).not.toBeInTheDocument();
});

it('使用权已保存但列表刷新失败时明确区分两种结果', async () => {
  const asset = { id: 'asset-a', name: '待复核素材', type: 'reference_image', mediaType: 'image/png', confirmation: 'confirmed', rightsStatus: 'unknown', metadata: {} };
  let readCount = 0;
  vi.mocked(window.studio.assets.list).mockImplementation(() => ++readCount === 1 ? Promise.resolve([asset] as never) : Promise.reject(new Error('刷新读取失败')));
  vi.mocked(window.studio.assets.preview).mockResolvedValue('data:image/png;base64,YQ==' as never);
  vi.mocked(window.studio.assets.updateRights).mockResolvedValue({ ...asset, rightsStatus: 'authorized' } as never);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(screen.getByRole('button', { name: '素材库' }));
  fireEvent.click(await screen.findByRole('heading', { name: asset.name }));
  fireEvent.change(screen.getByRole('combobox', { name: '素材使用权状态' }), { target: { value: 'authorized' } });
  fireEvent.change(screen.getByRole('textbox', { name: '依据或复核备注' }), { target: { value: '本人拍摄' } });
  fireEvent.click(screen.getByRole('button', { name: '保存权利复核' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('使用权已保存，但页面刷新失败');
  expect(window.studio.assets.updateRights).toHaveBeenCalledWith(asset.id, 'authorized', '本人拍摄');
});

it('切换项目会清除旧资产包选择，不能把新项目素材误归到旧包', async () => {
  const collection = { id: 'collection-a', projectId: 'project-a', kind: 'reference', name: '甲项目资产包', status: 'draft', assetCount: 0 };
  const asset = { id: 'asset-b', name: '乙项目图片', type: 'reference_image', mediaType: 'image/png', confirmation: 'confirmed', rightsStatus: 'authorized', metadata: {} };
  vi.mocked(window.studio.projects.list).mockResolvedValue([{ id: 'project-a', name: '甲项目' }, { id: 'project-b', name: '乙项目' }] as never);
  vi.mocked(window.studio.projects.workspace).mockImplementation(async (id) => ({
    project: { id, name: id, brief: { goal: '', audience: '', visualWorld: '', delivery: '', acceptance: '' } },
    masterAssets: [], recentGenerations: [], recentTasks: [], health: { assetCount: 0, confirmedAssetCount: 0, candidateAssetCount: 0, masterAssetCount: 0, generationCount: 0 },
  }) as never);
  vi.mocked(window.studio.collections.list).mockImplementation(async (projectId) => projectId === 'project-a' ? [collection] as never : []);
  vi.mocked(window.studio.collections.detail).mockResolvedValue({ ...collection, assets: [], readiness: { status: 'empty', confirmedAssetCount: 0, masterReferenceCount: 0, nextAction: '' } } as never);
  vi.mocked(window.studio.assets.list).mockImplementation(async (query) => query?.projectId === 'project-b' ? [asset] as never : []);
  vi.mocked(window.studio.assets.preview).mockResolvedValue('data:image/png;base64,YQ==' as never);

  render(<App />);
  await screen.findByRole('option', { name: '甲项目' });
  fireEvent.change(screen.getByRole('combobox', { name: '当前项目' }), { target: { value: 'project-a' } });
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(screen.getByRole('button', { name: '资产包' }));
  fireEvent.click(await screen.findByRole('button', { name: /甲项目资产包/ }));
  await screen.findByRole('heading', { name: collection.name });
  fireEvent.change(screen.getByRole('combobox', { name: '当前项目' }), { target: { value: 'project-b' } });
  fireEvent.click(screen.getByRole('button', { name: '素材库' }));
  fireEvent.click(await screen.findByRole('heading', { name: asset.name }));
  expect(screen.getByRole('button', { name: '先在资产结构选择资产包' })).toBeDisabled();
  expect(window.studio.collections.attachAsset).not.toHaveBeenCalled();
});

it('旧项目资产包列表请求较晚完成时不覆盖当前项目', async () => {
  const slow = deferred<never[]>();
  const first = { id: 'collection-a', projectId: 'project-a', kind: 'reference', name: '甲项目资产包', status: 'draft', assetCount: 0 };
  const second = { ...first, id: 'collection-b', projectId: 'project-b', name: '乙项目资产包' };
  vi.mocked(window.studio.projects.list).mockResolvedValue([{ id: 'project-a', name: '甲项目' }, { id: 'project-b', name: '乙项目' }] as never);
  vi.mocked(window.studio.projects.workspace).mockImplementation(async (id) => ({
    project: { id, name: id, brief: { goal: '', audience: '', visualWorld: '', delivery: '', acceptance: '' } },
    masterAssets: [], recentGenerations: [], recentTasks: [], health: { assetCount: 0, confirmedAssetCount: 0, candidateAssetCount: 0, masterAssetCount: 0, generationCount: 0 },
  }) as never);
  vi.mocked(window.studio.collections.list).mockImplementation((projectId) => projectId === 'project-a' ? slow.promise : Promise.resolve(projectId === 'project-b' ? [second] as never : []));

  render(<App />);
  await screen.findByRole('option', { name: '甲项目' });
  fireEvent.change(screen.getByRole('combobox', { name: '当前项目' }), { target: { value: 'project-a' } });
  await waitFor(() => expect(window.studio.collections.list).toHaveBeenCalledWith('project-a'));
  fireEvent.change(screen.getByRole('combobox', { name: '当前项目' }), { target: { value: 'project-b' } });
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(screen.getByRole('button', { name: '资产包' }));
  expect(await screen.findByRole('button', { name: /乙项目资产包/ })).toBeInTheDocument();
  await act(async () => { slow.resolve([first] as never); });
  expect(screen.getByRole('button', { name: /乙项目资产包/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /甲项目资产包/ })).not.toBeInTheDocument();
});

it('切换项目后旧资产包详情迟到也不会重新显示', async () => {
  const oldCollection = { id: 'collection-a', projectId: 'project-a', kind: 'reference', name: '甲项目资产包', status: 'draft', assetCount: 0 };
  const pendingDetail = deferred<never>();
  vi.mocked(window.studio.projects.list).mockResolvedValue([{ id: 'project-a', name: '甲项目' }, { id: 'project-b', name: '乙项目' }] as never);
  vi.mocked(window.studio.projects.workspace).mockImplementation(async (id) => ({
    project: { id, name: id, brief: { goal: '', audience: '', visualWorld: '', delivery: '', acceptance: '' } },
    masterAssets: [], recentGenerations: [], recentTasks: [], health: { assetCount: 0, confirmedAssetCount: 0, candidateAssetCount: 0, masterAssetCount: 0, generationCount: 0 },
  }) as never);
  vi.mocked(window.studio.collections.list).mockImplementation(async (projectId) => projectId === 'project-a' ? [oldCollection] as never : []);
  vi.mocked(window.studio.collections.detail).mockReturnValue(pendingDetail.promise);

  render(<App />);
  await screen.findByRole('option', { name: '甲项目' });
  fireEvent.change(screen.getByRole('combobox', { name: '当前项目' }), { target: { value: 'project-a' } });
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(screen.getByRole('button', { name: '资产包' }));
  fireEvent.click(await screen.findByRole('button', { name: /甲项目资产包/ }));
  await waitFor(() => expect(window.studio.collections.detail).toHaveBeenCalledWith(oldCollection.id));
  fireEvent.change(screen.getByRole('combobox', { name: '当前项目' }), { target: { value: 'project-b' } });
  await waitFor(() => expect(window.studio.collections.list).toHaveBeenCalledWith('project-b'));
  await act(async () => { pendingDetail.resolve({ ...oldCollection, assets: [], readiness: { status: 'empty', confirmedAssetCount: 0, masterReferenceCount: 0, nextAction: '' } } as never); });
  expect(screen.queryByRole('heading', { name: oldCollection.name })).not.toBeInTheDocument();
});

it('快速切换角色时隐藏旧详情，旧读取完成也不覆盖新角色', async () => {
  const first = characterFixture('char-a', '甲角色');
  const second = characterFixture('char-b', '乙角色');
  const a = deferred<never>();
  const b = deferred<never>();
  vi.mocked(window.studio.characters.list).mockResolvedValue([first, second] as never);
  vi.mocked(window.studio.characters.detail).mockImplementation((id) => id === 'char-a' ? a.promise : b.promise);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  const manage = await screen.findAllByRole('button', { name: '管理细项' });
  fireEvent.click(manage[0]);
  fireEvent.click(manage[1]);
  await act(async () => { b.resolve({ ...second, facts: [], variants: [], evidenceAssets: [] } as never); });
  expect(screen.getByRole('heading', { name: '乙角色 · 完整度管理' })).toBeInTheDocument();
  await act(async () => { a.resolve({ ...first, facts: [], variants: [], evidenceAssets: [] } as never); });
  expect(screen.getByRole('heading', { name: '乙角色 · 完整度管理' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '甲角色 · 完整度管理' })).not.toBeInTheDocument();
});

it('角色切换期间旧角色保存的结果不能写入当前详情', async () => {
  const first = characterFixture('char-a', '甲角色');
  const second = characterFixture('char-b', '乙角色');
  const pendingSave = deferred<never>();
  vi.mocked(window.studio.characters.list).mockResolvedValue([first, second] as never);
  vi.mocked(window.studio.characters.detail).mockImplementation(async (id) => ({ ...(id === 'char-a' ? first : second), facts: [], variants: [], evidenceAssets: [] }) as never);
  vi.mocked(window.studio.characters.upsertFact).mockReturnValue(pendingSave.promise);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  const manage = await screen.findAllByRole('button', { name: '管理细项' });
  fireEvent.click(manage[0]);
  await screen.findByRole('heading', { name: '甲角色 · 完整度管理' });
  fireEvent.change(screen.getByRole('textbox', { name: '成年年龄段描述' }), { target: { value: '已成年' } });
  fireEvent.click(screen.getByRole('button', { name: '保存成年年龄段' }));
  expect(window.studio.characters.upsertFact).toHaveBeenCalledWith('char-a', expect.anything());
  fireEvent.click(manage[1]);
  expect(screen.queryByRole('heading', { name: '甲角色 · 完整度管理' })).not.toBeInTheDocument();
  await screen.findByRole('heading', { name: '乙角色 · 完整度管理' });
  await act(async () => { pendingSave.resolve({ ...first, facts: [], variants: [], evidenceAssets: [] } as never); });
  expect(screen.getByRole('heading', { name: '乙角色 · 完整度管理' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: '成年年龄段描述' }), { target: { value: '乙角色设定' } });
  fireEvent.click(screen.getByRole('button', { name: '保存成年年龄段' }));
  expect(window.studio.characters.upsertFact).toHaveBeenLastCalledWith('char-b', expect.objectContaining({ value: '乙角色设定' }));
});

it('使用已存角色开启新场景时不自动继承旧档案的未核验必须保持文本', async () => {
  const source = characterFixture('char-old', '旧档案角色');
  const profile = { ...source, specification: { ...source.specification, identityLocks: ['旧档案中的未核验脸型'], wardrobeLocks: ['旧档案中的未核验衣着'] } };
  vi.mocked(window.studio.characters.list).mockResolvedValue([profile] as never);
  vi.mocked(window.studio.characters.detail).mockResolvedValue({ ...profile, facts: [], variants: [], evidenceAssets: [] } as never);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(await screen.findByRole('button', { name: '用此角色做新场景' }));
  expect(screen.getByPlaceholderText('例如：脸型和黑色长发不变；保持真实皮肤；不要文字和水印')).toHaveValue('');
});

it('引导流程快速切角色时不显示另一角色的变体选项', async () => {
  const first = characterFixture('char-a', '甲角色');
  const second = characterFixture('char-b', '乙角色');
  const a = deferred<never>(); const b = deferred<never>();
  vi.mocked(window.studio.characters.list).mockResolvedValue([first, second] as never);
  vi.mocked(window.studio.characters.detail).mockImplementation((id) => id === 'char-a' ? a.promise : b.promise);
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建创作任务' }));
  fireEvent.click(screen.getByRole('button', { name: '用已保存角色' }));
  await screen.findByRole('option', { name: '主角 · 甲角色' });
  fireEvent.change(screen.getByRole('combobox', { name: '选择角色' }), { target: { value: 'char-a' } });
  await waitFor(() => expect(window.studio.characters.detail).toHaveBeenCalledWith('char-a'));
  fireEvent.change(screen.getByRole('combobox', { name: '选择角色' }), { target: { value: 'char-b' } });
  await waitFor(() => expect(window.studio.characters.detail).toHaveBeenCalledWith('char-b'));
  await act(async () => { b.resolve({ ...second, facts: [], evidenceAssets: [], variants: [{ id: 'look-b', profileId: 'char-b', kind: 'look', name: '乙造型' }] } as never); });
  expect(screen.getByRole('option', { name: '乙造型' })).toBeInTheDocument();
  await act(async () => { a.resolve({ ...first, facts: [], evidenceAssets: [], variants: [{ id: 'look-a', profileId: 'char-a', kind: 'look', name: '甲造型' }] } as never); });
  expect(screen.getByRole('option', { name: '乙造型' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: '甲造型' })).not.toBeInTheDocument();
});

it('引导选择参考图时排除未审片与权利未明的图片', async () => {
  vi.mocked(window.studio.assets.list).mockResolvedValue([
    { id: 'unknown', name: '权利待核', type: 'image', mediaType: 'image/png', confirmation: 'confirmed', rightsStatus: 'unknown', metadata: {} },
    { id: 'draft', name: '未审片', type: 'image', mediaType: 'image/png', confirmation: 'draft', rightsStatus: 'authorized', metadata: {} },
    { id: 'ready', name: '可用主图', type: 'image', mediaType: 'image/png', confirmation: 'confirmed', rightsStatus: 'authorized', metadata: {} },
  ] as never);
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建创作任务' }));
  fireEvent.click(screen.getByRole('button', { name: '按参考图创作' }));
  expect(await screen.findByRole('option', { name: '可用主图' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: '权利待核' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: '未审片' })).not.toBeInTheDocument();
});

it('创作卡说明主参考会进入当前绘图模型', async () => {
  const project = { id: 'project-1', name: '人物项目', brief: { goal: '', audience: '', visualWorld: '', delivery: '', acceptance: '' } };
  const task = { id: 'task-1', name: '人物图', objective: '人物图', status: 'draft', card: { ...characterFixture('unused', 'unused').card, referenceAssetIds: ['ref-1', 'ref-2'] } };
  vi.mocked(window.studio.projects.list).mockResolvedValue([project] as never);
  vi.mocked(window.studio.projects.workspace).mockResolvedValue({ project, masterAssets: [], recentGenerations: [], recentTasks: [], health: { assetCount: 0, confirmedAssetCount: 0, candidateAssetCount: 0, masterAssetCount: 0, generationCount: 0 } } as never);
  vi.mocked(window.studio.tasks.list).mockResolvedValue([task] as never);

  render(<App />);
  await screen.findByRole('option', { name: '人物项目' });
  fireEvent.change(await screen.findByRole('combobox', { name: '当前项目' }), { target: { value: 'project-1' } });
  fireEvent.click(await screen.findByRole('button', { name: /人物图.*人物图/ }));
  expect(screen.getByText(/主参考会送入模型/)).toBeInTheDocument();
  expect(screen.getByText(/主参考需已确认且具备使用权/)).toBeInTheDocument();
});
