export type ReferenceStyle = {
  id: string;
  label: string;
  summary: string;
  positive: string;
  negative: string;
};

export const REFERENCE_STYLES: ReferenceStyle[] = [
  {
    id: "cinematic_real",
    label: "电影写实",
    summary: "自然皮肤、真实光影、浅景深",
    positive: "电影写实摄影，自然皮肤纹理，真实镜头光晕，浅景深，克制的色彩分级",
    negative: "塑料皮肤、过度磨皮、CG 感",
  },
  {
    id: "editorial_fashion",
    label: "时装大片",
    summary: "硬光、杂志构图、高级质感",
    positive: "高级时装大片，硬朗方向光，杂志封面构图，精致面料质感，干净背景",
    negative: "廉价影楼光、杂乱道具、过度滤镜",
  },
  {
    id: "studio_portrait",
    label: "棚拍肖像",
    summary: "柔光棚、纯色背景、五官清晰",
    positive: "专业棚拍肖像，柔光箱照明，纯色背景，五官结构清晰，肤色自然",
    negative: "环境杂乱、强阴影、广角畸变",
  },
  {
    id: "soft_daylight",
    label: "自然日光",
    summary: "窗光、低对比、生活感",
    positive: "自然窗光，柔和低对比，真实生活场景，通透肤色，轻微空气感",
    negative: "闪光灯直打、死白背景、塑料质感",
  },
  {
    id: "dark_mood",
    label: "暗调氛围",
    summary: "低调光、冷色、电影情绪",
    positive: "暗调电影氛围，低调光，冷色环境反射，柔和轮廓光，克制的情绪表达",
    negative: "死黑、噪点、灯光过曝",
  },
  {
    id: "oriental_ink",
    label: "东方水墨",
    summary: "留白、墨色、东方服饰",
    positive: "东方水墨审美，大面积留白，墨色层次，细腻东方服饰纹理，含蓄气质",
    negative: "西式油画、艳丽撞色、塑料发丝",
  },
  {
    id: "anime_cel",
    label: "动画赛璐璐",
    summary: "干净线稿、平涂、明亮色彩",
    positive: "动画赛璐璐风格，干净线稿，平涂色块，清晰高光，统一角色设计",
    negative: "写实皮肤、3D 渲染、杂乱线条",
  },
  {
    id: "comic_ink",
    label: "漫画墨线",
    summary: "强墨线、网点、戏剧构图",
    positive: "漫画墨线风格，强对比墨线，细密网点，戏剧性构图，统一角色设定",
    negative: "真实照片、柔焦、低对比",
  },
  {
    id: "oil_painting",
    label: "古典油画",
    summary: "厚涂、暖色、伦勃朗光",
    positive: "古典油画，厚涂笔触，暖色罩染，伦勃朗式侧光，细腻织物层次",
    negative: "数码平涂、过度锐化、廉价滤镜",
  },
  {
    id: "watercolor",
    label: "水彩插画",
    summary: "透明叠色、纸纹、轻盈",
    positive: "水彩插画，透明叠色，纸张纹理，轻盈边缘，柔和人物结构",
    negative: "厚重油彩、硬边矢量、照片质感",
  },
  {
    id: "cyber_neon",
    label: "赛博霓虹",
    summary: "冷蓝紫、霓虹反光、未来感",
    positive: "赛博朋克霓虹氛围，冷蓝紫主光，湿地面反光，未来都市层次",
    negative: "日光棚拍、暖黄复古、塑料高光",
  },
  {
    id: "analog_film",
    label: "模拟胶片",
    summary: "低饱和、颗粒、生活快照",
    positive: "模拟胶片摄影，低饱和，细腻颗粒，自然高光滚降，生活快照氛围",
    negative: "数码锐化、过度 HDR、塑料皮肤",
  },
  {
    id: "anime_hd",
    label: "高清日系动漫",
    summary: "赛璐璐＋厚涂、通透光影",
    positive: "日系二次元动漫插画风格，精致五官，赛璐璐与厚涂结合，光影通透，高画质杰作",
    negative: "写实照片、油腻厚涂、五官变形",
  },
  {
    id: "korean_semi",
    label: "韩系半厚涂插画",
    summary: "半厚涂、丝滑高光、高级配色",
    positive: "韩系唯美半厚涂角色立绘，细腻丝滑高光，柔美体积感，高级色彩搭配",
    negative: "平涂色块、灰脏配色、僵硬姿态",
  },
  {
    id: "character_sheet",
    label: "干净角色设定图",
    summary: "浅底、轮廓清晰、看清褶皱",
    positive: "游戏角色立绘设定图，干净浅灰或纯白背景，轮廓清晰，服装材质与褶皱细节丰富",
    negative: "复杂背景、强烈投影、模糊轮廓",
  },
];

const STYLE_BY_ID = new Map(REFERENCE_STYLES.map((style) => [style.id, style]));

export const findReferenceStyle = (id: string | undefined): ReferenceStyle | undefined =>
  id ? STYLE_BY_ID.get(id) : undefined;
