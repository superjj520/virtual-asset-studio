import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App, { assetCollectionRole } from './App';

beforeEach(() => {
  window.localStorage.clear();
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
      usage: vi.fn().mockResolvedValue([]),
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
      createState: vi.fn().mockImplementation(async (profileId, input) => ({
        id: 'baseline-state', profileId, createdAt: '', updatedAt: '',
        wardrobe: '', hair: '', expression: '', pose: '', scene: '', emotion: '', continuityNotes: '',
        ...input,
      })),
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
    settings: { providerStatus: vi.fn().mockResolvedValue({ providers: [{ id: 'openai', configured: false, capabilities: ['vision', 'image', 'image_edit', 'video'] }, { id: 'flux', configured: false, capabilities: ['image'] }, { id: 'deepseek', configured: false, capabilities: ['text'] }], routes: { vision: 'openai', image: 'openai', image_edit: 'openai', video: 'openai', text: 'deepseek' } }), verifyProvider: vi.fn(), budgetStatus: vi.fn().mockResolvedValue({ plannedSpendUsd: 0 }), saveMonthlyBudget: vi.fn(), saveProviderKey: vi.fn(), saveRoute: vi.fn() },
    vision: { analyze: vi.fn(), buildReversePrompt: vi.fn() },
    generation: { image: vi.fn(), refineImage: vi.fn(), video: vi.fn(), pollVideo: vi.fn(), jobs: vi.fn().mockResolvedValue([]) },
  };
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

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

it('Gemini 配置与真实连通状态分开显示，并保留失败原因', async () => {
  vi.mocked(window.studio.settings.providerStatus).mockResolvedValue({
    providers: [{ id: 'gemini', configured: true, capabilities: ['image', 'image_edit'] }],
    routes: { image: 'gemini', image_edit: 'gemini' },
    network: 'system_proxy',
  });
  vi.mocked(window.studio.settings.verifyProvider).mockRejectedValue(new Error('Gemini 请求超时，请检查代理设置。'));

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '设置' }));
  expect(await screen.findByText(/Gemini 图片生成与参考图修订.*已配置，尚未验证/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '测试连接' }));

  expect(await screen.findByText('Gemini 请求超时，请检查代理设置。')).toHaveAttribute('role', 'status');
  expect(screen.getByText(/Gemini 图片生成与参考图修订.*验证失败/)).toBeInTheDocument();
});

it('默认进入创作工作总览，并提供四个工作域入口与主内容区', async () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: '现在想做什么？' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '角色塑造' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '单张画面' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '剧情场景' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '系列镜头' })).toBeInTheDocument();
  expect(screen.getAllByRole('navigation', { name: '四个工作域' }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole('button', { name: '模板' }).length).toBeGreaterThan(0);
  expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  expect(screen.getByRole('button', { name: '建立项目' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: '项目名称' })).toBeInTheDocument();
});

it('项目默认方案使用选择题，并可一键保存推荐组合', async () => {
  const project = { id: 'project-choice', name: '选择题项目', medium: 'image', brief: { goal: '', audience: '', visualWorld: '', delivery: '', acceptance: '' } };
  vi.mocked(window.studio.projects.list).mockResolvedValue([project] as never);
  vi.mocked(window.studio.projects.workspace).mockResolvedValue({ project, masterAssets: [], recentGenerations: [], recentTasks: [], health: {}, pipeline: [], blockers: [], recommendedNextAction: '' } as never);
  vi.mocked(window.studio.projects.updateBrief).mockImplementation(async (_id, brief) => ({ ...project, brief }) as never);

  render(<App />);
  fireEvent.change(await screen.findByRole('combobox', { name: '当前项目' }), { target: { value: project.id } });
  const brief = await screen.findByRole('region', { name: '项目默认方案' });
  expect(brief.querySelector('textarea')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '采用推荐组合' }));
  fireEvent.click(screen.getByRole('button', { name: '保存项目默认方案' }));

  await waitFor(() => expect(window.studio.projects.updateBrief).toHaveBeenCalledWith(project.id, {
    goal: '建立可复用角色',
    audience: '竖屏漫剧',
    visualWorld: '写实东方幻想',
    delivery: '3 张候选',
    acceptance: '人物一致；真人质感；场景准确',
  }));
});

it('角色快速创作无需填写文字，选择会即时更新角色方案', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建创作任务' }));
  fireEvent.click(screen.getByRole('button', { name: '角色塑造' }));
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: '身材与衣着' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /动漫女主/ }));
  const steps = within(screen.getByRole('navigation', { name: '角色创作步骤' }));
  fireEvent.click(steps.getByRole('button', { name: /外形/ }));
  fireEvent.click(screen.getByRole('button', { name: /清冷狐系/ }));
  expect(screen.getAllByText(/22–29 岁 · 成年女性 · 清冷狐系 · 黑色长发/)).toHaveLength(2);
  expect(screen.getByRole('button', { name: /清冷狐系/ })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('textbox', { name: '身材与衣着' })).not.toBeInTheDocument();
  expect(window.studio.tasks.create).not.toHaveBeenCalled();
  expect(window.studio.generation.image).not.toHaveBeenCalled();
});

it('退出或重启应用后恢复未完成角色草稿，也可以重新开始', async () => {
  const first = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建创作任务' }));
  fireEvent.click(screen.getByRole('button', { name: '角色塑造' }));
  fireEvent.click(screen.getByRole('button', { name: /动漫女主/ }));
  await waitFor(() => expect(window.localStorage.length).toBeGreaterThan(0));
  first.unmount();

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建创作任务' }));
  fireEvent.click(screen.getByRole('button', { name: '角色塑造' }));
  expect(await screen.findByText('已恢复上次进度')).toBeInTheDocument();
  expect(screen.queryByText('已恢复上次未完成的角色方案；所有选择仍会自动保存。')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /下一步 · 基础/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /动漫女主/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: '重新开始' }));
  expect(screen.queryByText('已恢复上次进度')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /月下东方/ })).toHaveAttribute('aria-pressed', 'true');
});

it('单张画面用独立选择流程建立方案并保留用户画幅', async () => {
  vi.mocked(window.studio.tasks.create).mockImplementation(async (input) => ({
    id: 'task-image-flow', status: 'draft', createdAt: '', updatedAt: '', ...input,
  }) as never);
  vi.mocked(window.studio.creation.compilePrompt).mockResolvedValue({ positive: '单张画面方案', negative: '', modules: [] });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建创作任务' }));
  fireEvent.click(screen.getByRole('button', { name: '单张画面' }));

  expect(screen.getByRole('region', { name: '单张画面工作台' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '精细塑造' })).not.toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('navigation', { name: '快速创作步骤' })).getByRole('button', { name: /输出/ }));
  fireEvent.click(within(screen.getByRole('group', { name: '快速画面比例' })).getByRole('button', { name: '16:9' }));
  fireEvent.click(screen.getByRole('button', { name: '建立单张画面方案' }));

  await waitFor(() => expect(window.studio.tasks.create).toHaveBeenCalledWith(expect.objectContaining({
    card: expect.objectContaining({ deliveryMode: 'portrait', aspectRatio: '16:9' }),
  })));
  expect(screen.getByRole('heading', { name: '单张创作台' })).toBeInTheDocument();
  expect(window.studio.generation.image).not.toHaveBeenCalled();
});

it('角色选择完成后可直接沉淀为角色资产并进入角色中枢', async () => {
  const profile = characterFixture('guided-character', '世界探索者 · 动漫女主');
  const collection = {
    id: 'guided-character-pack',
    characterProfileId: profile.id,
    kind: 'character',
    name: `${profile.name} · 角色资产包`,
    description: '角色创建器自动建立的资产包',
    status: 'draft',
  };
  vi.mocked(window.studio.characters.create).mockResolvedValue(profile as never);
  vi.mocked(window.studio.characters.detail).mockResolvedValue({ ...profile, facts: [], variants: [], evidenceAssets: [] } as never);
  vi.mocked(window.studio.characterWorkspace.get).mockResolvedValue({
    character: { ...profile, facts: [], variants: [], evidenceAssets: [] },
    versions: [], states: [], sessions: [], media: [],
  } as never);
  vi.mocked(window.studio.collections.create).mockResolvedValue(collection as never);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建创作任务' }));
  fireEvent.click(screen.getByRole('button', { name: '角色塑造' }));
  fireEvent.click(screen.getByRole('button', { name: /动漫女主/ }));
  fireEvent.click(within(screen.getByRole('navigation', { name: '角色创作步骤' })).getByRole('button', { name: /完成/ }));
  fireEvent.click(screen.getByRole('button', { name: '保存为角色资产' }));

  await waitFor(() => expect(window.studio.characters.create).toHaveBeenCalledWith(expect.objectContaining({
    name: '世界探索者 · 动漫女主',
    lifecycle: 'draft',
    card: expect.objectContaining({
      visualPresetId: 'anime_heroine',
      characterCore: expect.objectContaining({
        roleId: 'adventurer',
        archetypeId: 'seeker',
        driveId: 'freedom',
        conflictId: 'trust_guard',
        openingId: 'first_meeting',
      }),
      appearanceProfile: expect.objectContaining({
        subjectId: 'adult_woman',
        roleId: 'adventurer',
      }),
    }),
  })));
  expect(window.studio.characters.upsertFact).toHaveBeenCalledWith(profile.id, expect.objectContaining({
    slotKey: 'identity.age',
    state: 'confirmed',
  }));
  expect(window.studio.characters.upsertFact).toHaveBeenCalledWith(profile.id, expect.objectContaining({
    slotKey: 'character.relationship',
    state: 'confirmed',
  }));
  expect(window.studio.characters.upsertFact).toHaveBeenCalledWith(profile.id, expect.objectContaining({
    slotKey: 'character.drive',
    value: '获得自由',
    state: 'confirmed',
  }));
  expect(window.studio.collections.create).toHaveBeenCalledWith(expect.objectContaining({
    characterProfileId: profile.id,
    kind: 'character',
  }));
  expect(window.studio.characterWorkspace.createState).toHaveBeenCalledWith(profile.id, expect.objectContaining({
    name: '基础状态',
    kind: 'baseline',
    status: 'active',
    trackers: expect.arrayContaining([
      expect.objectContaining({ id: 'mood', label: '心情' }),
      expect.objectContaining({ id: 'affinity', label: '关系温度', valueKind: 'scale' }),
    ]),
  }));
  expect(window.studio.tasks.create).not.toHaveBeenCalled();
  expect(window.studio.generation.image).not.toHaveBeenCalled();
  expect(await screen.findByRole('tab', { name: /创作与复用/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('region', { name: '角色资产' })).toBeInTheDocument();
  expect(await screen.findByText(new RegExp(`角色资产「${profile.name}」已建立，\\d+ 个创作选择与 4 个持续状态已归档`))).toBeInTheDocument();
});

it('选择已有角色完成塑造时直接返回角色中枢且不重复建档', async () => {
  const profile = characterFixture('existing-character', '已有东方主角');
  vi.mocked(window.studio.characters.list).mockResolvedValue([profile] as never);
  vi.mocked(window.studio.characters.detail).mockResolvedValue({ ...profile, facts: [], variants: [], evidenceAssets: [] } as never);
  vi.mocked(window.studio.characterWorkspace.get).mockResolvedValue({
    character: { ...profile, facts: [], variants: [], evidenceAssets: [] },
    versions: [], states: [], sessions: [], media: [],
  } as never);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建创作任务' }));
  fireEvent.click(screen.getByRole('button', { name: '角色塑造' }));
  fireEvent.click(screen.getByRole('button', { name: '角色资产' }));
  fireEvent.click(await screen.findByRole('option', { name: `使用角色 ${profile.name}` }));
  fireEvent.click(within(screen.getByRole('navigation', { name: '角色创作步骤' })).getByRole('button', { name: /完成/ }));
  fireEvent.click(screen.getByRole('button', { name: '进入角色中枢' }));

  expect(window.studio.characters.create).not.toHaveBeenCalled();
  expect(window.studio.collections.create).not.toHaveBeenCalled();
  expect(window.studio.generation.image).not.toHaveBeenCalled();
  expect(await screen.findByRole('tab', { name: /创作与复用/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('region', { name: '角色资产' })).toBeInTheDocument();
  expect(await screen.findByText(`已进入「${profile.name}」角色中枢，可继续扩展造型、表情、动作与剧情。`)).toBeInTheDocument();
});

it('系列镜头选择与顺序写入创作卡并控制后续候选', async () => {
  vi.mocked(window.studio.tasks.create).mockImplementation(async (input) => ({
    id: 'task-series', status: 'draft', createdAt: '', updatedAt: '', ...input,
  }) as never);
  vi.mocked(window.studio.creation.compilePrompt).mockResolvedValue({
    positive: '同一角色连续镜头', negative: '角色漂移', modules: [],
  });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建创作任务' }));
  fireEvent.click(screen.getByRole('button', { name: '系列镜头' }));
  fireEvent.click(within(screen.getByRole('navigation', { name: '快速创作步骤' })).getByRole('button', { name: /分镜/ }));
  const sequence = within(await screen.findByRole('region', { name: '连续镜头规划' }));
  fireEvent.click(sequence.getByRole('button', { name: '第 2 镜头：近景情绪' }));
  fireEvent.click(within(sequence.getByRole('group', { name: '镜头类型' })).getByRole('button', { name: /动作瞬间/ }));
  fireEvent.click(within(sequence.getByRole('group', { name: '调整镜头顺序' })).getByRole('button', { name: '后移' }));
  fireEvent.click(screen.getByRole('button', { name: '下一步 · 交付' }));
  fireEvent.click(screen.getByRole('button', { name: '建立系列镜头方案' }));

  await waitFor(() => expect(window.studio.tasks.create).toHaveBeenCalledWith(expect.objectContaining({
    card: expect.objectContaining({
      deliveryMode: 'series_pack',
      aspectRatio: '9:16',
      candidatePlan: [
        expect.objectContaining({ id: 'series_base' }),
        expect.objectContaining({ id: 'full_body' }),
        expect.objectContaining({ id: 'action_moment' }),
        expect.objectContaining({ id: 'environment_interaction' }),
      ],
    }),
  })));
  const savedSequence = within(await screen.findByRole('region', { name: '当前镜头计划' }));
  expect(screen.getByRole('heading', { name: '系列镜头台' })).toBeInTheDocument();
  expect(screen.getByText('镜头计划已保存')).toBeInTheDocument();
  expect(screen.getByText('系列镜头计划已建立')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /确认系列/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '保存为角色' })).not.toBeInTheDocument();
  expect(savedSequence.getByText('动作瞬间')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '返回调整' }));
  fireEvent.click(within(await screen.findByRole('navigation', { name: '快速创作步骤' })).getByRole('button', { name: /分镜/ }));
  expect(await screen.findByRole('button', { name: '第 3 镜头：动作瞬间' })).toBeInTheDocument();
});

it('剧情场景选择形成可回溯叙事骨架并进入场景创作台', async () => {
  const scene = {
    id: 'scene-story', name: '东方古风 · 局势反转', kind: 'environment', lifecycle: 'draft',
    anchor: '真实东方古风环境', layout: '全身构图', materials: '真实摄影', colorSystem: '危险逼近',
    requiredElements: '正面对峙；局势反转', forbiddenChanges: '人物身份保持一致', createdAt: '', updatedAt: '',
  };
  const sceneState = {
    id: 'scene-state-story', profileId: scene.id, name: '局势反转 · 危险逼近', status: 'active',
    timeOfDay: '', weather: '', season: '', lighting: '电影光影', atmosphere: '危险逼近',
    setDressing: '真实东方古风环境', continuityNotes: '人物身份保持一致', createdAt: '', updatedAt: '',
  };
  vi.mocked(window.studio.sceneWorkspace.create).mockResolvedValue(scene as never);
  vi.mocked(window.studio.sceneWorkspace.createState).mockResolvedValue(sceneState as never);
  vi.mocked(window.studio.sceneWorkspace.get).mockResolvedValue({
    scene, versions: [], states: [sceneState], sessions: [], media: [], activeState: sceneState,
  } as never);
  vi.mocked(window.studio.tasks.create).mockImplementation(async (input) => ({
    id: 'task-story', status: 'draft', createdAt: '', updatedAt: '', ...input,
  }) as never);
  vi.mocked(window.studio.creation.compilePrompt).mockResolvedValue({
    positive: '正面对峙时局势反转', negative: '人物关系不清', modules: [],
  });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建创作任务' }));
  fireEvent.click(screen.getByRole('button', { name: '剧情场景' }));
  fireEvent.click(within(screen.getByRole('navigation', { name: '快速创作步骤' })).getByRole('button', { name: /剧情/ }));
  const story = within(await screen.findByRole('region', { name: '剧情骨架' }));
  fireEvent.click(story.getByRole('button', { name: '正面对峙' }));
  fireEvent.click(story.getByRole('button', { name: '局势反转' }));
  fireEvent.click(story.getByRole('button', { name: '情绪峰值' }));
  fireEvent.click(story.getByRole('button', { name: '危险逼近' }));
  fireEvent.click(screen.getByRole('button', { name: '下一步 · 输出' }));
  fireEvent.click(screen.getByRole('button', { name: '建立剧情场景方案' }));

  await waitFor(() => expect(window.studio.tasks.create).toHaveBeenCalledWith(expect.objectContaining({
    card: expect.objectContaining({
      deliveryMode: 'story_scene',
      aspectRatio: '16:9',
      sceneProfileId: scene.id,
      storyPlan: {
        relationshipId: 'confrontation',
        momentId: 'reversal',
        pacingId: 'peak',
        atmosphereId: 'danger',
      },
      scene: expect.stringContaining('局势突然反转'),
    }),
  })));
  expect(window.studio.sceneWorkspace.create).toHaveBeenCalledWith(expect.objectContaining({
    name: '东方古风 · 局势反转',
    lifecycle: 'draft',
  }));
  expect(window.studio.sceneWorkspace.createState).toHaveBeenCalledWith(scene.id, expect.objectContaining({
    name: '局势反转 · 危险逼近',
    status: 'active',
  }));
  expect(screen.getByRole('heading', { name: '场景创作台' })).toBeInTheDocument();
  expect(screen.getAllByText('剧情场景与场景资产已建立')).toHaveLength(2);
  expect(screen.getByRole('button', { name: /确认剧情/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '查看场景资产' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '保存为角色' })).not.toBeInTheDocument();
  expect(screen.getByText('正面对峙')).toBeInTheDocument();
  expect(screen.getByText('局势反转')).toBeInTheDocument();
  expect(screen.getByText('情绪峰值')).toBeInTheDocument();
  expect(screen.getByText('危险逼近')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '返回调整' }));
  fireEvent.click(within(await screen.findByRole('navigation', { name: '快速创作步骤' })).getByRole('button', { name: /剧情/ }));
  const restored = within(await screen.findByRole('region', { name: '剧情骨架' }));
  expect(restored.getByRole('button', { name: '正面对峙' })).toHaveAttribute('aria-pressed', 'true');
  expect(restored.getByRole('button', { name: '局势反转' })).toHaveAttribute('aria-pressed', 'true');
});

it('重新打开剧情任务时恢复场景资产、场景状态与专属操作', async () => {
  const project = { id: 'project-scene-task', name: '剧情任务项目', medium: 'image', brief: { goal: '', audience: '', visualWorld: '', delivery: '', acceptance: '' } };
  const scene = {
    id: 'scene-restored', projectId: project.id, name: '雨夜温室 · 真相揭晓', kind: 'interior', lifecycle: 'draft',
    anchor: '玻璃温室中轴', layout: '中央石板路', materials: '潮湿玻璃', colorSystem: '冷蓝',
    requiredElements: '拱形门', forbiddenChanges: '不改变空间中轴', createdAt: '', updatedAt: '',
  };
  const sceneState = {
    id: 'scene-state-restored', profileId: scene.id, name: '真相揭晓 · 雨夜', status: 'active',
    timeOfDay: '深夜', weather: '小雨', season: '', lighting: '冷月光', atmosphere: '水汽',
    setDressing: '散落信件', continuityNotes: '保持地面潮湿', createdAt: '', updatedAt: '',
  };
  const sceneWorkspace = { scene, versions: [], states: [sceneState], sessions: [], media: [], activeState: sceneState };
  const task = {
    id: 'task-scene-restored', projectId: project.id, name: '雨夜温室真相揭晓', objective: '完成剧情场景',
    status: 'ready', collectionIds: [], createdAt: '', updatedAt: '',
    card: {
      projectId: project.id, intent: '剧情场景', subject: '成年原创角色', identityAnchor: '', bodyAndWardrobe: '',
      expressionAndPose: '发现线索', scene: '玻璃温室中轴', lighting: '冷月光', camera: '中景', style: '写实电影感',
      avoid: '文字、水印', mustKeep: '人物与空间连续', aspectRatio: '16:9', referenceAssetIds: [],
      deliveryMode: 'story_scene', sceneProfileId: scene.id,
      storyPlan: { relationshipId: 'confrontation', momentId: 'reveal', pacingId: 'peak', atmosphereId: 'mystery' },
    },
  };
  vi.mocked(window.studio.projects.list).mockResolvedValue([project] as never);
  vi.mocked(window.studio.projects.workspace).mockResolvedValue({ project, masterAssets: [], recentGenerations: [], recentTasks: [task], health: {}, pipeline: [], blockers: [], recommendedNextAction: '' } as never);
  vi.mocked(window.studio.tasks.list).mockResolvedValue([task] as never);
  vi.mocked(window.studio.sceneWorkspace.list).mockResolvedValue([scene] as never);
  vi.mocked(window.studio.sceneWorkspace.get).mockResolvedValue(sceneWorkspace as never);

  render(<App />);
  fireEvent.change(await screen.findByRole('combobox', { name: '当前项目' }), { target: { value: project.id } });
  fireEvent.click(await screen.findByRole('button', { name: /雨夜温室真相揭晓/ }));

  expect(await screen.findByRole('heading', { name: '场景创作台' })).toBeInTheDocument();
  expect(screen.getByText('本轮锁定场景')).toBeInTheDocument();
  expect(screen.getByText(scene.name)).toBeInTheDocument();
  expect(screen.getByText(new RegExp(sceneState.name), { selector: 'p' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '查看场景资产' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '保存为角色' })).not.toBeInTheDocument();
  expect(window.studio.sceneWorkspace.get).toHaveBeenCalledWith(scene.id);
});

it('创作方案可单独保存且主流程不暴露模型状态', async () => {
  vi.mocked(window.studio.settings.providerStatus).mockResolvedValue({
    providers: [{ id: 'gemini', configured: true, capabilities: ['text', 'vision', 'image', 'image_edit'] }],
    routes: { vision: 'gemini', image: 'gemini', image_edit: 'gemini', video: 'gemini', text: 'gemini' },
  } as never);
  vi.mocked(window.studio.tasks.create).mockImplementation(async (input) => ({
    id: 'task-save-only', status: 'draft', createdAt: '', updatedAt: '', ...input,
  }) as never);
  vi.mocked(window.studio.creation.compilePrompt).mockResolvedValue({ positive: '已保存方案', negative: '', modules: [] });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建创作任务' }));
  fireEvent.click(screen.getByRole('button', { name: '角色塑造' }));
  fireEvent.click(screen.getByRole('button', { name: '精细塑造' }));
  fireEvent.click(screen.getByRole('button', { name: '8 确认方案 总览、交付与锁定' }));
  expect(await screen.findByText('角色资产已就绪')).toBeInTheDocument();
  expect(screen.queryByText(/图片模型|模型设置|连接模型/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '保存方案' }));

  expect(await screen.findByText('方案已保存，可继续调整；点击“进入创作台”后再创建候选。')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: '角色塑造工作台' })).toBeInTheDocument();
  expect(window.studio.tasks.create).toHaveBeenCalledTimes(1);
  expect(window.studio.generation.image).not.toHaveBeenCalled();
});

it('没有图片模型时也能沿创作进度进入局部调整并保存本地方案', async () => {
  vi.mocked(window.studio.settings.providerStatus).mockResolvedValue({
    providers: [], routes: { vision: 'none', image: 'none', image_edit: 'none', video: 'none', text: 'none' },
  } as never);
  const task = { id: 'task-local-flow', status: 'draft', createdAt: '', updatedAt: '' };
  vi.mocked(window.studio.tasks.create).mockImplementation(async (input) => ({ ...task, ...input }) as never);
  vi.mocked(window.studio.tasks.update).mockImplementation(async (_id, patch) => ({ ...task, ...patch }) as never);
  vi.mocked(window.studio.creation.compilePrompt).mockResolvedValue({ positive: '本地方案', negative: '', modules: [] });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建创作任务' }));
  fireEvent.click(screen.getByRole('button', { name: '单张画面' }));
  fireEvent.click(within(screen.getByRole('navigation', { name: '快速创作步骤' })).getByRole('button', { name: /输出/ }));
  fireEvent.click(screen.getByRole('button', { name: '建立单张画面方案' }));
  await screen.findByRole('heading', { name: '单张创作台' });

  const journey = within(screen.getByRole('navigation', { name: '创作进度' }));
  fireEvent.click(journey.getByRole('button', { name: /局部调整/ }));
  expect(await screen.findByRole('heading', { name: '一次只调整一个变量' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '换表情 身份、造型和场景不变' }));
  fireEvent.click(screen.getByRole('button', { name: '应用到当前方案' }));

  await waitFor(() => expect(window.studio.tasks.update).toHaveBeenCalledWith('task-local-flow', expect.objectContaining({
    card: expect.objectContaining({ expressionAndPose: expect.stringContaining('只改变面部表情') }),
  })));
  expect(await screen.findByText('已把“换表情”写入当前方案；没有调用任何模型。')).toBeInTheDocument();
  expect(window.studio.generation.image).not.toHaveBeenCalled();
});

it('没有图片模型时可完成方向比较、局部调整和方案资产保存', async () => {
  vi.mocked(window.studio.settings.providerStatus).mockResolvedValue({
    providers: [], routes: { vision: 'none', image: 'none', image_edit: 'none', video: 'none', text: 'none' },
  } as never);
  const task = { id: 'task-local-complete', status: 'draft', createdAt: '', updatedAt: '' };
  vi.mocked(window.studio.tasks.create).mockImplementation(async (input) => ({ ...task, ...input }) as never);
  vi.mocked(window.studio.tasks.update).mockImplementation(async (_id, patch) => ({ ...task, ...patch }) as never);
  vi.mocked(window.studio.creation.compilePrompt).mockResolvedValue({ positive: '本地完整方案', negative: '', modules: [] });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建创作任务' }));
  fireEvent.click(screen.getByRole('button', { name: '单张画面' }));
  fireEvent.click(within(screen.getByRole('navigation', { name: '快速创作步骤' })).getByRole('button', { name: /输出/ }));
  fireEvent.click(screen.getByRole('button', { name: '建立单张画面方案' }));
  await screen.findByRole('heading', { name: '单张创作台' });
  fireEvent.click(screen.getByRole('button', { name: '下一步 · 选择方向' }));

  expect(await screen.findByRole('region', { name: '方案方向候选' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /构图备选/ }));
  fireEvent.click(screen.getByRole('button', { name: '确认方向 · 继续调整' }));
  expect(await screen.findByText('已选择“构图备选”并写入本地方案；没有调用任何模型。')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '换镜头 内容不变，只换景别机位' }));
  fireEvent.click(screen.getByRole('button', { name: '应用到当前方案' }));
  expect(await screen.findByText('已把“换镜头”写入当前方案；没有调用任何模型。')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '完成调整 · 保存资产' }));

  expect(await screen.findByRole('heading', { name: '单张画面方案已经归档' })).toBeInTheDocument();
  expect(screen.getByText('人物、场景、构图和本轮调整已保存，可从同一方案继续创作。')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '保存创作任务' }));
  expect(await screen.findByText(/当前创作任务已保存/)).toBeInTheDocument();
  expect(window.studio.generation.image).not.toHaveBeenCalled();
});

it('已确认候选可沉淀为角色资产并回写当前创作任务', async () => {
  const project = { id: 'project-character', name: '角色项目', medium: 'image', brief: { goal: '', audience: '', visualWorld: '', delivery: '', acceptance: '' } };
  const candidate = {
    id: 'candidate-character', type: 'image', name: '角色候选', managedPath: '/tmp/character.png', sha256: 'character', mediaType: 'image/png',
    rightsStatus: 'original', confirmation: 'confirmed', metadata: {}, createdAt: '2026-01-01', updatedAt: '2026-01-01',
  };
  const task = {
    id: 'task-character', projectId: project.id, name: '月下角色定妆', objective: '建立长期角色', status: 'review', collectionIds: [],
    card: { ...characterFixture('unused', 'unused').card, projectId: project.id, intent: '月下角色定妆', referenceBindings: [] },
    resultAssetId: candidate.id, createdAt: '', updatedAt: '',
  };
  const profile = { ...characterFixture('character-created', '月下角色定妆 · 角色'), projectId: project.id, masterAssetId: candidate.id };
  const collection = { id: 'collection-created', projectId: project.id, characterProfileId: profile.id, kind: 'character', name: `${profile.name} · 角色资产包`, description: '', status: 'draft', createdAt: '', updatedAt: '' };
  vi.mocked(window.studio.projects.list).mockResolvedValue([project] as never);
  vi.mocked(window.studio.projects.workspace).mockResolvedValue({ project, masterAssets: [], recentGenerations: [], recentTasks: [], health: {} } as never);
  vi.mocked(window.studio.tasks.list).mockResolvedValue([task] as never);
  vi.mocked(window.studio.assets.list).mockResolvedValue([candidate] as never);
  vi.mocked(window.studio.assets.preview).mockResolvedValue('data:image/png;base64,AA==');
  vi.mocked(window.studio.characters.create).mockResolvedValue(profile as never);
  vi.mocked(window.studio.collections.create).mockResolvedValue(collection as never);
  vi.mocked(window.studio.tasks.update).mockImplementation(async (_id, patch) => ({ ...task, ...patch }) as never);

  render(<App />);
  fireEvent.change(await screen.findByRole('combobox', { name: '当前项目' }), { target: { value: project.id } });
  fireEvent.click(await screen.findByRole('button', { name: /月下角色定妆/ }));
  expect(await screen.findByRole('button', { name: '沉淀为角色资产' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '沉淀为角色资产' }));

  await waitFor(() => expect(window.studio.characters.create).toHaveBeenCalledWith(expect.objectContaining({
    projectId: project.id,
    masterAssetId: candidate.id,
    card: expect.objectContaining({ referenceAssetIds: expect.arrayContaining([candidate.id]) }),
  })));
  expect(window.studio.collections.attachAsset).toHaveBeenCalledWith(collection.id, candidate.id, '角色主参考');
  expect(window.studio.tasks.update).toHaveBeenCalledWith(task.id, expect.objectContaining({
    characterProfileId: profile.id,
    collectionIds: [collection.id],
    resultAssetId: candidate.id,
  }));
  expect(await screen.findByText(`已建立角色资产「${profile.name}」，主参考、资产包与当前创作任务已联动。`)).toBeInTheDocument();
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
  fireEvent.click(screen.getByRole('button', { name: '更多设置' }));
  expect(screen.getByRole('textbox', { name: '场景' })).toHaveValue('狭长中轴温室；中央石板路；拱形门；深夜；小雨；玻璃水汽');
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
  fireEvent.click(screen.getByRole('button', { name: '建立项目' }));
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
  fireEvent.click(await screen.findByRole('button', { name: '打开角色 蝶灵' }));
  fireEvent.click(await screen.findByRole('button', { name: '创建角色设定板' }));

  await waitFor(() => expect(window.studio.tasks.create).toHaveBeenCalledWith(expect.objectContaining({
    characterProfileId: 'char-sheet',
    card: expect.objectContaining({ aspectRatio: '4:3', referenceAssetIds: ['master-1'] }),
  })));
  expect(await screen.findByRole('heading', { name: '蝶灵 · 角色设定板' })).toBeInTheDocument();
});

it('角色工作室通过选择题建立可追溯的表情组任务', async () => {
  const profile = { ...characterFixture('char-extension', '蝶灵'), masterAssetId: 'master-1' };
  const detail = {
    ...profile,
    facts: [],
    variants: [],
    evidenceAssets: [{
      id: 'master-1', type: 'reference_image', name: '角色主参考', managedPath: '/tmp/master.png', sha256: 'master', mediaType: 'image/png',
      rightsStatus: 'original', confirmation: 'confirmed', metadata: {}, createdAt: '', updatedAt: '',
    }],
  };
  const version = {
    id: 'version-1', profileId: profile.id, versionNumber: 1, label: '正式定妆', status: 'locked', changeSummary: '',
    snapshot: { name: profile.name, card: profile.card, specification: profile.specification, masterAssetId: 'master-1', facts: [], variants: [] }, createdAt: '',
  };
  const state = {
    id: 'state-1', profileId: profile.id, versionId: version.id, name: '基础状态', kind: 'baseline', status: 'active',
    wardrobe: '粉色礼服', hair: '黑色盘发', expression: '', pose: '', scene: '', emotion: '', continuityNotes: '发型与礼服保持一致', createdAt: '', updatedAt: '',
  };
  const workspace = { character: detail, versions: [version], states: [state], sessions: [], media: [], activeVersion: version, activeState: state };
  vi.mocked(window.studio.characters.list).mockResolvedValue([profile] as never);
  vi.mocked(window.studio.characters.detail).mockResolvedValue(detail as never);
  vi.mocked(window.studio.characterWorkspace.get).mockResolvedValue(workspace as never);
  vi.mocked(window.studio.tasks.create).mockImplementation(async (input) => ({
    id: 'task-expression', status: 'draft', createdAt: '', updatedAt: '', ...input,
  }) as never);
  vi.mocked(window.studio.creation.compilePrompt).mockResolvedValue({ positive: '同一角色表情组', negative: '身份漂移', modules: [] });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(await screen.findByRole('button', { name: '打开角色 蝶灵' }));
  fireEvent.click(await screen.findByRole('radio', { name: /表情组/ }));
  fireEvent.click(screen.getByRole('button', { name: '进入表情组工作台' }));

  await waitFor(() => expect(window.studio.tasks.create).toHaveBeenCalledWith(expect.objectContaining({
    characterProfileId: profile.id,
    name: '蝶灵 · 表情组',
    card: expect.objectContaining({
      deliveryMode: 'character_sheet',
      aspectRatio: '4:3',
      referenceAssetIds: ['master-1'],
      characterExtension: {
        kind: 'expression_set', sourceCharacterId: profile.id, sourceVersionId: version.id, sourceStateId: state.id,
      },
      candidatePlan: expect.arrayContaining([expect.objectContaining({ label: '平静' }), expect.objectContaining({ label: '坚定' })]),
    }),
  })));
  expect(await screen.findByText('本轮锁定角色')).toBeInTheDocument();
  expect(screen.getAllByText('蝶灵 · 表情组').length).toBeGreaterThan(0);
  const executionPlan = within(screen.getByRole('region', { name: '当前执行计划' }));
  expect(executionPlan.getByText('平静')).toBeInTheDocument();
  expect(executionPlan.getByText('坚定')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: '创作方案' }).querySelector('.creation-plan-visual-header')).toHaveClass('without-cover');
  expect(window.studio.generation.image).not.toHaveBeenCalled();
});

it('角色剧情方向无需模型即可沉淀为场景资产', async () => {
  const profile = {
    ...characterFixture('char-story-extension', '月下东方'),
    masterAssetId: 'master-story',
    card: {
      ...characterFixture('char-story-extension', '月下东方').card,
      visualPresetId: 'oriental_moon',
      scene: '深夜东方幻想庭院',
      lighting: '冷月光',
      camera: '中景叙事镜头',
      style: '电影级真实材质',
      mustKeep: '角色脸部与主造型不变',
      referenceAssetIds: ['master-story'],
    },
  };
  const detail = { ...profile, facts: [], variants: [], evidenceAssets: [] };
  const workspace = { character: detail, versions: [], states: [], sessions: [], media: [] };
  const task = {
    id: 'task-story-extension', characterProfileId: profile.id, name: '月下东方 · 剧情场景', objective: '剧情场景',
    status: 'draft', collectionIds: [], card: profile.card, createdAt: '', updatedAt: '',
  };
  const scene = {
    id: 'scene-from-role', name: '月下东方 · 开场建立', kind: 'fantasy', lifecycle: 'draft',
    anchor: profile.card.scene, layout: profile.card.camera, materials: profile.card.style, colorSystem: profile.card.lighting,
    requiredElements: '开场建立', forbiddenChanges: profile.card.mustKeep, createdAt: '', updatedAt: '',
  };
  const sceneState = {
    id: 'scene-state-from-role', profileId: scene.id, name: '开场建立', status: 'active',
    timeOfDay: '', weather: '', season: '', lighting: profile.card.lighting, atmosphere: '',
    setDressing: profile.card.scene, continuityNotes: profile.card.mustKeep, createdAt: '', updatedAt: '',
  };
  vi.mocked(window.studio.characters.list).mockResolvedValue([profile] as never);
  vi.mocked(window.studio.characters.detail).mockResolvedValue(detail as never);
  vi.mocked(window.studio.characterWorkspace.get).mockResolvedValue(workspace as never);
  vi.mocked(window.studio.tasks.create).mockImplementation(async (input) => ({ ...task, ...input }) as never);
  vi.mocked(window.studio.tasks.update).mockImplementation(async (_id, patch) => ({ ...task, ...patch }) as never);
  vi.mocked(window.studio.creation.compilePrompt).mockResolvedValue({ positive: '角色剧情场景', negative: '身份漂移', modules: [] });
  vi.mocked(window.studio.sceneWorkspace.create).mockResolvedValue(scene as never);
  vi.mocked(window.studio.sceneWorkspace.createState).mockResolvedValue(sceneState as never);
  vi.mocked(window.studio.sceneWorkspace.get).mockResolvedValue({ scene, versions: [], states: [sceneState], sessions: [], media: [], activeState: sceneState } as never);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(await screen.findByRole('button', { name: '打开角色 月下东方' }));
  fireEvent.click(await screen.findByRole('radio', { name: /剧情场景/ }));
  fireEvent.click(screen.getByRole('button', { name: '进入剧情场景工作台' }));
  expect(await screen.findByRole('button', { name: '请先选择场景' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /幻想世界/ }));
  fireEvent.click(await screen.findByRole('button', { name: '下一步 · 选择方向' }));
  fireEvent.click(screen.getByRole('button', { name: /确认方向 · 继续调整/ }));

  expect(await screen.findByRole('button', { name: /情绪强度/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /剧情动作/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /应用到当前方案/ }));
  fireEvent.click(await screen.findByRole('button', { name: /完成调整 · 保存资产/ }));
  expect(await screen.findByRole('button', { name: '保存为场景资产' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '保存为场景资产' }));

  await waitFor(() => expect(window.studio.sceneWorkspace.create).toHaveBeenCalledWith(expect.objectContaining({
    name: '月下东方 · 开场建立',
    kind: 'fantasy',
    lifecycle: 'draft',
    requiredElements: expect.stringContaining('开场建立'),
  })));
  expect(window.studio.sceneWorkspace.createState).toHaveBeenCalledWith(scene.id, expect.objectContaining({
    name: expect.stringContaining('开场建立'),
    status: 'active',
  }));
  expect(window.studio.tasks.update).toHaveBeenCalledWith(task.id, expect.objectContaining({
    card: expect.objectContaining({ sceneProfileId: scene.id }),
  }));
  expect(await screen.findByRole('button', { name: '查看场景资产' })).toBeInTheDocument();
  expect(window.studio.generation.image).not.toHaveBeenCalled();
});

it('角色档案能展开用途化细项、编辑脸型并绑定素材证据', async () => {
  const profile = {
    id: 'char-1', name: '蝶灵', group: 'lead', lifecycle: 'draft', createdAt: '', updatedAt: '',
    card: { intent: '', subject: '成年女性', identityAnchor: '', bodyAndWardrobe: '', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '', avoid: '', aspectRatio: '2:3', referenceAssetIds: [] },
    specification: { identityLocks: [], wardrobeLocks: [], visualMotifs: [], forbiddenChanges: [], requiredAssetKinds: [] },
  };
  vi.mocked(window.studio.characters.list).mockResolvedValue([profile as never]);
  vi.mocked(window.studio.characters.detail).mockResolvedValue({ ...profile, facts: [], variants: [], evidenceAssets: [{ id: 'ref-1', name: '正面参考', confirmation: 'confirmed', rightsStatus: 'authorized' }] } as never);
  vi.mocked(window.studio.characterWorkspace.get).mockResolvedValue({
    character: { ...profile, facts: [], variants: [], evidenceAssets: [] },
    versions: [], states: [], sessions: [], media: [],
  } as never);
  vi.mocked(window.studio.characters.upsertFact).mockResolvedValue({ ...profile, facts: [], variants: [], evidenceAssets: [] } as never);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(await screen.findByRole('button', { name: '打开角色 蝶灵' }));
  expect(await screen.findByRole('tab', { name: /创作与复用/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByRole('heading', { name: '角色完整度地图' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: /细节设定/ }));
  expect(await screen.findByRole('heading', { name: '角色完整度地图' })).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: '面部五官' }));
  fireEvent.change(screen.getByRole('textbox', { name: '脸型描述' }), { target: { value: '柔和鹅蛋脸' } });
  fireEvent.click(screen.getByRole('button', { name: '确认脸型' }));
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
  fireEvent.click(await screen.findByRole('button', { name: '打开角色 蝶灵' }));
  await screen.findByRole('tab', { name: /创作与复用/ });
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
  expect(await screen.findByText(/绑定主参考图「可用正面参考」/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: /细节设定/ }));
  fireEvent.click(screen.getByRole('button', { name: '角度与局部参考' }));
  expect((await screen.findAllByRole('button', { name: '可用正面参考' })).length).toBeGreaterThan(0);
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
  vi.mocked(window.studio.tasks.create).mockImplementation(async (input) => ({ id: 'task-new', status: 'draft', createdAt: '', updatedAt: '', ...input }) as never);
  vi.mocked(window.studio.creation.compilePrompt).mockResolvedValue({ positive: '人物创作', negative: '', modules: [] });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  fireEvent.click(screen.getByRole('button', { name: '素材库' }));
  fireEvent.click(await screen.findByRole('heading', { name }));
  fireEvent.click(screen.getByRole('button', { name: '创作' }));
  fireEvent.click(screen.getByRole('button', { name: '新建创作任务' }));
  fireEvent.click(screen.getByRole('button', { name: '角色塑造' }));
  fireEvent.click(within(screen.getByRole('navigation', { name: '角色创作步骤' })).getByRole('button', { name: /完成/ }));
  fireEvent.click(screen.getByRole('button', { name: '保存为角色资产' }));
  await waitFor(() => expect(window.studio.characters.create).toHaveBeenCalledWith(expect.objectContaining({ masterAssetId: undefined })));
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
  vi.mocked(window.studio.characterWorkspace.get).mockImplementation(async (id) => ({
    character: { ...(id === 'char-a' ? first : second), facts: [], variants: [], evidenceAssets: [] },
    versions: [], states: [], sessions: [], media: [],
  }) as never);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  await screen.findByRole('button', { name: '打开角色 甲角色' });
  fireEvent.click(screen.getByRole('button', { name: '打开角色 乙角色' }));
  await act(async () => { b.resolve({ ...second, facts: [], variants: [], evidenceAssets: [] } as never); });
  fireEvent.click(await screen.findByRole('tab', { name: /细节设定/ }));
  expect(screen.getByRole('heading', { name: '乙角色 · 素材完整度' })).toBeInTheDocument();
  await act(async () => { a.resolve({ ...first, facts: [], variants: [], evidenceAssets: [] } as never); });
  expect(screen.getByRole('heading', { name: '乙角色 · 素材完整度' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '甲角色 · 素材完整度' })).not.toBeInTheDocument();
});

it('角色切换期间旧角色保存的结果不能写入当前详情', async () => {
  const first = characterFixture('char-a', '甲角色');
  const second = characterFixture('char-b', '乙角色');
  const pendingSave = deferred<never>();
  vi.mocked(window.studio.characters.list).mockResolvedValue([first, second] as never);
  vi.mocked(window.studio.characters.detail).mockImplementation(async (id) => ({ ...(id === 'char-a' ? first : second), facts: [], variants: [], evidenceAssets: [] }) as never);
  vi.mocked(window.studio.characterWorkspace.get).mockImplementation(async (id) => ({
    character: { ...(id === 'char-a' ? first : second), facts: [], variants: [], evidenceAssets: [] },
    versions: [], states: [], sessions: [], media: [],
  }) as never);
  vi.mocked(window.studio.characters.upsertFact).mockReturnValue(pendingSave.promise);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '资产' }));
  await screen.findByRole('button', { name: '打开角色 甲角色' });
  fireEvent.click(await screen.findByRole('tab', { name: /细节设定/ }));
  await screen.findByRole('heading', { name: '甲角色 · 素材完整度' });
  fireEvent.change(screen.getByRole('textbox', { name: '成年年龄段描述' }), { target: { value: '已成年' } });
  fireEvent.click(screen.getByRole('button', { name: '确认成年年龄段' }));
  expect(window.studio.characters.upsertFact).toHaveBeenCalledWith('char-a', expect.anything());
  fireEvent.click(screen.getByRole('button', { name: '打开角色 乙角色' }));
  expect(screen.queryByRole('heading', { name: '甲角色 · 素材完整度' })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('tab', { name: /细节设定/ }));
  await screen.findByRole('heading', { name: '乙角色 · 素材完整度' });
  await act(async () => { pendingSave.resolve({ ...first, facts: [], variants: [], evidenceAssets: [] } as never); });
  expect(screen.getByRole('heading', { name: '乙角色 · 素材完整度' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: '成年年龄段描述' }), { target: { value: '乙角色设定' } });
  fireEvent.click(screen.getByRole('button', { name: '确认成年年龄段' }));
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
  expect(screen.queryByRole('textbox', { name: '必须保持' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '精细塑造' })).not.toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('navigation', { name: '快速创作步骤' })).getByRole('button', { name: /输出/ }));
  expect(screen.getByRole('button', { name: '锁定脸部' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: '锁定服装' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.queryByText('旧档案中的未核验脸型')).not.toBeInTheDocument();
});

it('使用已存角色创建方案时保留角色身份，不被入口默认外貌覆盖', async () => {
  const source = {
    ...characterFixture('char-locked', '锁定角色'),
    card: {
      ...characterFixture('char-locked', '锁定角色').card,
      subject: '明确锁定的成年原创角色',
      identityAnchor: '固定的脸部结构与银色短发',
    },
  };
  vi.mocked(window.studio.characters.list).mockResolvedValue([source] as never);
  vi.mocked(window.studio.characters.detail).mockResolvedValue({ ...source, facts: [], variants: [], evidenceAssets: [] } as never);
  vi.mocked(window.studio.tasks.create).mockImplementation(async (input) => ({
    id: 'task-locked', status: 'draft', createdAt: '', updatedAt: '', ...input,
  }) as never);
  vi.mocked(window.studio.creation.compilePrompt).mockResolvedValue({ positive: '锁定角色方案', negative: '', modules: [] });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建创作任务' }));
  fireEvent.click(screen.getByRole('button', { name: '角色塑造' }));
  fireEvent.click(screen.getByRole('button', { name: '角色资产' }));
  fireEvent.click(await screen.findByRole('option', { name: `使用角色 ${source.name}` }));
  fireEvent.click(screen.getByRole('button', { name: '精细塑造' }));
  fireEvent.click(screen.getByRole('button', { name: '8 确认方案 总览、交付与锁定' }));
  fireEvent.click(screen.getByRole('button', { name: '保存方案' }));

  await waitFor(() => expect(window.studio.tasks.create).toHaveBeenCalledWith(expect.objectContaining({
    characterProfileId: source.id,
    card: expect.objectContaining({
      subject: '锁定角色',
      identityAnchor: expect.stringContaining('人物脸部结构'),
      mustKeep: expect.stringContaining('沿用角色「锁定角色」的身份结构'),
    }),
  })));
  const created = vi.mocked(window.studio.tasks.create).mock.calls.at(-1)?.[0];
  expect(created?.card.subject).not.toContain('东亚人物特征');
  expect(created?.card.subject).not.toContain('冷调象牙白肤色');
});

it('参考图与场景资产进入同一方案时分别绑定身份和场景角色', async () => {
  const identityAsset = { id: 'identity-ref', name: '角色正面基准', type: 'reference_image', mediaType: 'image/png', confirmation: 'confirmed', rightsStatus: 'authorized', metadata: {} };
  const sceneAsset = { id: 'scene-ref', name: '雨夜温室基准', type: 'reference_image', mediaType: 'image/png', confirmation: 'confirmed', rightsStatus: 'original', metadata: {} };
  const scene = { id: 'scene-profile', name: '雨夜温室', kind: 'interior', lifecycle: 'confirmed', anchor: '玻璃温室中轴', layout: '中央石板路', materials: '潮湿玻璃', colorSystem: '冷蓝', requiredElements: '拱形门', forbiddenChanges: '不改变中轴', createdAt: '', updatedAt: '' };
  vi.mocked(window.studio.assets.list).mockResolvedValue([identityAsset, sceneAsset] as never);
  vi.mocked(window.studio.assets.preview).mockResolvedValue('' as never);
  vi.mocked(window.studio.sceneWorkspace.list).mockResolvedValue([scene] as never);
  vi.mocked(window.studio.sceneWorkspace.get).mockResolvedValue({
    scene, versions: [], states: [], sessions: [], activeVersion: undefined, activeState: undefined,
    media: [{ assetId: sceneAsset.id, asset: sceneAsset, role: 'reference' }],
  } as never);
  vi.mocked(window.studio.tasks.create).mockImplementation(async (input) => ({
    id: 'task-references', status: 'draft', createdAt: '', updatedAt: '', ...input,
  }) as never);
  vi.mocked(window.studio.creation.compilePrompt).mockResolvedValue({ positive: '参考图方案', negative: '', modules: [] });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建创作任务' }));
  fireEvent.click(screen.getByRole('button', { name: '角色塑造' }));
  fireEvent.click(screen.getByRole('button', { name: '参考图' }));
  fireEvent.click(await screen.findByRole('option', { name: `使用参考图 ${identityAsset.name}` }));
  fireEvent.click(screen.getByRole('button', { name: '精细塑造' }));
  fireEvent.click(screen.getByRole('button', { name: '6 造型场景 身份、造型与场景' }));
  fireEvent.click(screen.getByRole('option', { name: `使用场景 ${scene.name}` }));
  fireEvent.click(screen.getByRole('button', { name: '8 确认方案 总览、交付与锁定' }));
  fireEvent.click(screen.getByRole('button', { name: '保存方案' }));

  await waitFor(() => expect(window.studio.tasks.create).toHaveBeenCalled());
  const created = vi.mocked(window.studio.tasks.create).mock.calls.at(-1)?.[0];
  expect(created?.card.subject).toContain('按参考图「角色正面基准」锁定人物');
  expect(created?.card.subject).not.toContain('东亚人物特征');
  expect(created?.card.referenceBindings).toEqual(expect.arrayContaining([
    { assetId: identityAsset.id, role: 'identity', priority: 'primary' },
    { assetId: sceneAsset.id, role: 'scene', priority: 'support' },
  ]));
});

it('引导流程快速切角色时不显示另一角色的变体选项', async () => {
  const first = characterFixture('char-a', '甲角色');
  const second = characterFixture('char-b', '乙角色');
  const a = deferred<never>(); const b = deferred<never>();
  vi.mocked(window.studio.characters.list).mockResolvedValue([first, second] as never);
  vi.mocked(window.studio.characters.detail).mockImplementation((id) => id === 'char-a' ? a.promise : b.promise);
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建创作任务' }));
  fireEvent.click(screen.getByRole('button', { name: '角色塑造' }));
  fireEvent.click(screen.getByRole('button', { name: '角色资产' }));
  fireEvent.click(await screen.findByRole('option', { name: '使用角色 甲角色' }));
  await waitFor(() => expect(window.studio.characters.detail).toHaveBeenCalledWith('char-a'));
  fireEvent.click(screen.getByRole('option', { name: '使用角色 乙角色' }));
  await waitFor(() => expect(window.studio.characters.detail).toHaveBeenCalledWith('char-b'));
  await act(async () => { b.resolve({ ...second, facts: [], evidenceAssets: [], variants: [{ id: 'look-b', profileId: 'char-b', kind: 'look', name: '乙造型' }] } as never); });
  fireEvent.click(screen.getByRole('button', { name: '选择造型、表情和动作' }));
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
  fireEvent.click(screen.getByRole('button', { name: '角色塑造' }));
  fireEvent.click(screen.getByRole('button', { name: '参考图' }));
  expect(await screen.findByRole('option', { name: '使用参考图 可用主图' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: '使用参考图 权利待核' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: '使用参考图 未审片' })).not.toBeInTheDocument();
});

it('创作卡明确区分实际送模主参考与仅记录参考', async () => {
  const project = { id: 'project-1', name: '人物项目', brief: { goal: '', audience: '', visualWorld: '', delivery: '', acceptance: '' } };
  const task = { id: 'task-1', name: '人物图', objective: '人物图', status: 'draft', card: { ...characterFixture('unused', 'unused').card, referenceAssetIds: ['ref-1', 'ref-2'] } };
  vi.mocked(window.studio.projects.list).mockResolvedValue([project] as never);
  vi.mocked(window.studio.projects.workspace).mockResolvedValue({ project, masterAssets: [], recentGenerations: [], recentTasks: [], health: { assetCount: 0, confirmedAssetCount: 0, candidateAssetCount: 0, masterAssetCount: 0, generationCount: 0 } } as never);
  vi.mocked(window.studio.tasks.list).mockResolvedValue([task] as never);

  render(<App />);
  await screen.findByRole('option', { name: '人物项目' });
  fireEvent.change(await screen.findByRole('combobox', { name: '当前项目' }), { target: { value: 'project-1' } });
  fireEvent.click(await screen.findByRole('button', { name: /人物图.*人物图/ }));
  fireEvent.click(screen.getByRole('button', { name: '更多设置' }));
  expect(screen.getByText('实际送模')).toBeInTheDocument();
  expect(screen.getByText('仅记录')).toBeInTheDocument();
  expect(screen.getByText(/只有已确认且使用权为原创或已授权/)).toBeInTheDocument();
});
