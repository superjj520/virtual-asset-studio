import type { Asset, CharacterDetail, CharacterFact, CharacterVariantKind, CreativeCard } from "./types";

export type CharacterUseCase = "portrait" | "full_body" | "series";
export type CharacterSlotGroup =
  | "identity" | "body" | "face" | "hair" | "skin" | "view"
  | "wardrobe" | "expression" | "pose" | "scene";
export type CharacterSlot = {
  key: string;
  group: CharacterSlotGroup;
  label: string;
  variantKind?: CharacterVariantKind;
  requiredFor: CharacterUseCase[];
  /** 视角证据必须连接一张已经确认且可使用的素材。 */
  visualEvidence?: boolean;
};

export const CHARACTER_GROUPS: { key: CharacterSlotGroup; label: string; description: string }[] = [
  { key: "identity", label: "身份与辨识", description: "人工确认人物身份与文化设定，不从外貌猜测族裔。" },
  { key: "body", label: "形体结构", description: "形体比例与轮廓保持连续，不使用未经证实的精确身材数字。" },
  { key: "face", label: "面部五官", description: "逐项记录脸型与五官，而不是只保存一句相似度描述。" },
  { key: "hair", label: "发型与发饰", description: "分开发色、长度、质感、造型及装饰。" },
  { key: "skin", label: "肤色与质感", description: "真实肤色、纹理和辨识细节分别管理。" },
  { key: "view", label: "角度与局部参考", description: "每个视角绑定对应图片与区域，缺图时不算完成。" },
  { key: "wardrobe", label: "服装与搭配", description: "按一套造型分别管理外衣、内搭、下装、鞋袜与配饰；不适用可标记。" },
  { key: "expression", label: "表情变化", description: "不同表情可以分别成为可复用变体。" },
  { key: "pose", label: "姿势动作", description: "静态姿势、手势与动态动作分开记录。" },
  { key: "scene", label: "情境与环境", description: "场景属于变体，不应覆盖人物的恒定身份。" },
];

const all: CharacterUseCase[] = ["portrait", "full_body", "series"];
const body: CharacterUseCase[] = ["full_body", "series"];
const series: CharacterUseCase[] = ["series"];
const portrait: CharacterUseCase[] = ["portrait", "series"];
const define = (key: string, group: CharacterSlotGroup, label: string, requiredFor: CharacterUseCase[] = [], variantKind?: CharacterVariantKind, visualEvidence = false): CharacterSlot =>
  ({ key, group, label, requiredFor, variantKind, visualEvidence });

export const CHARACTER_SLOTS: CharacterSlot[] = [
  define("identity.age", "identity", "成年年龄段", all),
  define("identity.gender", "identity", "性别呈现"),
  define("identity.ancestry", "identity", "族裔／物种设定"),
  define("identity.persona", "identity", "辨识身份与气质", all),
  define("body.height", "body", "身高印象"),
  define("body.proportions", "body", "身材比例", body),
  define("body.build", "body", "形体轮廓", body),
  define("body.shoulders", "body", "肩颈与上身"),
  define("body.waist_hip", "body", "腰胯与下身"),
  define("body.limbs", "body", "手臂与腿型"),
  define("face.shape", "face", "脸型", all),
  define("face.eyes", "face", "眼睛", all),
  define("face.brows", "face", "眉形"),
  define("face.nose", "face", "鼻子"),
  define("face.lips", "face", "嘴唇"),
  define("face.ears", "face", "耳朵"),
  define("face.marks", "face", "面部辨识特征"),
  define("face.jaw_cheeks", "face", "下颌与面颊"),
  define("hair.color", "hair", "发色", all),
  define("hair.length", "hair", "长度"),
  define("hair.texture", "hair", "发质与光泽"),
  define("hair.style", "hair", "发型结构", all),
  define("hair.bangs", "hair", "刘海与鬓发"),
  define("hair.accessory", "hair", "发饰"),
  define("hair.hairline", "hair", "发际线"),
  define("skin.tone", "skin", "肤色", all),
  define("skin.undertone", "skin", "肤色冷暖"),
  define("skin.texture", "skin", "皮肤纹理"),
  define("skin.marks", "skin", "身体辨识特征"),
  define("view.face_front", "view", "面部正面", portrait, undefined, true),
  define("view.face_side", "view", "面部侧面", series, undefined, true),
  define("view.front", "view", "全身正面", body, undefined, true),
  define("view.side", "view", "全身侧面", series, undefined, true),
  define("view.back", "view", "全身背面", series, undefined, true),
  define("view.hair_back", "view", "发型背面", [], undefined, true),
  define("view.detail", "view", "局部细节", [], undefined, true),
  define("wardrobe.outerwear", "wardrobe", "外衣／外套", [], "look"),
  define("wardrobe.top", "wardrobe", "上装", body, "look"),
  define("wardrobe.innerwear", "wardrobe", "内搭", [], "look"),
  define("wardrobe.underwear_top", "wardrobe", "内衣上装／胸衣", [], "look"),
  define("wardrobe.underwear_bottom", "wardrobe", "内裤", [], "look"),
  define("wardrobe.lower", "wardrobe", "下装整体轮廓", body, "look"),
  define("wardrobe.pants", "wardrobe", "裤装", [], "look"),
  define("wardrobe.skirt", "wardrobe", "裙装", [], "look"),
  define("wardrobe.dress", "wardrobe", "连衣裙／连体装", [], "look"),
  define("wardrobe.underwear", "wardrobe", "贴身衣物总览", [], "look"),
  define("wardrobe.socks", "wardrobe", "袜子／袜裤", [], "look"),
  define("wardrobe.shoes", "wardrobe", "鞋履", body, "look"),
  define("wardrobe.accessories", "wardrobe", "首饰与配件", [], "look"),
  define("wardrobe.palette", "wardrobe", "配色与材质", [], "look"),
  define("wardrobe.fabric", "wardrobe", "面料与纹理", [], "look"),
  define("wardrobe.fit", "wardrobe", "剪裁与合身度", [], "look"),
  define("expression.neutral", "expression", "常态表情", all, "expression"),
  define("expression.smile", "expression", "笑容", [], "expression"),
  define("expression.intense", "expression", "情绪表情", [], "expression"),
  define("pose.standing", "pose", "基础站姿", body, "pose"),
  define("pose.seated", "pose", "坐姿", [], "pose"),
  define("pose.gesture", "pose", "手势", [], "pose"),
  define("pose.gaze", "pose", "视线方向", [], "pose"),
  define("pose.weight_shift", "pose", "重心与受力", [], "pose"),
  define("pose.action", "pose", "动态动作", series, "pose"),
  define("scene.location", "scene", "场景背景", series, "scene"),
  define("scene.lighting", "scene", "环境光线", [], "scene"),
];

export const findCharacterSlot = (key: string) => CHARACTER_SLOTS.find((slot) => slot.key === key);

export type CharacterVariantSelection = Partial<Record<CharacterVariantKind, string>>;
export type CharacterCoverage = {
  status: "empty" | "incomplete" | "ready";
  requiredCount: number;
  confirmedRequiredCount: number;
  totalCount: number;
  confirmedCount: number;
  excludedCount: number;
  evidenceLinkedCount: number;
  missingRequiredKeys: string[];
  unverifiedKeys: string[];
};

const availableAsset = (asset: Asset) => asset.confirmation === "confirmed" &&
  (asset.rightsStatus === "original" || asset.rightsStatus === "authorized");

/** 当前造型与表情在基础配置之上覆写；未选中的变体不会混入角色卡。 */
export const activeCharacterFacts = (detail: CharacterDetail, selection: CharacterVariantSelection = {}): CharacterFact[] => {
  const active = new Map<string, CharacterFact>();
  for (const fact of detail.facts) if (!fact.variantId) active.set(fact.slotKey, fact);
  for (const fact of detail.facts) {
    const kind = findCharacterSlot(fact.slotKey)?.variantKind ??
      ({ wardrobe: "look", expression: "expression", pose: "pose", scene: "scene" } as Record<string, CharacterVariantKind>)[fact.group];
    if (kind && fact.variantId && selection[kind] === fact.variantId &&
      (fact.state === "not_applicable" || characterFactIsUsable(fact, detail))) active.set(fact.slotKey, fact);
  }
  return [...active.values()];
};

export const characterFactIsUsable = (fact: CharacterFact, detail: CharacterDetail) => {
  if (fact.state !== "confirmed" || (!fact.value.trim() && !fact.evidence.length)) return false;
  const slot = findCharacterSlot(fact.slotKey);
  if (slot?.visualEvidence && !fact.evidence.length) return false;
  return fact.evidence.every(({ assetId, region }) => detail.evidenceAssets.some((asset) => asset.id === assetId && availableAsset(asset) &&
    (!(slot?.visualEvidence || region) || asset.mediaType.startsWith("image/"))));
};

export const evaluateCharacterCoverage = (
  detail: CharacterDetail, purpose: CharacterUseCase, selection: CharacterVariantSelection = {},
): CharacterCoverage => {
  const active = activeCharacterFacts(detail, selection);
  const current = new Map(active.map((fact) => [fact.slotKey, fact]));
  const required = CHARACTER_SLOTS.filter((slot) => slot.requiredFor.includes(purpose));
  const missingRequiredKeys = required.filter((slot) => {
    const fact = current.get(slot.key);
    return !fact || !characterFactIsUsable(fact, detail);
  }).map((slot) => slot.key);
  const unverifiedKeys = active.filter((fact) => fact.state !== "not_applicable" && !characterFactIsUsable(fact, detail)).map((fact) => fact.slotKey);
  const confirmed = active.filter((fact) => characterFactIsUsable(fact, detail));
  return {
    status: !active.length ? "empty" : missingRequiredKeys.length ? "incomplete" : "ready",
    requiredCount: required.length, confirmedRequiredCount: required.length - missingRequiredKeys.length,
    totalCount: CHARACTER_SLOTS.length + active.filter((fact) => !findCharacterSlot(fact.slotKey)).length,
    confirmedCount: confirmed.length,
    excludedCount: active.filter((fact) => fact.state === "not_applicable").length,
    evidenceLinkedCount: confirmed.reduce((total, fact) => total + fact.evidence.length, 0),
    missingRequiredKeys, unverifiedKeys,
  };
};

const describe = (items: CharacterFact[]) => items.map((fact) => `${fact.label}：${fact.value.trim()}`)
  .filter((value) => !value.endsWith("：")).join("；");

/** 只把人工确认、来源仍有效的细项写入创作卡；草稿与其他变体保持在资产层。 */
export const composeCharacterCard = (
  detail: CharacterDetail, selection: CharacterVariantSelection = {},
): CreativeCard => {
  const confirmed = activeCharacterFacts(detail, selection).filter((fact) => characterFactIsUsable(fact, detail));
  const byGroup = (...groups: string[]) => confirmed.filter((fact) => groups.includes(fact.group));
  const references = new Set<string>();
  for (const assetId of [detail.masterAssetId, ...detail.card.referenceAssetIds, ...confirmed.flatMap((fact) => fact.evidence.map((item) => item.assetId))]) {
    if (assetId && detail.evidenceAssets.some((asset) => asset.id === assetId && availableAsset(asset) && asset.mediaType.startsWith("image/"))) references.add(assetId);
  }
  return {
    ...detail.card,
    subject: detail.name,
    identityAnchor: describe(byGroup("identity", "face", "hair", "skin")),
    bodyAndWardrobe: describe(byGroup("body", "wardrobe")),
    expressionAndPose: describe(byGroup("expression", "pose")),
    scene: describe(byGroup("scene")),
    mustKeep: undefined,
    referenceAssetIds: [...references],
  };
};
