import { describe, expect, it } from "vitest";
import type { CreativeCard } from "../shared/types";
import { buildCreativePlan, composeGuidedCreation, CREATION_PRESETS, DEFAULT_GUIDED_APPEARANCE } from "./creative-plan";

const emptyCard: CreativeCard = {
  intent: "真人感角色场景创作",
  subject: "",
  identityAnchor: "",
  bodyAndWardrobe: "",
  expressionAndPose: "",
  scene: "",
  lighting: "",
  camera: "",
  style: "",
  avoid: "",
  aspectRatio: "9:16",
  referenceAssetIds: [],
};

describe("buildCreativePlan", () => {
  it("完整视觉方向一次带出角色、场景、镜头和锁定项", () => {
    const preset = CREATION_PRESETS.find((item) => item.id === "city_couture");
    expect(preset).toMatchObject({
      direction: "portrait",
      subject: "adult_woman",
      scene: "modern_city",
      shot: "full_body",
      visualStyle: "editorial",
    });
    expect(preset?.constraints).toEqual(expect.arrayContaining(["identity", "body", "skin"]));
    expect(preset?.appearance).toMatchObject({ age: "thirties", role: "fashion_lead", hair: "soft_waves", body: "tall", wardrobe: "couture" });
  });

  it("只靠选择项就能生成任务目标、主体、场景和约束", () => {
    const plan = composeGuidedCreation({
      direction: "portrait",
      subject: "adult_woman",
      scene: "ancient_east",
      mood: "mysterious",
      shot: "full_body",
      visualStyle: "cinematic",
      constraints: ["identity", "skin", "no_text"],
    });

    expect(plan.taskName).toContain("人物写真");
    expect(plan.objective).toContain("东方古风");
    expect(plan.objective).toContain("全身构图");
    expect(plan.objective).toContain("电影级");
    expect(plan.visualStyle).toContain("电影级");
    expect(plan.subject).toContain("成年");
    expect(plan.mustKeep).toContain("脸部结构");
    expect(plan.mustKeep).toContain("水印");
  });

  it("只有选择自定义时才读取补充文字", () => {
    const plan = composeGuidedCreation({
      direction: "story_scene",
      subject: "custom",
      scene: "custom",
      mood: "cool",
      shot: "half_body",
      constraints: [],
      customSubject: "机械蝶灵",
      customScene: "废弃月面车站",
    });

    expect(plan.subject).toBe("机械蝶灵");
    expect(plan.scene).toBe("废弃月面车站");
    expect(plan.objective).toContain("废弃月面车站");
  });

  it("剧情骨架会真实进入任务名称、目标和场景约束", () => {
    const plan = composeGuidedCreation({
      direction: "story_scene",
      subject: "adult_woman",
      scene: "modern_city",
      mood: "mysterious",
      shot: "full_body",
      visualStyle: "cinematic",
      constraints: ["identity", "no_text"],
      storyPlan: {
        relationship: "confrontation",
        moment: "reversal",
        pacing: "peak",
        atmosphere: "danger",
      },
    });

    expect(plan.taskName).toContain("局势反转");
    expect(plan.objective).toContain("对峙关系");
    expect(plan.objective).toContain("局势突然反转");
    expect(plan.objective).toContain("情绪或行动峰值");
    expect(plan.scene).toContain("正在逼近的危险");
  });

  it("把可视化外观选择编译成可执行的人物约束", () => {
    const plan = composeGuidedCreation({
      direction: "portrait",
      subject: "adult_woman",
      scene: "modern_city",
      mood: "cool",
      shot: "full_body",
      visualStyle: "photoreal",
      appearance: {
        ...DEFAULT_GUIDED_APPEARANCE,
        face: "fox",
        eyeColor: "amber",
        hair: "soft_waves",
        hairColor: "dark_brown",
        body: "tall",
        height: "model",
        proportion: "long_legs",
        upperVolume: "balanced",
        lowerShape: "rounded",
        wardrobe: "couture",
        voice: "magnetic",
        relationship: "partner",
        interest: "fashion",
        archetype: "strategist",
        drive: "prove_self",
        conflict: "duty_desire",
        opening: "mission_start",
        performance: "dialogue",
        pose: "leaning",
        expression: "soft_smile",
      },
      constraints: ["identity", "skin"],
    });

    expect(plan.subject).toContain("清冷狐系五官");
    expect(plan.subject).toContain("柔软长卷发");
    expect(plan.subject).toContain("琥珀色虹膜");
    expect(plan.subject).toContain("深棕发色");
    expect(plan.subject).toContain("高挑修长体型");
    expect(plan.subject).toContain("模特型高挑身高");
    expect(plan.subject).toContain("修长腿部比例");
    expect(plan.subject).toContain("上身量感均衡");
    expect(plan.subject).toContain("自然圆润的胯部轮廓");
    expect(plan.subject).toContain("高级定制时装");
    expect(plan.subject).toContain("低沉有磁性的声线");
    expect(plan.subject).toContain("亲密搭档关系");
    expect(plan.subject).toContain("关注时尚造型");
    expect(plan.subject).toContain("角色原型是谋划者");
    expect(plan.subject).toContain("核心目标是用行动证明自己的能力与价值");
    expect(plan.subject).toContain("责任与真实欲望之间的矛盾");
    expect(plan.subject).toContain("默认开场是新任务开始");
    expect(plan.subject).toContain("适合对话表演");
    expect(plan.subject).toContain("自然倚靠");
    expect(plan.subject).toContain("自然轻微笑意");
    expect(plan.subject).toContain("22至29岁");
    expect(plan.subject).toContain("东方主角");
    expect(plan.objective).toContain("高质量真实摄影");
  });

  it("只用一句创作描述也能建立完整人物写真方案", () => {
    const plan = buildCreativePlan({
      base: emptyCard,
      brief: "一位东方女性在雨夜温室回头看向镜头",
      direction: "portrait",
      visualStyle: "时尚编辑视觉",
    });

    expect(plan.intent).toBe("一位东方女性在雨夜温室回头看向镜头");
    expect(plan.subject).toContain("东方女性");
    expect(plan.identityAnchor).toContain("脸部结构");
    expect(plan.bodyAndWardrobe).not.toBe("");
    expect(plan.lighting).toContain("真实皮肤");
    expect(plan.camera).not.toBe("");
    expect(plan.style).toContain("真人摄影");
    expect(plan.style).toContain("时尚编辑视觉");
    expect(plan.aspectRatio).toBe("2:3");
  });

  it("角色设定自动切换横版并保留已有角色与约束", () => {
    const plan = buildCreativePlan({
      base: {
        ...emptyCard,
        intent: "已有角色资产",
        subject: "锁定角色蝶灵",
        identityAnchor: "灰棕色虹膜",
        referenceAssetIds: ["asset-1"],
      },
      brief: "生成同一角色的多角度设定板",
      direction: "character_sheet",
      mustKeep: "不改变面部比例",
    });

    expect(plan.subject).toBe("锁定角色蝶灵");
    expect(plan.identityAnchor).toContain("灰棕色虹膜");
    expect(plan.identityAnchor).toContain("参考图");
    expect(plan.mustKeep).toContain("不改变面部比例");
    expect(plan.scene).toContain("角色设定板");
    expect(plan.aspectRatio).toBe("4:3");
    expect(plan.deliveryMode).toBe("character_sheet");
  });

  it("动态关键帧形成可进入视频链路的持久化创作卡", () => {
    const plan = buildCreativePlan({
      base: emptyCard,
      brief: "雨夜回头的动作起始帧",
      direction: "dynamic_keyframe",
    });

    expect(plan.deliveryMode).toBe("dynamic_keyframe");
    expect(plan.expressionAndPose).toContain("关键姿态");
    expect(plan.camera).toContain("视频裁切安全区");
    expect(plan.aspectRatio).toBe("9:16");
  });
});
