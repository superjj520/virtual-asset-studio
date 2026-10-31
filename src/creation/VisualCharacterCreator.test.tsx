import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Asset, CharacterProfile, SceneProfile } from "../shared/types";
import { DEFAULT_GUIDED_APPEARANCE, DEFAULT_GUIDED_STORY_PLAN } from "./creative-plan";
import { createDefaultSeriesPlan } from "./candidate-variations";
import { VisualCharacterCreator } from "./VisualCharacterCreator";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function characterSource(id: string, name: string, masterAssetId?: string): CharacterProfile {
  return {
    id,
    name,
    masterAssetId,
    group: "lead",
    lifecycle: masterAssetId ? "confirmed" : "draft",
    card: {
      intent: "角色复用",
      subject: "成年角色",
      identityAnchor: "",
      bodyAndWardrobe: "",
      expressionAndPose: "",
      scene: "",
      lighting: "",
      camera: "",
      style: "",
      avoid: "",
      aspectRatio: "2:3",
      referenceAssetIds: [],
    },
    specification: { identityLocks: [], wardrobeLocks: [], visualMotifs: [], forbiddenChanges: [], requiredAssetKinds: [] },
    createdAt: "",
    updatedAt: "",
  };
}

function sceneSource(id: string, name: string, masterAssetId?: string): SceneProfile {
  return {
    id,
    name,
    masterAssetId,
    kind: "environment",
    lifecycle: masterAssetId ? "confirmed" : "draft",
    anchor: "",
    layout: "",
    materials: "",
    colorSystem: "",
    requiredElements: "",
    forbiddenChanges: "",
    createdAt: "",
    updatedAt: "",
  };
}

function referenceAsset(id: string, name: string, metadata: Record<string, unknown> = {}): Asset {
  return {
    id,
    name,
    type: "reference_image",
    managedPath: `/tmp/${name}`,
    sha256: id,
    mediaType: "image/webp",
    rightsStatus: "authorized",
    confirmation: "confirmed",
    metadata,
    createdAt: "",
    updatedAt: "",
  };
}

describe("VisualCharacterCreator", () => {
  it("角色资产按主参考完整度分区，草稿角色不占用大图卡", () => {
    const ready = characterSource("ready", "蝶灵", "asset-ready");
    const draft = characterSource("draft", "东方女主");

    render(<VisualCharacterCreator
      creationKind="character"
      presetId="oriental_moon"
      onPresetChange={vi.fn()}
      direction="portrait"
      onDirectionChange={vi.fn()}
      sourceMode="saved"
      onSourceModeChange={vi.fn()}
      subject="adult_woman"
      onSubjectChange={vi.fn()}
      appearance={DEFAULT_GUIDED_APPEARANCE}
      onAppearanceChange={vi.fn()}
      scene="ancient_east"
      onSceneChange={vi.fn()}
      mood="cool"
      onMoodChange={vi.fn()}
      shot="character_sheet"
      onShotChange={vi.fn()}
      visualStyle="photoreal"
      onVisualStyleChange={vi.fn()}
      constraints={["identity", "skin"]}
      onConstraintToggle={vi.fn()}
      characters={[ready, draft]}
      characterId="ready"
      onCharacterChange={vi.fn()}
      purpose="series"
      onPurposeChange={vi.fn()}
      variantSelections={{}}
      onVariantChange={vi.fn()}
      referenceAssets={[]}
      referenceAssetId=""
      onReferenceAssetChange={vi.fn()}
      scenes={[]}
      sceneProfileId=""
      onSceneProfileChange={vi.fn()}
      customSubject=""
      onCustomSubjectChange={vi.fn()}
      customScene=""
      onCustomSceneChange={vi.fn()}
      canGenerate
      candidateCount={2}
      onCandidateCountChange={vi.fn()}
      qualityTier="premium"
      onQualityTierChange={vi.fn()}
      onCreate={vi.fn()}
      onSave={vi.fn()}
      onOpenSettings={vi.fn()}
    />);

    expect(screen.getByText("个角色资产 · 1 个已建立主参考 · 1 个待补主参考")).toBeInTheDocument();
    const readyList = screen.getByRole("listbox", { name: "已建立主参考的角色资产" });
    const draftList = screen.getByRole("listbox", { name: "待补主参考角色" });
    const readyCard = within(readyList).getByRole("option", { name: "使用角色 蝶灵" });
    const draftCard = within(draftList).getByRole("option", { name: "使用角色 东方女主" });
    expect(readyCard.querySelector(".creator-asset-thumb")).toBeInTheDocument();
    expect(draftCard).toHaveClass("compact");
    expect(draftCard.querySelector(".creator-asset-thumb")).not.toBeInTheDocument();
    expect(within(draftCard).getByText("待补主参考")).toBeInTheDocument();
  });

  it("已有场景按主参考完整度分区，结构草稿不冒充视觉素材", () => {
    render(<VisualCharacterCreator
      creationKind="character"
      presetId="oriental_moon"
      onPresetChange={vi.fn()}
      direction="portrait"
      onDirectionChange={vi.fn()}
      sourceMode="new"
      onSourceModeChange={vi.fn()}
      subject="adult_woman"
      onSubjectChange={vi.fn()}
      appearance={DEFAULT_GUIDED_APPEARANCE}
      onAppearanceChange={vi.fn()}
      scene="ancient_east"
      onSceneChange={vi.fn()}
      mood="cool"
      onMoodChange={vi.fn()}
      shot="character_sheet"
      onShotChange={vi.fn()}
      visualStyle="photoreal"
      onVisualStyleChange={vi.fn()}
      constraints={["identity", "skin"]}
      onConstraintToggle={vi.fn()}
      characters={[]}
      characterId=""
      onCharacterChange={vi.fn()}
      purpose="series"
      onPurposeChange={vi.fn()}
      variantSelections={{}}
      onVariantChange={vi.fn()}
      referenceAssets={[]}
      referenceAssetId=""
      onReferenceAssetChange={vi.fn()}
      scenes={[sceneSource("ready-scene", "夜色庭院", "scene-master"), sceneSource("draft-scene", "发现线索")]}
      sceneProfileId=""
      onSceneProfileChange={vi.fn()}
      customSubject=""
      onCustomSubjectChange={vi.fn()}
      customScene=""
      onCustomSceneChange={vi.fn()}
      canGenerate
      candidateCount={2}
      onCandidateCountChange={vi.fn()}
      qualityTier="premium"
      onQualityTierChange={vi.fn()}
      onCreate={vi.fn()}
      onSave={vi.fn()}
      onOpenSettings={vi.fn()}
    />);

    fireEvent.click(screen.getByRole("button", { name: "精细塑造" }));
    fireEvent.click(screen.getByRole("button", { name: /6 造型场景/ }));
    const readyList = screen.getByRole("listbox", { name: "可直接使用的场景资产" });
    const draftList = screen.getByRole("listbox", { name: "待补主参考场景" });
    expect(within(readyList).getByRole("option", { name: "使用场景 夜色庭院" }).querySelector(".creator-asset-thumb")).toBeInTheDocument();
    const draftCard = within(draftList).getByRole("option", { name: "使用场景 发现线索" });
    expect(draftCard).toHaveClass("compact");
    expect(draftCard.querySelector(".creator-asset-thumb")).not.toBeInTheDocument();
    expect(within(draftCard).getByText("待补场景主参考")).toBeInTheDocument();
  });

  it("参考图使用友好名称，预览摘要只保留关键决策", () => {
    const asset = referenceAsset("reference-1", "real-photo-direct-hybrid-4k-natural-skin-accessories-proportions.webp");
    const view = render(<VisualCharacterCreator
      creationKind="character"
      presetId="oriental_moon"
      onPresetChange={vi.fn()}
      direction="portrait"
      onDirectionChange={vi.fn()}
      sourceMode="reference"
      onSourceModeChange={vi.fn()}
      subject="adult_woman"
      onSubjectChange={vi.fn()}
      appearance={DEFAULT_GUIDED_APPEARANCE}
      onAppearanceChange={vi.fn()}
      scene="ancient_east"
      onSceneChange={vi.fn()}
      mood="cool"
      onMoodChange={vi.fn()}
      shot="character_sheet"
      onShotChange={vi.fn()}
      visualStyle="photoreal"
      onVisualStyleChange={vi.fn()}
      constraints={["identity", "skin"]}
      onConstraintToggle={vi.fn()}
      characters={[]}
      characterId=""
      onCharacterChange={vi.fn()}
      purpose="series"
      onPurposeChange={vi.fn()}
      variantSelections={{}}
      onVariantChange={vi.fn()}
      referenceAssets={[asset]}
      referenceAssetId={asset.id}
      onReferenceAssetChange={vi.fn()}
      scenes={[]}
      sceneProfileId=""
      onSceneProfileChange={vi.fn()}
      customSubject=""
      onCustomSubjectChange={vi.fn()}
      customScene=""
      onCustomSceneChange={vi.fn()}
      canGenerate
      candidateCount={2}
      onCandidateCountChange={vi.fn()}
      qualityTier="premium"
      onQualityTierChange={vi.fn()}
      onCreate={vi.fn()}
      onSave={vi.fn()}
      onOpenSettings={vi.fn()}
    />);

    const creator = within(view.container);
    const referenceCard = creator.getByRole("option", { name: "使用参考图 01" });
    expect(referenceCard).toHaveAttribute("title", asset.name);
    expect(within(referenceCard).getByText("参考图 01")).toBeInTheDocument();
    const currentSelection = view.container.querySelector(".character-flow-preview-copy");
    expect(currentSelection).toHaveTextContent("参考图 01");
    expect(currentSelection).not.toHaveTextContent(asset.name);
    expect(currentSelection?.querySelector("p")?.textContent?.split(" · ")).toHaveLength(5);
    expect(view.container.querySelector(".character-flow-preview-copy p")).not.toHaveTextContent("镜头表现");
  });

  it("单张画面用四步选择流水线完成，并即时预览已选约束", () => {
    const onPresetChange = vi.fn();
    const onSourceModeChange = vi.fn();
    const onAspectRatioChange = vi.fn();
    const onCreate = vi.fn();

    render(<VisualCharacterCreator
      creationKind="image"
      presetId="oriental_moon"
      onPresetChange={onPresetChange}
      direction="portrait"
      onDirectionChange={vi.fn()}
      sourceMode="new"
      onSourceModeChange={onSourceModeChange}
      subject="adult_woman"
      onSubjectChange={vi.fn()}
      appearance={DEFAULT_GUIDED_APPEARANCE}
      onAppearanceChange={vi.fn()}
      scene="ancient_east"
      onSceneChange={vi.fn()}
      mood="cool"
      onMoodChange={vi.fn()}
      shot="half_body"
      onShotChange={vi.fn()}
      visualStyle="photoreal"
      onVisualStyleChange={vi.fn()}
      constraints={["identity", "skin"]}
      onConstraintToggle={vi.fn()}
      characters={[]}
      characterId=""
      onCharacterChange={vi.fn()}
      purpose="portrait"
      onPurposeChange={vi.fn()}
      variantSelections={{}}
      onVariantChange={vi.fn()}
      referenceAssets={[]}
      referenceAssetId=""
      onReferenceAssetChange={vi.fn()}
      scenes={[]}
      sceneProfileId=""
      onSceneProfileChange={vi.fn()}
      customSubject=""
      onCustomSubjectChange={vi.fn()}
      customScene=""
      onCustomSceneChange={vi.fn()}
      canGenerate
      candidateCount={2}
      onCandidateCountChange={vi.fn()}
      qualityTier="premium"
      onQualityTierChange={vi.fn()}
      aspectRatio="2:3"
      onAspectRatioChange={onAspectRatioChange}
      onCreate={onCreate}
      onSave={vi.fn()}
      onOpenSettings={vi.fn()}
    />);

    // 入口：一条选择流水线，没有第二套精细模式导航
    expect(screen.getByRole("region", { name: "单张画面工作台" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "选主体和画面，建立单张方案" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "单张画面预览" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "精细塑造" })).not.toBeInTheDocument();

    // 第 1 步：人物来源是视觉卡，视觉方向是图片样片
    const sourceCards = within(screen.getByRole("group", { name: "主角来源" }));
    expect(sourceCards.getAllByRole("button")).toHaveLength(3);
    fireEvent.click(sourceCards.getByRole("button", { name: /参考图/ }));
    expect(onSourceModeChange).toHaveBeenCalledWith("reference");
    const directionSamples = Array.from(screen.getByRole("group", { name: "创作方向样片" }).querySelectorAll("img"));
    expect(directionSamples).toHaveLength(6);
    expect(new Set(directionSamples.map((image) => image.getAttribute("src"))).size).toBe(6);
    fireEvent.click(screen.getByRole("button", { name: /都市高定/ }));
    expect(onPresetChange).toHaveBeenCalledWith("city_couture");

    // 已选约束在任意步骤都可见，并且能直接跳回对应步骤
    const contract = within(screen.getByRole("navigation", { name: "已选约束" }));
    expect(contract.getByRole("button", { name: /已选人物来源：原创角色/ })).toBeInTheDocument();
    expect(contract.getByRole("button", { name: /已选视觉方向：月下东方/ })).toBeInTheDocument();
    expect(contract.getByRole("button", { name: /已选造型：东方主角 · 东方礼服/ })).toBeInTheDocument();
    expect(contract.getByRole("button", { name: /已选场景：东方古风 · 清冷克制/ })).toBeInTheDocument();
    expect(contract.getByRole("button", { name: /已选镜头：半身人像 · 真实摄影/ })).toBeInTheDocument();
    expect(contract.getByRole("button", { name: /已选必须保持：锁定脸部 · 真实皮肤/ })).toBeInTheDocument();

    fireEvent.click(contract.getByRole("button", { name: /已选造型/ }));
    expect(screen.getByRole("group", { name: "快速人物身份" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "造型方向" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "姿态动作" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "表情状态" })).toBeInTheDocument();

    fireEvent.click(contract.getByRole("button", { name: /已选场景/ }));
    expect(screen.getByRole("group", { name: "场景世界" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "快速画面气质" })).toBeInTheDocument();
    expect(screen.queryByLabelText("自定义场景")).not.toBeInTheDocument();

    // 第 4 步是生成前确认：先复核已选条件，再执行唯一主操作
    fireEvent.click(contract.getByRole("button", { name: /已选镜头/ }));
    const confirm = within(screen.getByRole("region", { name: "生成前确认" }));
    expect(confirm.getByText("核对已选条件，确认后建立单张画面方案")).toBeInTheDocument();
    expect(confirm.getByText("人物来源")).toBeInTheDocument();
    expect(confirm.getByText("动作表情")).toBeInTheDocument();
    expect(confirm.getByText("场景气质")).toBeInTheDocument();
    expect(confirm.getByText("镜头质感")).toBeInTheDocument();
    expect(confirm.getByRole("group", { name: "确认生成约束" })).toBeInTheDocument();
    expect(confirm.getByRole("group", { name: "快速镜头范围" })).toBeInTheDocument();
    expect(confirm.getByRole("group", { name: "快速视觉质感" })).toBeInTheDocument();
    expect(screen.getByText("单张方案已就绪")).toBeInTheDocument();

    // 高级交付默认折叠，不阻挡主流程
    const advanced = screen.getByText("高级交付 · 质量、候选与模型（可跳过）").closest("details");
    expect(advanced).not.toHaveAttribute("open");
    expect(within(advanced as HTMLElement).getByRole("group", { name: "快速生成质量" })).toBeInTheDocument();
    expect(within(advanced as HTMLElement).getByRole("group", { name: "快速候选数量" })).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("group", { name: "确认画面比例" })).getByRole("button", { name: "16:9" }));
    expect(onAspectRatioChange).toHaveBeenCalledWith("16:9");
    expect(screen.getAllByRole("button", { name: "建立单张画面方案" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "建立单张画面方案" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("单张画面只有在选择自定义场景后才出现文字输入", () => {
    const onSceneChange = vi.fn();
    const onCustomSceneChange = vi.fn();
    const view = render(<VisualCharacterCreator
      creationKind="image"
      presetId="oriental_moon"
      onPresetChange={vi.fn()}
      direction="portrait"
      onDirectionChange={vi.fn()}
      sourceMode="new"
      onSourceModeChange={vi.fn()}
      subject="adult_woman"
      onSubjectChange={vi.fn()}
      appearance={DEFAULT_GUIDED_APPEARANCE}
      onAppearanceChange={vi.fn()}
      scene="custom"
      onSceneChange={onSceneChange}
      mood="cool"
      onMoodChange={vi.fn()}
      shot="half_body"
      onShotChange={vi.fn()}
      visualStyle="photoreal"
      onVisualStyleChange={vi.fn()}
      constraints={["identity"]}
      onConstraintToggle={vi.fn()}
      characters={[]}
      characterId=""
      onCharacterChange={vi.fn()}
      purpose="portrait"
      onPurposeChange={vi.fn()}
      variantSelections={{}}
      onVariantChange={vi.fn()}
      referenceAssets={[]}
      referenceAssetId=""
      onReferenceAssetChange={vi.fn()}
      scenes={[]}
      sceneProfileId=""
      onSceneProfileChange={vi.fn()}
      customSubject=""
      onCustomSubjectChange={vi.fn()}
      customScene="雨夜天台"
      onCustomSceneChange={onCustomSceneChange}
      canGenerate
      candidateCount={2}
      onCandidateCountChange={vi.fn()}
      qualityTier="premium"
      onQualityTierChange={vi.fn()}
      onCreate={vi.fn()}
      onSave={vi.fn()}
      onOpenSettings={vi.fn()}
    />);

    const creator = within(view.container);
    fireEvent.click(within(creator.getByRole("navigation", { name: "已选约束" })).getByRole("button", { name: /已选场景/ }));
    expect(creator.getByLabelText("自定义场景")).toHaveValue("雨夜天台");
    const contract = within(creator.getByRole("navigation", { name: "已选约束" }));
    expect(contract.getByRole("button", { name: /已选场景：雨夜天台 · 清冷克制/ })).toBeInTheDocument();
    expect(creator.queryByRole("textbox", { name: /主体/ })).not.toBeInTheDocument();
  });

  it("精细模式只保留一套步骤导航，并提供退出创作入口", () => {
    const view = render(<VisualCharacterCreator
      presetId="oriental_moon"
      onPresetChange={vi.fn()}
      direction="portrait"
      onDirectionChange={vi.fn()}
      sourceMode="new"
      onSourceModeChange={vi.fn()}
      subject="adult_woman"
      onSubjectChange={vi.fn()}
      appearance={DEFAULT_GUIDED_APPEARANCE}
      onAppearanceChange={vi.fn()}
      scene="ancient_east"
      onSceneChange={vi.fn()}
      mood="cool"
      onMoodChange={vi.fn()}
      shot="half_body"
      onShotChange={vi.fn()}
      visualStyle="photoreal"
      onVisualStyleChange={vi.fn()}
      constraints={["identity", "skin"]}
      onConstraintToggle={vi.fn()}
      characters={[]}
      characterId=""
      onCharacterChange={vi.fn()}
      purpose="portrait"
      onPurposeChange={vi.fn()}
      variantSelections={{}}
      onVariantChange={vi.fn()}
      referenceAssets={[]}
      referenceAssetId=""
      onReferenceAssetChange={vi.fn()}
      scenes={[]}
      sceneProfileId=""
      onSceneProfileChange={vi.fn()}
      customSubject=""
      onCustomSubjectChange={vi.fn()}
      customScene=""
      onCustomSceneChange={vi.fn()}
      canGenerate
      candidateCount={2}
      onCandidateCountChange={vi.fn()}
      qualityTier="premium"
      onQualityTierChange={vi.fn()}
      onCreate={vi.fn()}
      onSave={vi.fn()}
      onExit={vi.fn()}
      onOpenSettings={vi.fn()}
    />);

    fireEvent.click(within(view.container).getByRole("button", { name: "精细塑造" }));
    expect(within(view.container).getAllByRole("navigation", { name: "角色创作步骤" })).toHaveLength(1);
    expect(within(view.container).queryByLabelText("创作进度")).not.toBeInTheDocument();
    expect(within(view.container).getByRole("button", { name: "退出创作" })).toBeInTheDocument();
  });

  it("创作主流程不暴露模型连接状态", () => {
    const view = render(<VisualCharacterCreator
      presetId="oriental_moon"
      onPresetChange={vi.fn()}
      direction="portrait"
      onDirectionChange={vi.fn()}
      sourceMode="new"
      onSourceModeChange={vi.fn()}
      subject="adult_woman"
      onSubjectChange={vi.fn()}
      appearance={DEFAULT_GUIDED_APPEARANCE}
      onAppearanceChange={vi.fn()}
      scene="ancient_east"
      onSceneChange={vi.fn()}
      mood="cool"
      onMoodChange={vi.fn()}
      shot="half_body"
      onShotChange={vi.fn()}
      visualStyle="photoreal"
      onVisualStyleChange={vi.fn()}
      constraints={["identity", "skin"]}
      onConstraintToggle={vi.fn()}
      characters={[]}
      characterId=""
      onCharacterChange={vi.fn()}
      purpose="portrait"
      onPurposeChange={vi.fn()}
      variantSelections={{}}
      onVariantChange={vi.fn()}
      referenceAssets={[]}
      referenceAssetId=""
      onReferenceAssetChange={vi.fn()}
      scenes={[]}
      sceneProfileId=""
      onSceneProfileChange={vi.fn()}
      customSubject=""
      onCustomSubjectChange={vi.fn()}
      customScene=""
      onCustomSceneChange={vi.fn()}
      canGenerate={false}
      candidateCount={2}
      onCandidateCountChange={vi.fn()}
      qualityTier="premium"
      onQualityTierChange={vi.fn()}
      onCreate={vi.fn()}
      onSave={vi.fn()}
      onOpenSettings={vi.fn()}
    />);

    const creator = within(view.container);
    fireEvent.click(creator.getByRole("button", { name: "精细塑造" }));
    const stepNavigation = creator.getByRole("navigation", { name: "角色创作步骤" });
    fireEvent.click(within(stepNavigation).getByRole("button", { name: /8 确认方案/ }));
    expect(creator.getByRole("heading", { name: "检查角色方案" })).toBeInTheDocument();
    expect(creator.getByRole("region", { name: "角色方案总览" })).toBeInTheDocument();
    expect(creator.getByText("角色资产已就绪")).toBeInTheDocument();
    expect(creator.queryByRole("group", { name: "生成质量" })).not.toBeInTheDocument();
    expect(creator.queryByRole("group", { name: "候选数量" })).not.toBeInTheDocument();
    expect(creator.queryByText(/图片模型|模型设置|连接模型/)).not.toBeInTheDocument();
    expect(creator.getByRole("button", { name: "保存方案" })).toBeInTheDocument();
    expect(creator.getByRole("button", { name: "保存为角色资产" })).toBeInTheDocument();
  });

  it("角色快速创建以六步选择流水线完成，并覆盖人物内核与默认场景", () => {
    const onAppearanceChange = vi.fn();
    const onMoodChange = vi.fn();
    const onSaveCharacter = vi.fn();
    const onTrackerToggle = vi.fn();
    const view = render(<VisualCharacterCreator
      creationKind="character"
      presetId="oriental_moon"
      onPresetChange={vi.fn()}
      direction="portrait"
      onDirectionChange={vi.fn()}
      sourceMode="new"
      onSourceModeChange={vi.fn()}
      subject="adult_woman"
      onSubjectChange={vi.fn()}
      appearance={DEFAULT_GUIDED_APPEARANCE}
      onAppearanceChange={onAppearanceChange}
      scene="ancient_east"
      onSceneChange={vi.fn()}
      mood="cool"
      onMoodChange={onMoodChange}
      shot="character_sheet"
      onShotChange={vi.fn()}
      visualStyle="photoreal"
      onVisualStyleChange={vi.fn()}
      constraints={["identity", "skin"]}
      onConstraintToggle={vi.fn()}
      trackerIds={["mood", "location", "wardrobe", "affinity"]}
      onTrackerToggle={onTrackerToggle}
      characters={[]}
      characterId=""
      onCharacterChange={vi.fn()}
      purpose="series"
      onPurposeChange={vi.fn()}
      variantSelections={{}}
      onVariantChange={vi.fn()}
      referenceAssets={[]}
      referenceAssetId=""
      onReferenceAssetChange={vi.fn()}
      scenes={[]}
      sceneProfileId=""
      onSceneProfileChange={vi.fn()}
      customSubject=""
      onCustomSubjectChange={vi.fn()}
      customScene=""
      onCustomSceneChange={vi.fn()}
      canGenerate
      candidateCount={2}
      onCandidateCountChange={vi.fn()}
      qualityTier="premium"
      onQualityTierChange={vi.fn()}
      onCreate={vi.fn()}
      onSave={vi.fn()}
      onSaveCharacter={onSaveCharacter}
      onOpenSettings={vi.fn()}
    />);

    const creator = within(view.container);
    expect(creator.queryByRole("button", { name: "进入创作台" })).not.toBeInTheDocument();
    const steps = within(creator.getByRole("navigation", { name: "角色创作步骤" }));
    expect(steps.getAllByRole("button")).toHaveLength(6);
    expect(creator.getByRole("button", { name: "下一步 · 基础" })).toBeInTheDocument();
    fireEvent.click(steps.getByRole("button", { name: /5 内核/ }));
    expect(creator.getByRole("group", { name: "角色身份" })).toBeInTheDocument();
    expect(creator.getByRole("group", { name: "性格气质" })).toBeInTheDocument();
    expect(creator.getByRole("group", { name: "服装方向" })).toBeInTheDocument();
    expect(view.container.querySelector("textarea")).not.toBeInTheDocument();

    fireEvent.click(creator.getByRole("button", { name: "职业精英" }));
    fireEvent.click(creator.getByRole("button", { name: "温柔松弛" }));

    expect(onMoodChange).toHaveBeenCalledWith("gentle");
    expect(onAppearanceChange).toHaveBeenCalledWith("role", "professional");

    fireEvent.click(creator.getByRole("button", { name: /关系 声线、关系、兴趣/ }));
    expect(creator.getByRole("group", { name: "声线方向" })).toBeInTheDocument();
    expect(creator.getByRole("group", { name: "关系定位" })).toBeInTheDocument();
    expect(creator.getByRole("group", { name: "生活兴趣" })).toBeInTheDocument();
    fireEvent.click(creator.getByRole("button", { name: "亲密搭档" }));
    expect(onAppearanceChange).toHaveBeenCalledWith("relationship", "partner");

    fireEvent.click(creator.getByRole("button", { name: /故事 原型、目标、冲突/ }));
    expect(creator.getByRole("group", { name: "人物原型" })).toBeInTheDocument();
    expect(creator.getByRole("group", { name: "核心目标" })).toBeInTheDocument();
    expect(creator.getByRole("group", { name: "内在冲突" })).toBeInTheDocument();
    expect(creator.getByRole("group", { name: "默认开场" })).toBeInTheDocument();
    fireEvent.click(creator.getByRole("button", { name: "守护者" }));
    fireEvent.click(creator.getByRole("button", { name: "守护重要之人" }));
    fireEvent.click(creator.getByRole("button", { name: "责任与欲望" }));
    fireEvent.click(creator.getByRole("button", { name: "任务开始" }));
    expect(onAppearanceChange).toHaveBeenCalledWith("archetype", "guardian");
    expect(onAppearanceChange).toHaveBeenCalledWith("drive", "protect");
    expect(onAppearanceChange).toHaveBeenCalledWith("conflict", "duty_desire");
    expect(onAppearanceChange).toHaveBeenCalledWith("opening", "mission_start");

    fireEvent.click(creator.getByRole("button", { name: /表演 动作、表情、场景/ }));
    const poseChoices = creator.getByRole("group", { name: "默认姿态" });
    const expressionChoices = creator.getByRole("group", { name: "默认表情" });
    expect(within(poseChoices).getByRole("button", { name: /自然放松/ })).toHaveClass("semantic-choice");
    expect(within(poseChoices).getByText("松肩 · 自然重心")).toBeInTheDocument();
    expect(within(expressionChoices).getByRole("button", { name: /平静克制/ })).toHaveClass("semantic-choice");
    expect(within(expressionChoices).getByText("稳定视线 · 放松唇部")).toBeInTheDocument();
    expect(poseChoices.querySelector(".board-choice-window")).not.toBeInTheDocument();
    expect(expressionChoices.querySelector(".board-choice-window")).not.toBeInTheDocument();
    fireEvent.click(within(poseChoices).getByRole("button", { name: /回身瞬间/ }));
    fireEvent.click(within(expressionChoices).getByRole("button", { name: /自然微笑/ }));
    expect(onAppearanceChange).toHaveBeenCalledWith("pose", "turning");
    expect(onAppearanceChange).toHaveBeenCalledWith("expression", "soft_smile");
    expect(creator.getByRole("group", { name: "表演方向" })).toBeInTheDocument();
    expect(creator.getByRole("group", { name: "默认场景" })).toBeInTheDocument();

    fireEvent.click(creator.getByRole("button", { name: /状态 心情、地点、关系/ }));
    const trackers = creator.getByRole("group", { name: "持续状态字段" });
    expect(within(trackers).getAllByRole("checkbox")).toHaveLength(4);
    expect(within(trackers).getByRole("checkbox", { name: /关系温度/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(trackers).getByRole("checkbox", { name: /关系温度/ }));
    expect(onTrackerToggle).toHaveBeenCalledWith("affinity");

    fireEvent.click(steps.getByRole("button", { name: /6 完成/ }));
    expect(creator.getByRole("region", { name: "角色方案确认" })).toBeInTheDocument();
    expect(creator.getByRole("region", { name: "角色核心设定" })).toBeInTheDocument();
    expect(creator.getByText("声线与关系")).toBeInTheDocument();
    expect(creator.getByText("故事驱动")).toBeInTheDocument();
    expect(creator.getByText("冲突与开场")).toBeInTheDocument();
    expect(creator.getByText("兴趣与表演")).toBeInTheDocument();
    expect(creator.getByText("默认场景")).toBeInTheDocument();
    expect(creator.getByText("持续状态")).toBeInTheDocument();
    expect(creator.getByText("换装 · 表情 · 动作 · 场景 · 状态 · 连续镜头")).toBeInTheDocument();
    fireEvent.click(creator.getByRole("button", { name: "保存为角色资产" }));
    expect(onSaveCharacter).toHaveBeenCalledTimes(1);
  });

  it("在生成前选择质量和候选数量", () => {
    const onCandidateCountChange = vi.fn();
    const onQualityTierChange = vi.fn();
    const onSeriesPlanChange = vi.fn();
    const view = render(<VisualCharacterCreator
      creationKind="series"
      presetId="oriental_moon"
      onPresetChange={vi.fn()}
      direction="portrait"
      onDirectionChange={vi.fn()}
      sourceMode="new"
      onSourceModeChange={vi.fn()}
      subject="adult_woman"
      onSubjectChange={vi.fn()}
      appearance={DEFAULT_GUIDED_APPEARANCE}
      onAppearanceChange={vi.fn()}
      scene="ancient_east"
      onSceneChange={vi.fn()}
      mood="cool"
      onMoodChange={vi.fn()}
      shot="half_body"
      onShotChange={vi.fn()}
      visualStyle="photoreal"
      onVisualStyleChange={vi.fn()}
      constraints={["identity", "skin"]}
      onConstraintToggle={vi.fn()}
      characters={[]}
      characterId=""
      onCharacterChange={vi.fn()}
      purpose="portrait"
      onPurposeChange={vi.fn()}
      variantSelections={{}}
      onVariantChange={vi.fn()}
      referenceAssets={[]}
      referenceAssetId=""
      onReferenceAssetChange={vi.fn()}
      scenes={[]}
      sceneProfileId=""
      onSceneProfileChange={vi.fn()}
      customSubject=""
      onCustomSubjectChange={vi.fn()}
      customScene=""
      onCustomSceneChange={vi.fn()}
      canGenerate
      candidateCount={2}
      onCandidateCountChange={onCandidateCountChange}
      seriesPlan={createDefaultSeriesPlan()}
      onSeriesPlanChange={onSeriesPlanChange}
      qualityTier="premium"
      onQualityTierChange={onQualityTierChange}
      onCreate={vi.fn()}
      onSave={vi.fn()}
      onOpenSettings={vi.fn()}
    />);

    const creator = within(view.container);
    expect(creator.getByRole("heading", { name: "锁定角色，规划连续镜头" })).toBeInTheDocument();
    fireEvent.click(within(creator.getByRole("navigation", { name: "快速创作步骤" })).getByRole("button", { name: /分镜/ }));
    const sequence = within(creator.getByRole("region", { name: "连续镜头规划" }));
    expect(sequence.getByRole("button", { name: "第 1 镜头：系列基准" })).toBeInTheDocument();
    expect(sequence.getByRole("button", { name: "第 2 镜头：近景情绪" })).toBeInTheDocument();
    expect(sequence.getByRole("button", { name: "第 3 镜头：全身造型" })).toBeInTheDocument();
    expect(sequence.getByRole("button", { name: "第 4 镜头：环境互动" })).toBeInTheDocument();
    expect(sequence.getAllByRole("img", { name: "系列基准镜头参考" }).length).toBeGreaterThan(1);
    const shotTypes = within(sequence.getByRole("group", { name: "镜头类型" }));
    const baselineSource = within(shotTypes.getByRole("button", { name: /系列基准/ })).getByRole("img").getAttribute("src");
    expect(within(shotTypes.getByRole("button", { name: /动作瞬间/ })).getByRole("img")).toHaveAttribute("src", baselineSource);
    expect(within(shotTypes.getByRole("button", { name: /越肩关系/ })).getByRole("img")).toHaveAttribute("src", baselineSource);
    expect(within(shotTypes.getByRole("button", { name: /细节特写/ })).getByRole("img")).toHaveAttribute("src", baselineSource);
    fireEvent.click(sequence.getByRole("button", { name: "第 2 镜头：近景情绪" }));
    fireEvent.click(shotTypes.getByRole("button", { name: /动作瞬间/ }));
    expect(onSeriesPlanChange).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: "action_moment", label: "动作瞬间" }),
    ]));
    fireEvent.click(within(sequence.getByRole("group", { name: "调整镜头顺序" })).getByRole("button", { name: "后移" }));
    expect(onSeriesPlanChange).toHaveBeenCalledTimes(2);
    fireEvent.click(sequence.getByRole("button", { name: "恢复推荐序列" }));
    expect(onSeriesPlanChange).toHaveBeenLastCalledWith(createDefaultSeriesPlan());
    fireEvent.click(within(creator.getByRole("navigation", { name: "快速创作步骤" })).getByRole("button", { name: /交付/ }));
    fireEvent.click(within(creator.getByRole("group", { name: "快速生成质量" })).getByRole("button", { name: "标准" }));
    fireEvent.click(within(creator.getByRole("group", { name: "快速候选数量" })).getByRole("button", { name: "4 张" }));

    expect(onQualityTierChange).toHaveBeenCalledWith("standard");
    expect(onCandidateCountChange).toHaveBeenCalledWith(4);
    expect(creator.getByText("系列方案已就绪")).toBeInTheDocument();
  });

  it("剧情场景通过关系、事件、节拍和氛围完成叙事骨架", () => {
    const onStoryPlanChange = vi.fn();
    const view = render(<VisualCharacterCreator
      creationKind="scene"
      presetId="rain_noir"
      onPresetChange={vi.fn()}
      direction="story_scene"
      onDirectionChange={vi.fn()}
      sourceMode="new"
      onSourceModeChange={vi.fn()}
      subject="adult_woman"
      onSubjectChange={vi.fn()}
      appearance={DEFAULT_GUIDED_APPEARANCE}
      onAppearanceChange={vi.fn()}
      scene="modern_city"
      onSceneChange={vi.fn()}
      mood="mysterious"
      onMoodChange={vi.fn()}
      storyPlan={DEFAULT_GUIDED_STORY_PLAN}
      onStoryPlanChange={onStoryPlanChange}
      shot="full_body"
      onShotChange={vi.fn()}
      visualStyle="cinematic"
      onVisualStyleChange={vi.fn()}
      constraints={["identity", "skin"]}
      onConstraintToggle={vi.fn()}
      characters={[]}
      characterId=""
      onCharacterChange={vi.fn()}
      purpose="series"
      onPurposeChange={vi.fn()}
      variantSelections={{}}
      onVariantChange={vi.fn()}
      referenceAssets={[]}
      referenceAssetId=""
      onReferenceAssetChange={vi.fn()}
      scenes={[]}
      sceneProfileId=""
      onSceneProfileChange={vi.fn()}
      customSubject=""
      onCustomSubjectChange={vi.fn()}
      customScene=""
      onCustomSceneChange={vi.fn()}
      canGenerate
      candidateCount={2}
      onCandidateCountChange={vi.fn()}
      qualityTier="premium"
      onQualityTierChange={vi.fn()}
      onCreate={vi.fn()}
      onSave={vi.fn()}
      onOpenSettings={vi.fn()}
    />);

    const creator = within(view.container);
    fireEvent.click(within(creator.getByRole("navigation", { name: "快速创作步骤" })).getByRole("button", { name: /剧情/ }));
    const story = within(creator.getByRole("region", { name: "剧情骨架" }));
    expect(story.getByRole("group", { name: "剧情人物关系" })).toBeInTheDocument();
    expect(story.getByRole("group", { name: "剧情事件瞬间" })).toBeInTheDocument();
    expect(story.getByRole("group", { name: "剧情叙事节拍" })).toBeInTheDocument();
    expect(story.getByRole("group", { name: "剧情空间氛围" })).toBeInTheDocument();

    fireEvent.click(story.getByRole("button", { name: "正面对峙" }));
    fireEvent.click(story.getByRole("button", { name: "局势反转" }));
    fireEvent.click(story.getByRole("button", { name: "情绪峰值" }));
    fireEvent.click(story.getByRole("button", { name: "危险逼近" }));

    expect(onStoryPlanChange).toHaveBeenCalledWith("relationship", "confrontation");
    expect(onStoryPlanChange).toHaveBeenCalledWith("moment", "reversal");
    expect(onStoryPlanChange).toHaveBeenCalledWith("pacing", "peak");
    expect(onStoryPlanChange).toHaveBeenCalledWith("atmosphere", "danger");
  });

  it("快速创作把面部与体型细节收进渐进披露", () => {
    render(<VisualCharacterCreator
      creationKind="character"
      presetId="oriental_moon"
      onPresetChange={vi.fn()}
      direction="portrait"
      onDirectionChange={vi.fn()}
      sourceMode="new"
      onSourceModeChange={vi.fn()}
      subject="adult_woman"
      onSubjectChange={vi.fn()}
      appearance={DEFAULT_GUIDED_APPEARANCE}
      onAppearanceChange={vi.fn()}
      scene="ancient_east"
      onSceneChange={vi.fn()}
      mood="cool"
      onMoodChange={vi.fn()}
      shot="half_body"
      onShotChange={vi.fn()}
      visualStyle="photoreal"
      onVisualStyleChange={vi.fn()}
      constraints={["identity", "skin"]}
      onConstraintToggle={vi.fn()}
      characters={[]}
      characterId=""
      onCharacterChange={vi.fn()}
      purpose="portrait"
      onPurposeChange={vi.fn()}
      variantSelections={{}}
      onVariantChange={vi.fn()}
      referenceAssets={[]}
      referenceAssetId=""
      onReferenceAssetChange={vi.fn()}
      scenes={[]}
      sceneProfileId=""
      onSceneProfileChange={vi.fn()}
      customSubject=""
      onCustomSubjectChange={vi.fn()}
      customScene=""
      onCustomSceneChange={vi.fn()}
      canGenerate
      candidateCount={2}
      onCandidateCountChange={vi.fn()}
      qualityTier="premium"
      onQualityTierChange={vi.fn()}
      onCreate={vi.fn()}
      onSave={vi.fn()}
      onOpenSettings={vi.fn()}
    />);

    const steps = within(screen.getByRole("navigation", { name: "角色创作步骤" }));
    fireEvent.click(steps.getByRole("button", { name: /外形/ }));
    expect(screen.getByText("脸部轮廓")).toBeInTheDocument();
    expect(screen.queryByText("眼神方向")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /更多细节：眼神/ }));
    expect(screen.getByText("眼神方向")).toBeInTheDocument();
    expect(screen.getByText("瞳孔颜色")).toBeInTheDocument();
    expect(screen.getByText("发色")).toBeInTheDocument();

    fireEvent.click(steps.getByRole("button", { name: /形体/ }));
    expect(screen.getByText("身体比例")).toBeInTheDocument();
    expect(screen.queryByText("体态比例")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /更多细节：体态/ }));
    expect(screen.getByText("体态比例")).toBeInTheDocument();
    expect(screen.getByText("上身量感")).toBeInTheDocument();
    expect(screen.getByText("下身轮廓")).toBeInTheDocument();
  });
});
