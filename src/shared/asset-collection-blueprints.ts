import type { AssetCollectionDetail, AssetCollectionKind, AssetType } from "./types";

export type AssetCollectionModuleDefinition = {
  key: string;
  label: string;
  description: string;
  required: boolean;
  acceptedAssetTypes: AssetType[];
};

export type AssetCollectionBlueprint = {
  kind: AssetCollectionKind;
  label: string;
  purpose: string;
  modules: AssetCollectionModuleDefinition[];
};

const imageTypes: AssetType[] = ["character", "reference_image", "scene", "wardrobe", "pose", "prop", "style", "image"];

export const ASSET_COLLECTION_BLUEPRINTS: Record<AssetCollectionKind, AssetCollectionBlueprint> = {
  character: {
    kind: "character",
    label: "角色资产包",
    purpose: "锁定身份、形体、脸部、服装和可连续引用的角色证据。",
    modules: [
      { key: "identity", label: "身份与辨识", description: "年龄段、性别呈现、族裔／物种、身份气质。", required: true, acceptedAssetTypes: imageTypes },
      { key: "face", label: "脸部与五官", description: "正面、侧面、五官和面部辨识特征。", required: true, acceptedAssetTypes: imageTypes },
      { key: "body", label: "形体结构", description: "身高印象、比例、肩颈、腰胯和四肢轮廓。", required: true, acceptedAssetTypes: imageTypes },
      { key: "hair_skin", label: "发型与皮肤", description: "发色、长度、发质、发饰、肤色和真实纹理。", required: true, acceptedAssetTypes: imageTypes },
      { key: "views", label: "多角度证据", description: "正面、三分之四、侧面、背面和局部特写。", required: true, acceptedAssetTypes: imageTypes },
      { key: "wardrobe", label: "服装与搭配", description: "外衣、上装、内搭、下装、鞋袜、配饰和材质。", required: false, acceptedAssetTypes: ["wardrobe", "image", "reference_image"] },
      { key: "expression", label: "表情系统", description: "常态、微笑、情绪和微表情变化。", required: false, acceptedAssetTypes: ["character", "reference_image", "pose", "image"] },
      { key: "pose", label: "姿势与手部", description: "站姿、坐姿、重心、手势和动态动作。", required: false, acceptedAssetTypes: ["pose", "image", "reference_image"] },
      { key: "scene", label: "场景变体", description: "角色在不同环境、光线和镜头中的延展。", required: false, acceptedAssetTypes: ["scene", "image", "reference_image"] },
    ],
  },
  scene: {
    kind: "scene", label: "场景资产包", purpose: "锁定空间结构、时间气候、光线材质和可复用镜头关系。", modules: [
      { key: "establishing", label: "空间全景", description: "能读懂空间关系的建立镜头。", required: true, acceptedAssetTypes: ["scene", "image", "reference_image"] },
      { key: "angles", label: "机位与角度", description: "正向、侧向、俯仰和可用构图。", required: true, acceptedAssetTypes: ["camera", "scene", "image"] },
      { key: "lighting", label: "时间与光线", description: "时间、主光、环境光、色温和阴影方向。", required: true, acceptedAssetTypes: ["scene", "style", "image"] },
      { key: "materials", label: "材质与细节", description: "地面、墙面、玻璃、金属、植被或天气质感。", required: false, acceptedAssetTypes: ["scene", "prop", "image"] },
      { key: "props", label: "环境道具", description: "会影响叙事和人物动作的物件。", required: false, acceptedAssetTypes: ["prop", "image"] },
    ],
  },
  wardrobe: {
    kind: "wardrobe", label: "服装资产包", purpose: "把一套造型拆成可换装、可复用、可核对的服装组件。", modules: [
      { key: "silhouette", label: "整体轮廓", description: "正面、侧面、背面和穿着后的身材关系。", required: true, acceptedAssetTypes: ["wardrobe", "image", "reference_image"] },
      { key: "outerwear", label: "外衣与上装", description: "外套、上衣、领口、袖型和剪裁。", required: true, acceptedAssetTypes: ["wardrobe", "image"] },
      { key: "lower", label: "下装与腿部", description: "裤装、裙装、连体装和长度比例。", required: true, acceptedAssetTypes: ["wardrobe", "image"] },
      { key: "fabric", label: "面料与材质", description: "纹理、厚薄、垂坠、反光和工艺。", required: false, acceptedAssetTypes: ["wardrobe", "style", "image"] },
      { key: "accessories", label: "配饰与鞋袜", description: "首饰、包、腰带、袜子和鞋履。", required: false, acceptedAssetTypes: ["wardrobe", "prop", "image"] },
    ],
  },
  prop: {
    kind: "prop", label: "道具资产包", purpose: "锁定道具外观、尺度、材质、使用动作和场景关系。", modules: [
      { key: "hero", label: "主体视图", description: "道具最能识别身份的主视图。", required: true, acceptedAssetTypes: ["prop", "image", "reference_image"] },
      { key: "detail", label: "结构细节", description: "关键纹理、开合、接口和局部。", required: true, acceptedAssetTypes: ["prop", "image"] },
      { key: "scale", label: "尺度关系", description: "与人物、手部或环境的大小关系。", required: false, acceptedAssetTypes: ["prop", "image", "reference_image"] },
      { key: "material", label: "材质与磨损", description: "材质、反光、旧化和使用痕迹。", required: false, acceptedAssetTypes: ["prop", "style", "image"] },
    ],
  },
  style: {
    kind: "style", label: "风格资产包", purpose: "沉淀摄影、材质、色彩、光线和负向约束，供多个任务引用。", modules: [
      { key: "reference", label: "风格参考", description: "已确认的视觉参考和适用边界。", required: true, acceptedAssetTypes: ["style", "reference_image", "image"] },
      { key: "palette", label: "色彩系统", description: "主色、辅色、明度和禁用色。", required: true, acceptedAssetTypes: ["style", "image"] },
      { key: "light_material", label: "光线与材质", description: "光质、对比、颗粒、皮肤和表面质感。", required: false, acceptedAssetTypes: ["style", "camera", "image"] },
      { key: "usage", label: "适用与禁用", description: "适用媒介、镜头和容易跑偏的限制。", required: false, acceptedAssetTypes: ["prompt_pattern", "style"] },
    ],
  },
  reference: {
    kind: "reference", label: "参考资产包", purpose: "保留来源、可见设计维度和可迁移的创作判断，不把参考图误当作角色母版。", modules: [
      { key: "source", label: "来源与权利", description: "来源、使用范围、授权依据和限制。", required: true, acceptedAssetTypes: ["reference_image", "image", "style", "prompt_pattern"] },
      { key: "composition", label: "构图与镜头", description: "主体位置、裁切、景别、视角和镜头关系。", required: false, acceptedAssetTypes: ["camera", "reference_image", "image"] },
      { key: "visual_language", label: "视觉语言", description: "色彩、材质、光线、版式和气质。", required: false, acceptedAssetTypes: ["style", "reference_image", "image"] },
      { key: "notes", label: "可迁移判断", description: "可学习的方法、风险和不可直接复用的元素。", required: false, acceptedAssetTypes: ["prompt_pattern", "reference_image"] },
    ],
  },
};

export const getAssetCollectionBlueprint = (kind: AssetCollectionKind) => ASSET_COLLECTION_BLUEPRINTS[kind];

/** 只把已确认且权利明确的图片证据交给后续创作引用，音频等非视觉素材保留在资产包内但不混入参考图。 */
export const collectUsableReferenceAssetIds = (details: Array<AssetCollectionDetail | undefined>) => [...new Set(details.flatMap((detail) => (detail?.assets ?? [])
  .filter((asset) => asset.mediaType.startsWith("image/") && asset.confirmation === "confirmed" && ["original", "authorized"].includes(asset.rightsStatus))
  .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  .map((asset) => asset.id)))];
