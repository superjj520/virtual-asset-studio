/**
 * 画面质感预设。
 *
 * 和「画风预设」是两件事，别混：
 * - 画风（`reference-styles.ts`）说的是**哪种影像语言**——电影写实、时装大片、动画赛璐璐；
 * - 质感说的是这语言**长什么样**——噪点、颗粒、色偏、高光滚降、动态范围。
 *
 * 分开的理由来自竞品实测（`docs/R55-PROMPT-COMPETITOR-TRUEJPEG.md`）：144 条作品里
 * 84% 单独写了一段「照片质感」，而「像不像 AI 图」八成由这一段决定。
 * 同一套电影写实，可以拍成 CCD 直闪，也可以拍成胶片负片，画风不变、成片气质完全不同。
 */

export type TexturePreset = {
  id: string;
  label: string;
  summary: string;
  positive: string;
};

export const TEXTURE_PRESETS: TexturePreset[] = [
  {
    id: "ccd_flash",
    label: "CCD 直闪",
    summary: "2000s 便携数码直闪、粗颗粒、暗部青绿偏色",
    positive:
      "2000s 日系便携 CCD 极低照度直闪抓拍质感：有限动态范围、轻微柔焦、明显数字噪点与粗颗粒，黑位压深，暗部带轻微青绿色与灰紫色偏色，高光边缘轻微溢出但不糊",
  },
  {
    id: "film_grain",
    label: "胶片颗粒",
    summary: "35mm 负片、细腻颗粒、高光柔和滚降",
    positive:
      "35mm 胶片负片质感：细腻均匀的银盐颗粒，高光柔和滚降不过曝，暗部保留细节，轻微暖色偏移，整体宽容度大",
  },
  {
    id: "digital_clean",
    label: "数码纯净",
    summary: "现代高像素、无噪点、锐利细节",
    positive:
      "现代高像素数码直出：画面干净无噪点，细节锐利，白平衡准确，动态范围充足，肤色过渡平滑",
  },
  {
    id: "phone_snap",
    label: "手机随手拍",
    summary: "广角、轻微涂抹、HDR 味、生活感",
    positive:
      "手机随手抓拍质感：广角轻微透视变形，HDR 算法味的高光压制与暗部提亮，细节有轻微涂抹感，色彩略饱和，日常不做作的氛围",
  },
  {
    id: "cinema_negative",
    label: "电影负片",
    summary: "宽容度大、渐变细腻、轻微光晕",
    positive:
      "电影摄影机负片质感：极大的宽容度，高光与暗部都保留层次，色彩分级克制偏冷，轻微镜头光晕，颗粒极细",
  },
  {
    id: "soft_haze",
    label: "柔焦雾感",
    summary: "前镜柔焦、反差降低、高光发光",
    positive:
      "前镜柔焦加雾感：整体反差降低，高光带柔和发光，细节边缘泛开，空气中可见轻微体积雾，梦境般的通透感",
  },
  {
    id: "mono_hard",
    label: "黑白硬调",
    summary: "高反差黑白、粗颗粒、硬光",
    positive:
      "高反差黑白摄影：硬朗方向光形成清晰明暗分界，粗颗粒，纯黑与纯白都被利用，中间调压缩",
  },
  {
    id: "vintage_scan",
    label: "复古扫描",
    summary: "老照片扫描、褪色、暗角、纸纹",
    positive:
      "老照片扫描质感：整体褪色偏黄，四角轻微暗角，可见相纸纤维与细微划痕，色彩溢出边缘，年代感明显",
  },
];

const TEXTURE_BY_ID = new Map(TEXTURE_PRESETS.map((preset) => [preset.id, preset]));

export const findTexturePreset = (id: string | undefined): TexturePreset | undefined =>
  id ? TEXTURE_BY_ID.get(id) : undefined;
