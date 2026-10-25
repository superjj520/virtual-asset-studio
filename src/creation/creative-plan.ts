import type { CreativeCard, CreativeDeliveryMode } from "../shared/types";

export type CreationDirection = CreativeDeliveryMode;

export const CREATION_DIRECTIONS: Array<{
  id: CreationDirection;
  label: string;
  description: string;
}> = [
  { id: "portrait", label: "人物写真", description: "真人感、时装与氛围人像" },
  { id: "character_sheet", label: "角色设定", description: "锁定同一角色的多角度资产" },
  { id: "story_scene", label: "剧情场景", description: "人物、动作与环境共同叙事" },
  { id: "cover", label: "封面海报", description: "强调视觉中心与传播构图" },
  { id: "series_pack", label: "系列角色图", description: "同一角色的连续内容素材" },
  { id: "dynamic_keyframe", label: "动态关键帧", description: "为视频与漫剧准备起始画面" },
];

export type GuidedSubject = "adult_woman" | "adult_man" | "duo" | "nonhuman" | "custom";
export type GuidedScene = "ancient_east" | "modern_city" | "fantasy" | "studio" | "custom";
export type GuidedMood = "cool" | "gentle" | "powerful" | "mysterious" | "bright";
export type GuidedShot = "closeup" | "half_body" | "full_body" | "character_sheet";
export type GuidedVisualStyle = "photoreal" | "cinematic" | "editorial" | "anime" | "concept";
export type GuidedConstraint = "identity" | "body" | "hair" | "wardrobe" | "skin" | "no_text";

export type GuidedEthnicity = "east_asian" | "southeast_asian" | "mixed" | "european" | "african" | "fantasy";
export type GuidedSkinTone = "porcelain" | "fair" | "warm" | "tan" | "deep";
export type GuidedFace = "oval" | "soft_round" | "defined" | "fox" | "heroic";
export type GuidedEyes = "clear" | "gentle" | "sharp" | "deep" | "bright";
export type GuidedEyeColor = "dark_brown" | "black" | "amber" | "gray" | "blue" | "green";
export type GuidedHair = "long_black" | "soft_waves" | "high_bun" | "short_bob" | "silver_long";
export type GuidedHairColor = "black" | "dark_brown" | "brown" | "auburn" | "silver" | "fantasy";
export type GuidedBody = "slender" | "balanced" | "curvy" | "athletic" | "tall";
export type GuidedHeight = "petite" | "average" | "tall" | "model";
export type GuidedProportion = "balanced" | "long_legs" | "defined_waist" | "athletic" | "broad_shoulders";
export type GuidedUpperVolume = "slim" | "balanced" | "full";
export type GuidedLowerShape = "narrow" | "balanced" | "rounded";
export type GuidedWardrobe = "oriental" | "couture" | "office" | "casual" | "fantasy";
export type GuidedAge = "twenties" | "thirties" | "forties" | "fifty_plus";
export type GuidedRole = "oriental_lead" | "fashion_lead" | "professional" | "artist" | "adventurer";
export type GuidedVoice = "soft" | "cool" | "mature" | "bright" | "magnetic";
export type GuidedRelationship = "independent" | "partner" | "confidant" | "rival" | "team";
export type GuidedInterest = "art" | "fashion" | "travel" | "reading" | "fitness" | "technology";
export type GuidedPerformance = "portrait" | "dialogue" | "lifestyle" | "action" | "emotion";
export type GuidedPose = "relaxed" | "confident" | "turning" | "leaning" | "dynamic";
export type GuidedExpression = "neutral" | "soft_smile" | "cool" | "surprised" | "emotional";
export type GuidedArchetype = "guardian" | "seeker" | "outsider" | "strategist" | "healer";
export type GuidedDrive = "belonging" | "prove_self" | "protect" | "truth" | "freedom";
export type GuidedConflict = "trust_guard" | "duty_desire" | "past_present" | "order_freedom" | "ideal_reality";
export type GuidedOpening = "first_meeting" | "mission_start" | "unexpected_reunion" | "threat_approaches" | "quiet_daily";
export type GuidedStoryRelationship = "alone" | "encounter" | "reunion" | "confrontation" | "alliance";
export type GuidedStoryMoment = "arrival" | "discovery" | "decision" | "reversal" | "departure";
export type GuidedStoryPacing = "still" | "rising" | "peak" | "afterglow";
export type GuidedStoryAtmosphere = "quiet" | "intimate" | "danger" | "mysterious" | "hopeful";

export type GuidedStoryPlan = {
  relationship: GuidedStoryRelationship;
  moment: GuidedStoryMoment;
  pacing: GuidedStoryPacing;
  atmosphere: GuidedStoryAtmosphere;
};
export type GuidedAppearance = {
  age: GuidedAge;
  role: GuidedRole;
  ethnicity: GuidedEthnicity;
  skinTone: GuidedSkinTone;
  face: GuidedFace;
  eyes: GuidedEyes;
  eyeColor: GuidedEyeColor;
  hair: GuidedHair;
  hairColor: GuidedHairColor;
  body: GuidedBody;
  height: GuidedHeight;
  proportion: GuidedProportion;
  upperVolume: GuidedUpperVolume;
  lowerShape: GuidedLowerShape;
  wardrobe: GuidedWardrobe;
  voice: GuidedVoice;
  relationship: GuidedRelationship;
  interest: GuidedInterest;
  archetype: GuidedArchetype;
  drive: GuidedDrive;
  conflict: GuidedConflict;
  opening: GuidedOpening;
  performance: GuidedPerformance;
  pose: GuidedPose;
  expression: GuidedExpression;
};

export const DEFAULT_GUIDED_APPEARANCE: GuidedAppearance = {
  age: "twenties",
  role: "oriental_lead",
  ethnicity: "east_asian",
  skinTone: "porcelain",
  face: "oval",
  eyes: "clear",
  eyeColor: "dark_brown",
  hair: "long_black",
  hairColor: "black",
  body: "balanced",
  height: "average",
  proportion: "balanced",
  upperVolume: "balanced",
  lowerShape: "balanced",
  wardrobe: "oriental",
  voice: "soft",
  relationship: "independent",
  interest: "art",
  archetype: "seeker",
  drive: "truth",
  conflict: "trust_guard",
  opening: "first_meeting",
  performance: "portrait",
  pose: "relaxed",
  expression: "neutral",
};

export const DEFAULT_GUIDED_STORY_PLAN: GuidedStoryPlan = {
  relationship: "alone",
  moment: "discovery",
  pacing: "rising",
  atmosphere: "mysterious",
};

export type CreationPresetId =
  | "oriental_moon"
  | "city_couture"
  | "rain_noir"
  | "natural_day"
  | "crystal_fantasy"
  | "anime_heroine";

export type CreationPreset = {
  id: CreationPresetId;
  label: string;
  description: string;
  direction: CreationDirection;
  subject: GuidedSubject;
  appearance: GuidedAppearance;
  scene: GuidedScene;
  mood: GuidedMood;
  shot: GuidedShot;
  visualStyle: GuidedVisualStyle;
  constraints: GuidedConstraint[];
};

/**
 * 高密度创作方向：一次选择同步确定角色、场景、镜头和质量约束，
 * 让用户先拿到完整方向，再按需要微调单个维度。
 */
export const CREATION_PRESETS: CreationPreset[] = [
  {
    id: "oriental_moon",
    label: "月下东方",
    description: "清冷古风 · 电影人像",
    direction: "portrait",
    subject: "adult_woman",
    appearance: { age: "twenties", role: "oriental_lead", ethnicity: "east_asian", skinTone: "porcelain", face: "oval", eyes: "clear", eyeColor: "dark_brown", hair: "high_bun", hairColor: "black", body: "slender", height: "tall", proportion: "long_legs", upperVolume: "slim", lowerShape: "balanced", wardrobe: "oriental", voice: "soft", relationship: "independent", interest: "art", archetype: "seeker", drive: "truth", conflict: "trust_guard", opening: "first_meeting", performance: "portrait", pose: "turning", expression: "cool" },
    scene: "ancient_east",
    mood: "mysterious",
    shot: "half_body",
    visualStyle: "cinematic",
    constraints: ["identity", "hair", "skin", "no_text"],
  },
  {
    id: "city_couture",
    label: "都市高定",
    description: "强势成熟 · 时尚编辑",
    direction: "portrait",
    subject: "adult_woman",
    appearance: { age: "thirties", role: "fashion_lead", ethnicity: "east_asian", skinTone: "fair", face: "defined", eyes: "sharp", eyeColor: "dark_brown", hair: "soft_waves", hairColor: "dark_brown", body: "tall", height: "model", proportion: "long_legs", upperVolume: "balanced", lowerShape: "rounded", wardrobe: "couture", voice: "magnetic", relationship: "independent", interest: "fashion", archetype: "strategist", drive: "prove_self", conflict: "duty_desire", opening: "mission_start", performance: "portrait", pose: "confident", expression: "cool" },
    scene: "modern_city",
    mood: "powerful",
    shot: "full_body",
    visualStyle: "editorial",
    constraints: ["identity", "body", "skin", "no_text"],
  },
  {
    id: "rain_noir",
    label: "雨夜电影",
    description: "成人男性 · 剧情张力",
    direction: "story_scene",
    subject: "adult_man",
    appearance: { age: "thirties", role: "professional", ethnicity: "mixed", skinTone: "warm", face: "heroic", eyes: "deep", eyeColor: "gray", hair: "short_bob", hairColor: "black", body: "athletic", height: "tall", proportion: "athletic", upperVolume: "balanced", lowerShape: "balanced", wardrobe: "office", voice: "cool", relationship: "rival", interest: "technology", archetype: "outsider", drive: "truth", conflict: "past_present", opening: "threat_approaches", performance: "dialogue", pose: "leaning", expression: "cool" },
    scene: "modern_city",
    mood: "cool",
    shot: "half_body",
    visualStyle: "cinematic",
    constraints: ["identity", "body", "no_text"],
  },
  {
    id: "natural_day",
    label: "自然生活",
    description: "松弛真实 · 生活抓拍",
    direction: "portrait",
    subject: "adult_woman",
    appearance: { age: "twenties", role: "artist", ethnicity: "east_asian", skinTone: "warm", face: "soft_round", eyes: "gentle", eyeColor: "dark_brown", hair: "soft_waves", hairColor: "dark_brown", body: "balanced", height: "average", proportion: "balanced", upperVolume: "balanced", lowerShape: "balanced", wardrobe: "casual", voice: "bright", relationship: "confidant", interest: "travel", archetype: "healer", drive: "belonging", conflict: "ideal_reality", opening: "quiet_daily", performance: "lifestyle", pose: "relaxed", expression: "soft_smile" },
    scene: "modern_city",
    mood: "gentle",
    shot: "half_body",
    visualStyle: "photoreal",
    constraints: ["identity", "skin", "no_text"],
  },
  {
    id: "crystal_fantasy",
    label: "冰境幻想",
    description: "中性探索者 · 世界观主视觉",
    direction: "cover",
    subject: "nonhuman",
    appearance: { age: "thirties", role: "adventurer", ethnicity: "fantasy", skinTone: "fair", face: "defined", eyes: "sharp", eyeColor: "blue", hair: "silver_long", hairColor: "silver", body: "tall", height: "model", proportion: "long_legs", upperVolume: "balanced", lowerShape: "narrow", wardrobe: "fantasy", voice: "cool", relationship: "team", interest: "travel", archetype: "guardian", drive: "protect", conflict: "order_freedom", opening: "mission_start", performance: "action", pose: "dynamic", expression: "cool" },
    scene: "fantasy",
    mood: "mysterious",
    shot: "half_body",
    visualStyle: "concept",
    constraints: ["identity", "hair", "wardrobe", "no_text"],
  },
  {
    id: "anime_heroine",
    label: "动漫女主",
    description: "成年角色 · 精致幻想",
    direction: "character_sheet",
    subject: "adult_woman",
    appearance: { age: "twenties", role: "adventurer", ethnicity: "fantasy", skinTone: "porcelain", face: "fox", eyes: "bright", eyeColor: "amber", hair: "long_black", hairColor: "black", body: "slender", height: "tall", proportion: "long_legs", upperVolume: "slim", lowerShape: "balanced", wardrobe: "fantasy", voice: "bright", relationship: "team", interest: "reading", archetype: "seeker", drive: "freedom", conflict: "trust_guard", opening: "first_meeting", performance: "emotion", pose: "confident", expression: "soft_smile" },
    scene: "fantasy",
    mood: "bright",
    shot: "character_sheet",
    visualStyle: "anime",
    constraints: ["identity", "body", "hair", "wardrobe", "no_text"],
  },
];

export type GuidedOption<T extends string> = { id: T; label: string; prompt: string };
export type GuidedVisualOption<T extends string> = GuidedOption<T> & { preview: string };

export const GUIDED_STORY_RELATIONSHIPS: GuidedOption<GuidedStoryRelationship>[] = [
  { id: "alone", label: "独处时刻", prompt: "角色独处，环境与细微动作共同透露内心状态" },
  { id: "encounter", label: "意外初遇", prompt: "人物在意外初遇的瞬间建立视线与空间关系" },
  { id: "reunion", label: "久别重逢", prompt: "久别重逢，克制的动作与微表情承载复杂情绪" },
  { id: "confrontation", label: "正面对峙", prompt: "人物形成清楚的对峙关系，站位、视线和距离带有张力" },
  { id: "alliance", label: "并肩行动", prompt: "人物形成临时同盟或长期搭档关系，行动方向一致" },
];

export const GUIDED_STORY_MOMENTS: GuidedOption<GuidedStoryMoment>[] = [
  { id: "arrival", label: "进入现场", prompt: "捕捉角色刚进入现场、尚未完全理解局面的瞬间" },
  { id: "discovery", label: "发现线索", prompt: "捕捉角色发现关键线索后反应尚未完全释放的瞬间" },
  { id: "decision", label: "做出选择", prompt: "捕捉角色做出关键选择的动作节点，目标与阻力清晰" },
  { id: "reversal", label: "局势反转", prompt: "捕捉局势突然反转的瞬间，人物关系和空间重点随之改变" },
  { id: "departure", label: "转身离开", prompt: "捕捉角色转身离开前后的情绪余波与行动方向" },
];

export const GUIDED_STORY_PACING: GuidedOption<GuidedStoryPacing>[] = [
  { id: "still", label: "静止铺垫", prompt: "叙事节拍处于安静铺垫，细节和悬念逐步显现" },
  { id: "rising", label: "张力上升", prompt: "叙事张力正在上升，视线、动作与构图形成明确期待" },
  { id: "peak", label: "情绪峰值", prompt: "画面位于情绪或行动峰值，主体动作清楚且视觉冲突集中" },
  { id: "afterglow", label: "事件余韵", prompt: "主要事件刚刚结束，以人物反应和环境变化保留余韵" },
];

export const GUIDED_STORY_ATMOSPHERES: GuidedOption<GuidedStoryAtmosphere>[] = [
  { id: "quiet", label: "寂静克制", prompt: "空间寂静克制，环境声与留白感强，情绪不外放" },
  { id: "intimate", label: "暧昧靠近", prompt: "人物距离与光线形成暧昧张力，表达成熟而克制" },
  { id: "danger", label: "危险逼近", prompt: "环境中存在正在逼近的危险，遮挡、光线与行动方向提供线索" },
  { id: "mysterious", label: "神秘未知", prompt: "空间带有未知感，关键区域被光影有选择地揭示" },
  { id: "hopeful", label: "希望出现", prompt: "压抑环境中出现明确希望信号，色温与视线方向共同强化转折" },
];

export const GUIDED_AGES: GuidedOption<GuidedAge>[] = [
  { id: "twenties", label: "22–29 岁", prompt: "明确成年的22至29岁年轻成人，年龄感自然可信" },
  { id: "thirties", label: "30–39 岁", prompt: "30至39岁的成熟成人，保留自然阅历感与真实肤质" },
  { id: "forties", label: "40–49 岁", prompt: "40至49岁的成熟成人，面部状态真实而有力量" },
  { id: "fifty_plus", label: "50 岁以上", prompt: "50岁以上的成年角色，保留真实年龄纹理与精神状态" },
];

export const GUIDED_ROLES: GuidedOption<GuidedRole>[] = [
  { id: "oriental_lead", label: "东方主角", prompt: "东方主角身份，具有鲜明叙事感并适合连续剧情发展" },
  { id: "fashion_lead", label: "时尚主理人", prompt: "高审美时尚主理人身份，造型决策明确，具有编辑大片气场" },
  { id: "professional", label: "职业精英", prompt: "现代职业精英身份，可信、克制、有现实生活依据" },
  { id: "artist", label: "创意艺术家", prompt: "创意艺术家身份，松弛、有个人表达和生活质感" },
  { id: "adventurer", label: "世界探索者", prompt: "世界探索者身份，适合幻想、动作与连续世界观内容" },
];

export const GUIDED_VOICES: GuidedOption<GuidedVoice>[] = [
  { id: "soft", label: "轻柔", prompt: "轻柔自然的声线，表达细腻、节奏舒缓" },
  { id: "cool", label: "清冷", prompt: "清冷克制的声线，语速稳定、情绪不外放" },
  { id: "mature", label: "成熟", prompt: "成熟沉稳的声线，语气可信、有阅历感" },
  { id: "bright", label: "明快", prompt: "明快有活力的声线，节奏轻盈、反应自然" },
  { id: "magnetic", label: "磁性", prompt: "低沉有磁性的声线，表达有张力但不过度表演" },
];

export const GUIDED_RELATIONSHIPS: GuidedOption<GuidedRelationship>[] = [
  { id: "independent", label: "独立主角", prompt: "独立主角定位，行动由自身目标推动" },
  { id: "partner", label: "亲密搭档", prompt: "亲密搭档关系，互动自然，有长期默契" },
  { id: "confidant", label: "知己朋友", prompt: "知己朋友关系，交流松弛、彼此信任" },
  { id: "rival", label: "对手关系", prompt: "竞争对手关系，交流克制但带有张力" },
  { id: "team", label: "团队成员", prompt: "团队协作关系，在群像中保持清晰角色职责" },
];

export const GUIDED_INTERESTS: GuidedOption<GuidedInterest>[] = [
  { id: "art", label: "艺术创作", prompt: "日常兴趣为艺术创作，行为与空间带有个人审美痕迹" },
  { id: "fashion", label: "时尚造型", prompt: "关注时尚造型，服装、配饰与姿态具有明确选择" },
  { id: "travel", label: "旅行探索", prompt: "喜欢旅行探索，适合在不同地点延展连续内容" },
  { id: "reading", label: "阅读研究", prompt: "喜欢阅读研究，行为克制、环境带有知识与生活细节" },
  { id: "fitness", label: "运动生活", prompt: "保持运动生活，动作自然有力量，体态稳定" },
  { id: "technology", label: "科技创造", prompt: "关注科技创造，适合现代工作与未来世界场景" },
];

/**
 * 人物故事基础使用稳定编号保存。它不是临时场景描述，而是跨写真、漫剧、游戏和连续镜头复用的角色动机。
 */
export const GUIDED_ARCHETYPES: GuidedOption<GuidedArchetype>[] = [
  { id: "guardian", label: "守护者", prompt: "角色原型是守护者，习惯先保护他人，再处理自己的需求" },
  { id: "seeker", label: "探索者", prompt: "角色原型是探索者，会主动接近未知并寻找隐藏答案" },
  { id: "outsider", label: "局外人", prompt: "角色原型是局外人，与环境保持距离，却能看见他人忽略的细节" },
  { id: "strategist", label: "谋划者", prompt: "角色原型是谋划者，习惯观察局势、隐藏意图并掌握节奏" },
  { id: "healer", label: "治愈者", prompt: "角色原型是治愈者，能安抚他人，也容易忽略自己的伤口" },
];

export const GUIDED_DRIVES: GuidedOption<GuidedDrive>[] = [
  { id: "belonging", label: "寻找归属", prompt: "核心目标是找到真正接纳自己的关系与归属" },
  { id: "prove_self", label: "证明自己", prompt: "核心目标是用行动证明自己的能力与价值" },
  { id: "protect", label: "守护重要之人", prompt: "核心目标是保护重要的人，即使需要承担代价" },
  { id: "truth", label: "揭开真相", prompt: "核心目标是追查被掩盖的真相并完成自己的判断" },
  { id: "freedom", label: "获得自由", prompt: "核心目标是摆脱束缚，按照自己的选择生活" },
];

export const GUIDED_CONFLICTS: GuidedOption<GuidedConflict>[] = [
  { id: "trust_guard", label: "信任与防备", prompt: "内在冲突来自渴望信任与习惯防备之间的拉扯" },
  { id: "duty_desire", label: "责任与欲望", prompt: "内在冲突来自必须承担的责任与真实欲望之间的矛盾" },
  { id: "past_present", label: "过去与现在", prompt: "内在冲突来自过去的经历持续影响现在的选择" },
  { id: "order_freedom", label: "秩序与自由", prompt: "内在冲突来自遵守秩序与追求自由之间的对抗" },
  { id: "ideal_reality", label: "理想与现实", prompt: "内在冲突来自理想判断与现实代价之间的落差" },
];

export const GUIDED_OPENINGS: GuidedOption<GuidedOpening>[] = [
  { id: "first_meeting", label: "初次登场", prompt: "默认开场是角色首次登场，用一个可识别行动建立身份与气质" },
  { id: "mission_start", label: "任务开始", prompt: "默认开场是新任务开始，角色目标、阻力与行动方向清楚" },
  { id: "unexpected_reunion", label: "意外重逢", prompt: "默认开场是意外重逢，关系历史通过距离、视线与反应显现" },
  { id: "threat_approaches", label: "危机逼近", prompt: "默认开场是危机正在逼近，角色必须在有限时间内作出决定" },
  { id: "quiet_daily", label: "平静日常", prompt: "默认开场是平静日常，用生活细节建立角色习惯与反差" },
];

export const GUIDED_PERFORMANCES: GuidedOption<GuidedPerformance>[] = [
  { id: "portrait", label: "镜头表现", prompt: "擅长静态镜头表现，表情与视线可用于人物写真和封面" },
  { id: "dialogue", label: "对话表演", prompt: "适合对话表演，口型、视线与微表情具有连续性" },
  { id: "lifestyle", label: "生活动作", prompt: "适合生活化动作，姿态松弛，与环境自然互动" },
  { id: "action", label: "动作场面", prompt: "适合动作场面，重心、肢体和服装动态保持可信" },
  { id: "emotion", label: "情绪特写", prompt: "适合情绪特写，面部微表情可在连续镜头中稳定延展" },
];

export const GUIDED_POSES: GuidedVisualOption<GuidedPose>[] = [
  { id: "relaxed", label: "自然放松", prompt: "自然放松的站姿或坐姿，肩颈松弛，手部动作自然", preview: "pose-relaxed" },
  { id: "confident", label: "自信站姿", prompt: "稳定自信的姿态，重心清楚，身体线条利落", preview: "pose-confident" },
  { id: "turning", label: "回身瞬间", prompt: "自然回身看向镜头，身体与头部转动关系可信", preview: "pose-turning" },
  { id: "leaning", label: "倚靠互动", prompt: "与桌沿、墙面或栏杆自然倚靠，接触点和身体受力可信", preview: "pose-leaning" },
  { id: "dynamic", label: "动态动作", prompt: "具有明确运动方向的动态姿态，重心、四肢与服装惯性自然", preview: "pose-dynamic" },
];

export const GUIDED_EXPRESSIONS: GuidedVisualOption<GuidedExpression>[] = [
  { id: "neutral", label: "平静克制", prompt: "平静克制的表情，视线稳定，面部肌肉自然", preview: "expression-neutral" },
  { id: "soft_smile", label: "自然微笑", prompt: "自然轻微笑意，眼神与面部肌肉同步，避免僵硬假笑", preview: "expression-smile" },
  { id: "cool", label: "清冷凝视", prompt: "清冷直接的凝视，情绪克制但有张力", preview: "expression-cool" },
  { id: "surprised", label: "轻微惊讶", prompt: "轻微惊讶的瞬间，眼睛和唇部变化真实不过度", preview: "expression-surprised" },
  { id: "emotional", label: "情绪张力", prompt: "明确但不过度夸张的情绪张力，微表情与呼吸状态可读", preview: "expression-emotional" },
];

export const GUIDED_ETHNICITIES: GuidedVisualOption<GuidedEthnicity>[] = [
  { id: "east_asian", label: "东亚", prompt: "东亚人物特征，五官比例自然真实", preview: "east-asian" },
  { id: "southeast_asian", label: "东南亚", prompt: "东南亚人物特征，面部轮廓柔和自然", preview: "southeast-asian" },
  { id: "mixed", label: "混血感", prompt: "自然协调的混合族裔面部特征", preview: "mixed" },
  { id: "european", label: "欧美", prompt: "欧美人物特征，骨相立体但不过度夸张", preview: "european" },
  { id: "african", label: "非洲", prompt: "非洲人物特征，真实深色肤质与骨相", preview: "african" },
  { id: "fantasy", label: "幻想种族", prompt: "原创幻想种族，结构统一且具有稳定识别点", preview: "fantasy" },
];

export const GUIDED_SKIN_TONES: GuidedVisualOption<GuidedSkinTone>[] = [
  { id: "porcelain", label: "冷白", prompt: "冷调象牙白肤色，保留真实皮肤纹理", preview: "skin-porcelain" },
  { id: "fair", label: "自然白", prompt: "自然白皙肤色，明暗与毛孔真实", preview: "skin-fair" },
  { id: "warm", label: "暖肤", prompt: "温暖健康肤色，肤色均匀但不过度磨皮", preview: "skin-warm" },
  { id: "tan", label: "小麦", prompt: "自然小麦肤色，具有健康光泽", preview: "skin-tan" },
  { id: "deep", label: "深肤", prompt: "自然深色肤色，保留丰富层次与高光", preview: "skin-deep" },
];

export const GUIDED_FACES: GuidedVisualOption<GuidedFace>[] = [
  { id: "oval", label: "柔和鹅蛋脸", prompt: "柔和鹅蛋脸，轮廓流畅，下颌自然", preview: "face-oval" },
  { id: "soft_round", label: "柔圆脸", prompt: "柔和圆润脸型，面中饱满，亲和自然", preview: "face-round" },
  { id: "defined", label: "立体骨相", prompt: "轮廓清晰、骨相立体，比例协调", preview: "face-defined" },
  { id: "fox", label: "清冷狐系", prompt: "清冷狐系五官，眼尾轻扬，轮廓精致", preview: "face-fox" },
  { id: "heroic", label: "英气轮廓", prompt: "英气面部轮廓，眉眼明确，结构自然", preview: "face-heroic" },
];

export const GUIDED_EYES: GuidedVisualOption<GuidedEyes>[] = [
  { id: "clear", label: "清澈杏眼", prompt: "清澈杏仁眼，瞳孔与眼神光自然", preview: "eyes-clear" },
  { id: "gentle", label: "温柔垂眼", prompt: "温柔微垂眼型，神态松弛", preview: "eyes-gentle" },
  { id: "sharp", label: "锐利长眼", prompt: "细长锐利眼型，眼神克制有张力", preview: "eyes-sharp" },
  { id: "deep", label: "深邃眼窝", prompt: "深邃眼部结构，明暗自然", preview: "eyes-deep" },
  { id: "bright", label: "明亮圆眼", prompt: "明亮圆眼，神态鲜活但不过度幼态", preview: "eyes-bright" },
];

export const GUIDED_EYE_COLORS: GuidedOption<GuidedEyeColor>[] = [
  { id: "dark_brown", label: "深灰棕", prompt: "深灰棕色虹膜，瞳孔清晰，眼神光自然" },
  { id: "black", label: "近黑", prompt: "近黑色虹膜，保留真实虹膜纹理和自然高光" },
  { id: "amber", label: "琥珀", prompt: "琥珀色虹膜，色彩通透但保持真人质感" },
  { id: "gray", label: "冷灰", prompt: "冷灰色虹膜，低饱和、真实克制" },
  { id: "blue", label: "冰蓝", prompt: "冰蓝色虹膜，具有真实虹膜层次，避免发光塑料感" },
  { id: "green", label: "灰绿", prompt: "低饱和灰绿色虹膜，细节自然可信" },
];

export const GUIDED_HAIR: GuidedVisualOption<GuidedHair>[] = [
  { id: "long_black", label: "黑色长发", prompt: "自然黑色长发，发丝清晰，有真实光泽", preview: "hair-long" },
  { id: "soft_waves", label: "柔软长卷", prompt: "柔软长卷发，纹理整齐，体积克制", preview: "hair-waves" },
  { id: "high_bun", label: "东方高髻", prompt: "东方古典高髻，轮廓饱满，保留自然碎发", preview: "hair-bun" },
  { id: "short_bob", label: "利落短发", prompt: "利落短发，发尾干净，贴合脸型", preview: "hair-bob" },
  { id: "silver_long", label: "银色长发", prompt: "银白色长发，发丝层次真实，避免塑料感", preview: "hair-silver" },
];

export const GUIDED_HAIR_COLORS: GuidedOption<GuidedHairColor>[] = [
  { id: "black", label: "自然黑", prompt: "自然黑色发色，保留细小发丝和真实反光" },
  { id: "dark_brown", label: "深棕", prompt: "深棕发色，色调自然，光线下有细腻层次" },
  { id: "brown", label: "栗棕", prompt: "自然栗棕发色，避免过度染发和塑料光泽" },
  { id: "auburn", label: "红棕", prompt: "克制的红棕发色，保持真实发丝质感" },
  { id: "silver", label: "银白", prompt: "银白发色，发根和发丝层次真实" },
  { id: "fantasy", label: "幻想色", prompt: "低饱和幻想发色，综合色彩与世界观保持统一" },
];

export const GUIDED_BODIES: GuidedVisualOption<GuidedBody>[] = [
  { id: "slender", label: "纤细", prompt: "纤细自然体型，肩腰胯比例协调", preview: "body-slender" },
  { id: "balanced", label: "匀称", prompt: "匀称成年体型，身材比例自然", preview: "body-balanced" },
  { id: "curvy", label: "曲线感", prompt: "成熟曲线体型，腰胯关系自然，避免夸张失真", preview: "body-curvy" },
  { id: "athletic", label: "健美", prompt: "健康运动体型，肌肉线条克制真实", preview: "body-athletic" },
  { id: "tall", label: "高挑", prompt: "高挑修长体型，腿部比例自然，完整肢体结构", preview: "body-tall" },
];

export const GUIDED_HEIGHTS: GuidedOption<GuidedHeight>[] = [
  { id: "petite", label: "小巧", prompt: "小巧身高，头身比例自然，避免幼态化" },
  { id: "average", label: "标准", prompt: "自然标准身高，身体尺度可信" },
  { id: "tall", label: "高挑", prompt: "高挑身高，四肢比例自然修长" },
  { id: "model", label: "模特比例", prompt: "模特型高挑身高，保持自然透视与真实骨骼结构" },
];

export const GUIDED_PROPORTIONS: GuidedOption<GuidedProportion>[] = [
  { id: "balanced", label: "自然均衡", prompt: "自然均衡的头身与四肢比例" },
  { id: "long_legs", label: "修长腿型", prompt: "修长腿部比例，腰线自然，避免不真实拉伸" },
  { id: "defined_waist", label: "腰线明确", prompt: "腰线明确，肩腰胯关系流畅自然" },
  { id: "athletic", label: "运动体态", prompt: "稳定健康的运动体态，核心与四肢线条协调" },
  { id: "broad_shoulders", label: "肩线突出", prompt: "肩线较突出，整体比例保持平衡" },
];

export const GUIDED_UPPER_VOLUMES: GuidedOption<GuidedUpperVolume>[] = [
  { id: "slim", label: "纤薄", prompt: "上身量感纤薄，胸廓与肩颈结构自然" },
  { id: "balanced", label: "均衡", prompt: "上身量感均衡，服装受力与轮廓真实" },
  { id: "full", label: "饱满", prompt: "上身量感自然饱满，避免夸张或失真" },
];

export const GUIDED_LOWER_SHAPES: GuidedOption<GuidedLowerShape>[] = [
  { id: "narrow", label: "窄胯", prompt: "较窄的胯部轮廓，与肩线和腿部自然衔接" },
  { id: "balanced", label: "均衡", prompt: "胯部与腿部轮廓均衡，身体重心自然" },
  { id: "rounded", label: "圆润", prompt: "自然圆润的胯部轮廓，保持真实骨骼和肌肉结构" },
];

export const GUIDED_WARDROBES: GuidedVisualOption<GuidedWardrobe>[] = [
  { id: "oriental", label: "东方礼服", prompt: "高级东方礼服，剪裁与材质真实，细节克制", preview: "wardrobe-oriental" },
  { id: "couture", label: "高定时装", prompt: "高级定制时装，强调身形比例与面料质感", preview: "wardrobe-couture" },
  { id: "office", label: "都市职业", prompt: "现代都市职业装，剪裁利落，成熟可信", preview: "wardrobe-office" },
  { id: "casual", label: "生活休闲", prompt: "有生活感的日常穿搭，穿着方式自然", preview: "wardrobe-casual" },
  { id: "fantasy", label: "幻想造型", prompt: "原创幻想服装，结构、材质和世界观统一", preview: "wardrobe-fantasy" },
];

export const GUIDED_SUBJECTS: GuidedOption<GuidedSubject>[] = [
  { id: "adult_woman", label: "成年女性", prompt: "明确成年的女性角色，身份与五官结构清晰" },
  { id: "adult_man", label: "成年男性", prompt: "明确成年的男性角色，身份与五官结构清晰" },
  { id: "duo", label: "双人关系", prompt: "两位明确成年的角色，关系和视觉主次清楚" },
  { id: "nonhuman", label: "非人角色", prompt: "具有稳定识别结构的原创非人角色" },
  { id: "custom", label: "自定义", prompt: "" },
];

export const GUIDED_SCENES: GuidedOption<GuidedScene>[] = [
  { id: "ancient_east", label: "东方古风", prompt: "真实东方古风环境，空间、服饰与时代逻辑统一" },
  { id: "modern_city", label: "现代现实", prompt: "可代入的现代真实环境，保留生活细节" },
  { id: "fantasy", label: "幻想世界", prompt: "有明确规则和空间层次的幻想世界" },
  { id: "studio", label: "极简影棚", prompt: "干净影棚背景，视觉焦点集中于角色" },
  { id: "custom", label: "自定义", prompt: "" },
];

export const GUIDED_MOODS: GuidedOption<GuidedMood>[] = [
  { id: "cool", label: "清冷克制", prompt: "清冷、克制、高级" },
  { id: "gentle", label: "温柔松弛", prompt: "温柔、松弛、自然" },
  { id: "powerful", label: "强势性感", prompt: "强势、有张力、成熟性感" },
  { id: "mysterious", label: "神秘梦幻", prompt: "神秘、梦幻、带电影氛围" },
  { id: "bright", label: "明快鲜活", prompt: "明快、鲜活、有生命力" },
];

export const GUIDED_SHOTS: GuidedOption<GuidedShot>[] = [
  { id: "closeup", label: "面部特写", prompt: "面部特写，眼神和真实皮肤细节优先" },
  { id: "half_body", label: "半身人像", prompt: "半身人像，兼顾神态、动作与服装上身" },
  { id: "full_body", label: "全身造型", prompt: "全身构图，完整展示身形、服装和鞋履" },
  { id: "character_sheet", label: "角色设定板", prompt: "角色设定板，多角度展示同一角色" },
];

export const GUIDED_VISUAL_STYLES: GuidedOption<GuidedVisualStyle>[] = [
  { id: "photoreal", label: "真实摄影", prompt: "高质量真实摄影，皮肤、头发、布料与环境材质自然可信" },
  { id: "cinematic", label: "电影画面", prompt: "电影级叙事画面，光线、景深、色彩与空间关系统一" },
  { id: "editorial", label: "时尚编辑", prompt: "时尚编辑视觉，造型明确，构图克制，具备杂志级完成度" },
  { id: "anime", label: "动漫视觉", prompt: "精致动漫角色视觉，线条、色彩与角色比例保持统一" },
  { id: "concept", label: "概念设计", prompt: "专业概念设计图，结构清晰，重点表现角色与世界观设定" },
];

export const GUIDED_CONSTRAINTS: GuidedOption<GuidedConstraint>[] = [
  { id: "identity", label: "锁定脸部", prompt: "保持脸部结构、年龄感和身份辨识度" },
  { id: "body", label: "锁定身形", prompt: "保持身体比例与体态特征" },
  { id: "hair", label: "锁定发型", prompt: "保持发型、发色和发丝轮廓" },
  { id: "wardrobe", label: "锁定服装", prompt: "保持服装款式、材质和配饰" },
  { id: "skin", label: "真实皮肤", prompt: "保留真实皮肤纹理，避免塑料磨皮" },
  { id: "no_text", label: "无文字水印", prompt: "画面不要文字、标志或水印" },
];

const optionPrompt = <T extends string>(options: GuidedOption<T>[], id: T, custom = "") =>
  id === "custom" ? custom.trim() : options.find((item) => item.id === id)?.prompt ?? "";

export const composeGuidedCreation = ({
  direction,
  subject,
  scene,
  mood,
  shot,
  visualStyle,
  appearance,
  constraints,
  customSubject,
  customScene,
  sourceLabel,
  storyPlan,
}: {
  direction: CreationDirection;
  subject: GuidedSubject;
  scene: GuidedScene;
  mood: GuidedMood;
  shot: GuidedShot;
  visualStyle?: GuidedVisualStyle;
  appearance?: GuidedAppearance;
  constraints: GuidedConstraint[];
  customSubject?: string;
  customScene?: string;
  sourceLabel?: string;
  storyPlan?: GuidedStoryPlan;
}) => {
  const directionLabel = CREATION_DIRECTIONS.find((item) => item.id === direction)?.label ?? "人物创作";
  const subjectPrompt = sourceLabel?.trim() || optionPrompt(GUIDED_SUBJECTS, subject, customSubject);
  const scenePrompt = optionPrompt(GUIDED_SCENES, scene, customScene);
  const moodPrompt = optionPrompt(GUIDED_MOODS, mood);
  const shotPrompt = optionPrompt(GUIDED_SHOTS, shot);
  const visualStylePrompt = visualStyle ? optionPrompt(GUIDED_VISUAL_STYLES, visualStyle) : "";
  const storyPrompt = storyPlan ? [
    optionPrompt(GUIDED_STORY_RELATIONSHIPS, storyPlan.relationship),
    optionPrompt(GUIDED_STORY_MOMENTS, storyPlan.moment),
    optionPrompt(GUIDED_STORY_PACING, storyPlan.pacing),
    optionPrompt(GUIDED_STORY_ATMOSPHERES, storyPlan.atmosphere),
  ].filter(Boolean).join("；") : "";
  const appearancePrompt = appearance ? [
    optionPrompt(GUIDED_AGES, appearance.age),
    optionPrompt(GUIDED_ROLES, appearance.role),
    optionPrompt(GUIDED_ETHNICITIES, appearance.ethnicity),
    optionPrompt(GUIDED_SKIN_TONES, appearance.skinTone),
    optionPrompt(GUIDED_FACES, appearance.face),
    optionPrompt(GUIDED_EYES, appearance.eyes),
    optionPrompt(GUIDED_EYE_COLORS, appearance.eyeColor),
    optionPrompt(GUIDED_HAIR, appearance.hair),
    optionPrompt(GUIDED_HAIR_COLORS, appearance.hairColor),
    optionPrompt(GUIDED_BODIES, appearance.body),
    optionPrompt(GUIDED_HEIGHTS, appearance.height),
    optionPrompt(GUIDED_PROPORTIONS, appearance.proportion),
    optionPrompt(GUIDED_UPPER_VOLUMES, appearance.upperVolume),
    optionPrompt(GUIDED_LOWER_SHAPES, appearance.lowerShape),
    optionPrompt(GUIDED_WARDROBES, appearance.wardrobe),
    optionPrompt(GUIDED_VOICES, appearance.voice),
    optionPrompt(GUIDED_RELATIONSHIPS, appearance.relationship),
    optionPrompt(GUIDED_INTERESTS, appearance.interest),
    optionPrompt(GUIDED_ARCHETYPES, appearance.archetype),
    optionPrompt(GUIDED_DRIVES, appearance.drive),
    optionPrompt(GUIDED_CONFLICTS, appearance.conflict),
    optionPrompt(GUIDED_OPENINGS, appearance.opening),
    optionPrompt(GUIDED_PERFORMANCES, appearance.performance),
    optionPrompt(GUIDED_POSES, appearance.pose),
    optionPrompt(GUIDED_EXPRESSIONS, appearance.expression),
  ].filter(Boolean).join("；") : "";
  const keep = constraints
    .map((id) => GUIDED_CONSTRAINTS.find((item) => item.id === id)?.prompt)
    .filter(Boolean)
    .join("；");
  const labels = [
    directionLabel,
    sourceLabel?.trim() || GUIDED_SUBJECTS.find((item) => item.id === subject)?.label,
    GUIDED_SCENES.find((item) => item.id === scene)?.label,
    GUIDED_MOODS.find((item) => item.id === mood)?.label,
    GUIDED_SHOTS.find((item) => item.id === shot)?.label,
    visualStyle ? GUIDED_VISUAL_STYLES.find((item) => item.id === visualStyle)?.label : undefined,
    storyPlan ? GUIDED_STORY_MOMENTS.find((item) => item.id === storyPlan.moment)?.label : undefined,
  ].filter(Boolean);

  return {
    taskName: labels.join(" · ").slice(0, 48),
    objective: `${directionLabel}：${[subjectPrompt, appearancePrompt, scenePrompt, storyPrompt, moodPrompt, shotPrompt, visualStylePrompt].filter(Boolean).join("；")}`,
    subject: [subjectPrompt, appearancePrompt].filter(Boolean).join("；"),
    scene: [scenePrompt, storyPrompt].filter(Boolean).join("；"),
    visualStyle: visualStylePrompt,
    mustKeep: keep,
  };
};

const DIRECTION_DEFAULTS: Record<CreationDirection, Pick<CreativeCard,
  "bodyAndWardrobe" | "expressionAndPose" | "scene" | "lighting" | "camera" | "style" | "aspectRatio"
>> = {
  portrait: {
    bodyAndWardrobe: "服装、发型与配饰围绕人物身份统一设计，材质和穿着方式真实可信",
    expressionAndPose: "神态自然克制，姿态松弛，肢体结构准确，视线与情绪服务人物气质",
    scene: "使用与人物身份相符的真实场景，背景有生活细节但不争夺视觉中心",
    lighting: "柔和电影人像光，保留真实皮肤纹理、眼神光与自然明暗过渡",
    camera: "人物摄影视角，透视自然，主体清晰，构图突出脸部、身形与服装比例",
    style: "高质量真人摄影，真实皮肤、布料和头发质感，克制调色，不使用插画或 3D 渲染感",
    aspectRatio: "2:3",
  },
  character_sheet: {
    bodyAndWardrobe: "同一套服装、鞋履、发型和配饰；完整展示正面、侧面、背面与关键局部",
    expressionAndPose: "标准站姿、多角度头部、常用表情与手部动作；所有分图保持同一人物结构",
    scene: "干净浅色角色设定板，主视图最大，信息分区清晰，辅助视图不遮挡主体",
    lighting: "均匀中性棚拍光，所有角度保持一致的曝光、肤色与材质表现",
    camera: "正交感角色展示与中焦肖像结合，比例稳定，避免广角变形",
    style: "高精度角色设定板，真实材质，专业技术排版，无品牌标识与水印",
    aspectRatio: "4:3",
  },
  story_scene: {
    bodyAndWardrobe: "造型符合角色身份、时代与场景逻辑，服装在动作中保持自然物理状态",
    expressionAndPose: "用可读的表情、视线和动作表达剧情瞬间，避免僵硬摆拍",
    scene: "完整建立地点、时间、前中后景和关键环境道具，人物与环境产生真实互动",
    lighting: "光线来源符合场景逻辑，用明暗和色温引导叙事重点",
    camera: "电影叙事构图，机位、景别和景深服务人物关系与事件重点",
    style: "电影级写实画面，真实空间、材质与空气感，避免游戏截图感和过度特效",
    aspectRatio: "16:9",
  },
  cover: {
    bodyAndWardrobe: "主体造型具有清晰轮廓和识别点，服装与配饰形成统一视觉语言",
    expressionAndPose: "姿态明确有张力，表情与视线能在缩略图尺寸下快速传达主题",
    scene: "背景简洁但具有主题符号，保留安全留白，不自动生成任何文字",
    lighting: "高完成度商业主视觉光线，主体与背景分离清楚，关键材质有层次",
    camera: "封面式视觉中心，构图层级清晰，兼顾裁切安全区与传播缩略图识别",
    style: "高级编辑视觉与商业摄影质感，颜色数量受控，画面完整但不过度堆叠",
    aspectRatio: "2:3",
  },
  series_pack: {
    bodyAndWardrobe: "固定同一角色的脸部、发型、身体比例与核心服装，只允许按场景需要调整外层搭配和自然物理状态",
    expressionAndPose: "建立可连续剪辑的表情和动作变化，前后镜头保持人物习惯、视线方向与肢体逻辑",
    scene: "围绕同一视觉世界建立可连续使用的场景变化，时间、天气、色彩和关键道具具有明确承接关系",
    lighting: "保持统一的主光逻辑和肤色基线，场景变化只影响合理的环境反射与氛围光",
    camera: "采用可组成系列的景别组合，构图节奏有变化但镜头语言与人物比例保持统一",
    style: "系列内容生产画面，同一角色、同一视觉世界和同一材质语言保持稳定，可继续用于漫剧、游戏与宣传素材",
    aspectRatio: "9:16",
  },
  dynamic_keyframe: {
    bodyAndWardrobe: "角色造型具备可动画化结构，发丝、衣摆、配饰和鞋履边界清晰，避免无法延续的随机细节",
    expressionAndPose: "选择动作开始或情绪峰值前的清晰关键姿态，重心、视线和肢体方向便于后续生成连续动作",
    scene: "建立明确前中后景和运动空间，保留角色行动路径，避免遮挡关键肢体与运动方向",
    lighting: "稳定电影光线与曝光，不使用会在相邻帧剧烈闪烁的碎片高光和随机光斑",
    camera: "单一明确机位，透视与景深稳定，构图预留动作方向和视频裁切安全区",
    style: "高质量动态起始帧，角色身份和场景结构稳定，可直接送入图生视频或漫剧镜头工作流",
    aspectRatio: "9:16",
  },
};

const mergeDistinct = (...parts: Array<string | undefined>) =>
  [...new Set(parts.map((item) => item?.trim()).filter(Boolean) as string[])].join("；");

export const buildCreativePlan = ({
  base,
  brief,
  direction,
  subject,
  scene,
  visualStyle,
  mustKeep,
}: {
  base: CreativeCard;
  brief: string;
  direction: CreationDirection;
  subject?: string;
  scene?: string;
  visualStyle?: string;
  mustKeep?: string;
}): CreativeCard => {
  const defaults = DIRECTION_DEFAULTS[direction];
  const hasReferences = base.referenceAssetIds.length > 0;
  const identityGuard = hasReferences
    ? "以已选角色与参考图为身份基线，脸部结构、年龄感、发型和身体比例保持一致"
    : "同一画面内的人物脸部结构、年龄感、发型和身体比例保持统一";

  return {
    ...base,
    deliveryMode: direction,
    intent: brief.trim(),
    subject: subject?.trim() || base.subject || `按创作描述塑造主体：${brief.trim()}`,
    identityAnchor: mergeDistinct(base.identityAnchor, identityGuard),
    bodyAndWardrobe: base.bodyAndWardrobe || defaults.bodyAndWardrobe,
    expressionAndPose: base.expressionAndPose || defaults.expressionAndPose,
    scene: mergeDistinct(
      scene?.trim() || `按创作描述执行场景与事件：${brief.trim()}`,
      base.scene,
      defaults.scene,
    ),
    lighting: base.lighting || defaults.lighting,
    camera: base.camera || defaults.camera,
    style: mergeDistinct(visualStyle, base.style || defaults.style),
    mustKeep: mergeDistinct(base.mustKeep, mustKeep, "优先服从创作描述中的核心主体、情绪与场景要求"),
    avoid: mergeDistinct(base.avoid, "文字、水印、标志、塑料皮肤、肢体畸形、身份漂移、风格漂移"),
    aspectRatio: defaults.aspectRatio,
  };
};
