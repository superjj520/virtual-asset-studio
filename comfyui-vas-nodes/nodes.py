"""虚拟资产创作工作台 · ComfyUI 选图节点。

把云端参考库（姿势 / 深度 / 服装 / 人像 / 动漫衣装）搬进 ComfyUI 的原生弹窗里，
选一条就输出可直接进 ControlNet / IPAdapter 的 IMAGE。

数据层在 vas_data.py（只用标准库），这个文件只管 torch 与节点契约。
安装：把整个 comfyui-vas-nodes 目录复制到 ComfyUI/custom_nodes/ 下，重启 ComfyUI。
"""

from __future__ import annotations

import os
from io import BytesIO
from typing import Any

import numpy as np
import torch

from .vas_data import (
    CACHE_DIR,
    CHARDB_SETS,
    cache_name_for,
    char_db_image_url,
    char_db_label,
    char_db_rows,
    choices,
    fetch,
    image_url,
    label,
    load_rows,
)


# 与客户端 src/shared/reference-styles.ts 的 12 种画风保持一致，
# 名字对不上就会变成工作流里选不到、或者选到了却和界面上不是同一个。
STYLE_PRESETS = [
    "电影写实",
    "时装大片",
    "棚拍肖像",
    "自然日光",
    "暗调氛围",
    "东方水墨",
    "动画赛璐璐",
    "漫画墨线",
    "古典油画",
    "水彩插画",
    "赛博霓虹",
    "胶片颗粒",
]

STYLE_PRESET_EN = {
    "电影写实": "cinematic photography, natural skin texture, realistic lens falloff, shallow depth of field",
    "时装大片": "high fashion editorial, dramatic lighting, glossy finish",
    "棚拍肖像": "studio portrait, soft key light, seamless backdrop",
    "自然日光": "natural daylight, soft shadows, outdoor",
    "暗调氛围": "low-key lighting, moody atmosphere, dark tones",
    "东方水墨": "eastern ink wash painting, flowing brush strokes, rice paper texture",
    "动画赛璐璐": "anime cel shading, flat color blocks, clean lineart",
    "漫画墨线": "manga ink lineart, high contrast, screentone",
    "古典油画": "classical oil painting, chiaroscuro, visible brushwork",
    "水彩插画": "watercolor illustration, soft edges, paper texture",
    "赛博霓虹": "cyberpunk neon, magenta and cyan rim light",
    "胶片颗粒": "film grain, analog color rendition, slight halation",
}


RESIZE_MODES = ["原图尺寸", "缩放到指定尺寸", "裁切填满"]
# 拼图节点不能用 RESIZE_MODES：2×2 拼板必须有统一的格子尺寸，
# 「原图尺寸」放进来会跟「缩放到指定尺寸」走成同一条路（实测两张输出字节完全相同）。
# 换成「跟随身份图」——格子直接取身份图的原始高宽，宽度/高度两参数这时不参与。
RECIPE_RESIZE_MODES = ["缩放到指定尺寸", "裁切填满", "跟随身份图"]


def _to_tensor(payload: bytes, resize_mode: str = "原图尺寸", width: int = 0, height: int = 0) -> torch.Tensor:
    """把图片字节转成 ComfyUI 的 IMAGE 张量，并按需缩放或裁切。"""
    from PIL import Image

    image = Image.open(BytesIO(payload)).convert("RGB")
    if resize_mode == "缩放到指定尺寸" and width > 0 and height > 0:
        image = image.resize((width, height), Image.LANCZOS)
    elif resize_mode == "裁切填满" and width > 0 and height > 0:
        # 先按短边放大到能盖住目标框，再从中间裁掉多余部分，不拉伸比例。
        scale = max(width / image.width, height / image.height)
        resized = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.LANCZOS)
        left = (resized.width - width) // 2
        top = (resized.height - height) // 2
        image = resized.crop((left, top, left + width, top + height))
    array = np.array(image).astype(np.float32) / 255.0
    return torch.from_numpy(array).unsqueeze(0)


def _flip(tensor: torch.Tensor) -> torch.Tensor:
    """水平镜像：换手、换朝向时不用另找一张图。"""
    return torch.flip(tensor, dims=[2])


def _build_prompt(site: str, row: dict[str, Any]) -> str:
    """按条目字段拼一句中文描述，选完图直接能接 CLIPTextEncode，不用手写。"""
    if site == "pose":
        angle = row.get("角度") or "正面"
        name = row.get("姿势名称") or "标准姿势"
        return f"{angle}视角，动作：{name}（{row.get('体系', '')}·{row.get('分类', '')}）"
    if site == "depth":
        name = row.get("ポーズ名") or "标准姿势"
        return f"{row.get('アングル', '正面')}视角深度图，动作：{name}"
    if site == "costume":
        title = row.get("服装名称") or row.get("标题") or ""
        tags = "、".join((row.get("标签") or [])[:8])
        return f"身穿{row.get('分类', '')}：{title}" + (f"（细节：{tags}）" if tags else "")
    if site == "portrait":
        parts = [row.get("发长", ""), row.get("发型名称") or row.get("发型") or ""]
        detail = "、".join(part for part in parts if part)
        return f"人物面部与发型：{detail or row.get('标题', '')}（{row.get('分区', '')}）"
    if site == "anime":
        keywords = row.get("キーワード", "")
        return f"动漫服装：{keywords}" if keywords else f"动漫服装：{row.get('カテゴリ', '')}"
    return str(row.get("name") or row.get("id") or "")


def _english_prompt(site: str, row: dict[str, Any]) -> str:
    """服装 / 动漫衣装的标签本身就是英文关键词，单独拼一份给 CLIP 更省 token。"""
    if site == "costume":
        tags = row.get("标签") or []
        return ", ".join(str(tag) for tag in tags[:12])
    if site == "anime":
        return str(row.get("キーワード", "") or "")
    return ""


def _english_for(site: str, choice: str) -> str:
    for row in load_rows(site):
        if label(site, row) == choice:
            return _english_prompt(site, row)
    return ""


def _load_image(
    site: str,
    choice: str,
    refresh: bool = False,
    resize_mode: str = "原图尺寸",
    width: int = 0,
    height: int = 0,
    flip_horizontal: bool = False,
) -> tuple[torch.Tensor, str, str]:
    for row in load_rows(site, refresh=refresh):
        if label(site, row) != choice:
            continue
        url = image_url(site, row)
        if not url:
            break
        tensor = _to_tensor(
            fetch(url, cache_name_for(site, row), refresh=refresh),
            resize_mode=resize_mode,
            width=width,
            height=height,
        )
        if flip_horizontal:
            tensor = _flip(tensor)
        return tensor, choice, _build_prompt(site, row)
    # 找不到就退回一张 64×64 灰图，让流程继续跑而不是整个工作流崩掉。
    return torch.zeros((1, 64, 64, 3), dtype=torch.float32), f"未找到：{choice}", ""


def _depth_choice_for_pose(pose_choice: str) -> str:
    """把姿势条目换成同一张图的深度版条目。

    姿势库和深度库是同一批图的两套名字（中文名 / 日文名），但 `id` 完全一致，
    例如两边都有 `full_sexy_P001_front`。所以按 `id` 对，不按编号也不按名字——
    编号 P001 底下有 4 个不同姿势、每个 5 个角度，按编号会挑错人。
    """
    target = ""
    for row in load_rows("pose"):
        if label("pose", row) == pose_choice:
            target = str(row.get("id", ""))
            break
    if not target:
        return ""
    for row in load_rows("depth"):
        if str(row.get("id", "")) == target:
            return label("depth", row)
    return ""


class _GalleryBase:
    SITE = ""
    LABEL = ""

    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        return {
            "required": {
                "选择": (choices(cls.SITE), {"default": choices(cls.SITE)[0]}),
                "尺寸模式": (RESIZE_MODES, {"default": "原图尺寸"}),
                "宽度": ("INT", {"default": 1024, "min": 64, "max": 4096, "step": 8}),
                "高度": ("INT", {"default": 1280, "min": 64, "max": 4096, "step": 8}),
                "水平镜像": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "刷新数据": ("BOOLEAN", {"default": False}),
            },
        }

    RETURN_TYPES = ("IMAGE", "STRING", "STRING")
    RETURN_NAMES = ("图片", "名称", "提示词")
    FUNCTION = "run"
    CATEGORY = "虚拟资产"

    def run(  # noqa: N803 - ComfyUI 入参允许中文
        self,
        选择: str,
        尺寸模式: str = "原图尺寸",
        宽度: int = 1024,
        高度: int = 1280,
        水平镜像: bool = False,
        刷新数据: bool = False,
    ):
        if 刷新数据 and os.path.isdir(CACHE_DIR):
            for name in os.listdir(CACHE_DIR):
                if name.startswith(self.SITE):
                    os.remove(os.path.join(CACHE_DIR, name))
        return _load_image(
            self.SITE,
            选择,
            refresh=刷新数据,
            resize_mode=尺寸模式,
            width=宽度,
            height=高度,
            flip_horizontal=水平镜像,
        )


class VASPoseGallery(_GalleryBase):
    """姿势库：1,439 张五视角姿势线稿。可选直接换成同一条的深度图。"""

    SITE = "pose"

    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        base = super().INPUT_TYPES()
        base["optional"]["用深度图"] = ("BOOLEAN", {"default": False})
        return base

    def run(  # noqa: N803
        self,
        选择: str,
        尺寸模式: str = "原图尺寸",
        宽度: int = 1024,
        高度: int = 1280,
        水平镜像: bool = False,
        刷新数据: bool = False,
        用深度图: bool = False,
    ):
        site = "depth" if 用深度图 else self.SITE
        if 刷新数据 and os.path.isdir(CACHE_DIR):
            for name in os.listdir(CACHE_DIR):
                if name.startswith(site):
                    os.remove(os.path.join(CACHE_DIR, name))
        choice = 选择
        if 用深度图:
            matched = _depth_choice_for_pose(选择)
            if matched:
                choice = matched
        return _load_image(
            site,
            choice,
            refresh=刷新数据,
            resize_mode=尺寸模式,
            width=宽度,
            height=高度,
            flip_horizontal=水平镜像,
        )


class VASDepthGallery(_GalleryBase):
    """深度图库：1,439 张 ControlNet Depth 专用图。"""

    SITE = "depth"


class VASCostumeGallery(_GalleryBase):
    """服装库：1,407 套，另含 char-db-cn 的 440 套。多给一份英文关键词。"""

    SITE = "costume"
    RETURN_TYPES = ("IMAGE", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("图片", "名称", "中文描述", "英文关键词")

    def run(  # noqa: N803
        self,
        选择: str,
        尺寸模式: str = "原图尺寸",
        宽度: int = 1024,
        高度: int = 1280,
        水平镜像: bool = False,
        刷新数据: bool = False,
    ):
        tensor, label_text, prompt = super().run(
            选择, 尺寸模式, 宽度, 高度, 水平镜像, 刷新数据
        )
        return tensor, label_text, prompt, _english_for(self.SITE, 选择)


class VASPortraitGallery(_GalleryBase):
    """人像库：1,499 张正脸参考与造型氛围。"""

    SITE = "portrait"


class VASAnimeCostumeGallery(_GalleryBase):
    """动漫衣装库：1,320 套。多给一份英文关键词。"""

    SITE = "anime"
    RETURN_TYPES = ("IMAGE", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("图片", "名称", "中文描述", "英文关键词")

    def run(  # noqa: N803
        self,
        选择: str,
        尺寸模式: str = "原图尺寸",
        宽度: int = 1024,
        高度: int = 1280,
        水平镜像: bool = False,
        刷新数据: bool = False,
    ):
        tensor, label_text, prompt = super().run(
            选择, 尺寸模式, 宽度, 高度, 水平镜像, 刷新数据
        )
        return tensor, label_text, prompt, _english_for(self.SITE, 选择)


class VASCharacterPack:
    """二次元角色换装库（char-db-cn）：发型 306 / 服装 440 / 姿势 281。"""

    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        set_names = list(CHARDB_SETS.values())
        return {
            "required": {
                "类别": (set_names, {"default": set_names[0]}),
                "选择": (cls._choices(set_names[0]), {"default": cls._choices(set_names[0])[0]}),
            },
            "optional": {
                "刷新数据": ("BOOLEAN", {"default": False}),
            },
        }

    RETURN_TYPES = ("IMAGE", "STRING", "STRING")
    RETURN_NAMES = ("图片", "名称", "提示词")
    FUNCTION = "run"
    CATEGORY = "虚拟资产"

    @staticmethod
    def _set_key(name: str) -> str:
        for key, value in CHARDB_SETS.items():
            if value == name:
                return key
        return next(iter(CHARDB_SETS))

    @classmethod
    def _choices(cls, set_name: str) -> list[str]:
        names = [char_db_label(row) for row in char_db_rows(cls._set_key(set_name))]
        return names or ["（还没下载成功，检查网络后重启 ComfyUI）"]

    def run(self, 类别: str, 选择: str, 刷新数据: bool = False):  # noqa: N803
        set_key = self._set_key(类别)
        if 刷新数据 and os.path.isdir(CACHE_DIR):
            cache = os.path.join(CACHE_DIR, "chardb.js")
            if os.path.exists(cache):
                os.remove(cache)
        for row in char_db_rows(set_key, refresh=刷新数据):
            if char_db_label(row) != 选择:
                continue
            url = char_db_image_url(row)
            if not url:
                break
            tensor = _to_tensor(fetch(url, f"chardb-{row.get('id', 'x')}.img", refresh=刷新数据))
            return tensor, 选择, _build_chardb_prompt(row)
        return torch.zeros((1, 64, 64, 3), dtype=torch.float32), f"未找到：{选择}", ""


def _build_chardb_prompt(row: dict[str, Any]) -> str:
    """char-db-cn 的条目只有简短的英文关键词，直接拼成一句话给 CLIP。"""
    keys = row.get("keywords") or row.get("desc") or row.get("name") or ""
    text = " ".join(keys) if isinstance(keys, list) else str(keys)
    return text.strip()


def _fit_cell(cell, cell_w: int, cell_h: int, mode: str):
    """把一格图放进拼图。两种模式必须真的不一样，否则参数就是摆设。"""
    img = cell.permute(0, 3, 1, 2)
    if mode == "裁切填满":
        # 保持比例放大到盖满格子，再从中间裁掉多余部分——人脸不会被拉扁。
        _, _, src_h, src_w = img.shape
        scale = max(cell_w / max(1, src_w), cell_h / max(1, src_h))
        new_w = max(cell_w, int(round(src_w * scale)))
        new_h = max(cell_h, int(round(src_h * scale)))
        img = torch.nn.functional.interpolate(
            img, size=(new_h, new_w), mode="bilinear", align_corners=False
        )
        top = (new_h - cell_h) // 2
        left = (new_w - cell_w) // 2
        img = img[:, :, top : top + cell_h, left : left + cell_w]
    else:
        # 「缩放到指定尺寸」与「原图尺寸」都落到这里：2×2 网格必须撑满，
        # 原图尺寸在拼图里没有可执行的含义，写成拉伸而不是假装支持。
        img = torch.nn.functional.interpolate(
            img, size=(cell_h, cell_w), mode="bilinear", align_corners=False
        )
    return img.permute(0, 2, 3, 1)[0]


class VASCharacterRecipe:
    """把身份 / 服装 / 姿态 / 深度四张图拼成一张参考板，直接接 IPAdapter 或 ControlNet。"""

    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        # ComfyUI 要求每个输入都是 (类型, 参数字典) 的二元组；写成单元素元组会在加载时报错。
        # 身份必填（没有身份就没有参考板的意义），其余三格可选，空位用底色填。
        return {
            "required": {
                "身份": ("IMAGE", {}),
            },
            "optional": {
                "服装": ("IMAGE", {}),
                "姿态": ("IMAGE", {}),
                "深度": ("IMAGE", {}),
                "底色": ("STRING", {"default": "#101014"}),
                "尺寸模式": (RECIPE_RESIZE_MODES, {"default": "缩放到指定尺寸"}),
                "宽度": ("INT", {"default": 1024, "min": 256, "max": 4096, "step": 8}),
                "高度": ("INT", {"default": 1024, "min": 256, "max": 4096, "step": 8}),
                "水平镜像": ("BOOLEAN", {"default": False}),
                "画风预设": (STYLE_PRESETS, {"default": STYLE_PRESETS[0]}),
                "补充提示词": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "placeholder": "可选补充，例如：银色双眸、教室窗边逆光、微风吹拂发丝",
                    },
                ),
            },
        }

    RETURN_TYPES = ("IMAGE", "INT", "INT", "STRING", "STRING")
    RETURN_NAMES = ("参考板", "宽", "高", "中文提示词", "英文提示词")
    FUNCTION = "compose"
    CATEGORY = "虚拟资产"

    def compose(  # noqa: N803
        self,
        身份,
        服装=None,
        姿态=None,
        深度=None,
        底色: str = "#101014",
        尺寸模式: str = "缩放到指定尺寸",
        宽度: int = 1024,
        高度: int = 1024,
        水平镜像: bool = False,
        画风预设: str = STYLE_PRESETS[0],
        补充提示词: str = "",
    ):
        """只接身份也能出图：缺的格子留底色，不会因为少连一根线就跑不了。"""
        rgb = _hex_to_rgb(底色)
        cells = [身份, 服装, 姿态, 深度]
        # 2×2 网格：每格 = 整块的一半。宽高给用户控，输出尺寸就是他说了算的那个数。
        # 「跟随身份图」例外：格子取身份图的原始高宽，宽度/高度两个参数不参与。
        if 尺寸模式 == "跟随身份图" and 身份 is not None:
            cell_h = max(64, int(身份.shape[1]))
            cell_w = max(64, int(身份.shape[2]))
        else:
            cell_w = max(64, int(宽度) // 2)
            cell_h = max(64, int(高度) // 2)
        out_w = cell_w * 2
        out_h = cell_h * 2
        canvas = torch.zeros((1, out_h, out_w, 3), dtype=torch.float32)
        canvas[0, :, :, 0] = rgb[0]
        canvas[0, :, :, 1] = rgb[1]
        canvas[0, :, :, 2] = rgb[2]
        for index, cell in enumerate(cells):
            if cell is None:
                continue
            resized = _fit_cell(cell, cell_w, cell_h, 尺寸模式)
            row, column = divmod(index, 2)
            canvas[0, row * cell_h : (row + 1) * cell_h, column * cell_w : (column + 1) * cell_w] = resized
        if 水平镜像:
            canvas = _flip(canvas)
        zh, en = _recipe_prompt(画风预设, 补充提示词)
        return (canvas, out_w, out_h, zh, en)


def _recipe_prompt(style: str, extra: str = "") -> tuple[str, str]:
    """画风预设 + 补充提示词，中文一份、英文一份。

    英文不是逐字翻译：「电影写实」直译成 "cinematic realism" 对 CLIP 不如
    "cinematic photography, natural skin texture" 有效，所以按摄影术语写。
    """
    extra = (extra or "").strip()
    zh = style + (f"，{extra}" if extra else "")
    # 英文侧只接 ASCII 补充：中文塞进 CLIP 的英文分支等于噪声。
    en = STYLE_PRESET_EN.get(style, "")
    if extra and extra.isascii():
        en = f"{en}, {extra}" if en else extra
    return zh, en.strip(", ")


def _hex_to_rgb(value: str) -> tuple[float, float, float]:
    """把 #101014 这样的颜色转成 0..1 的三元组，格式不对就退回深灰。"""
    text = (value or "").strip().lstrip("#")
    if len(text) == 3:
        text = "".join(ch * 2 for ch in text)
    if len(text) != 6:
        return (0.06, 0.06, 0.08)
    try:
        return tuple(int(text[i : i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]
    except ValueError:
        return (0.06, 0.06, 0.08)


NODE_CLASS_MAPPINGS = {
    "VASPoseGallery": VASPoseGallery,
    "VASDepthGallery": VASDepthGallery,
    "VASCostumeGallery": VASCostumeGallery,
    "VASPortraitGallery": VASPortraitGallery,
    "VASAnimeCostumeGallery": VASAnimeCostumeGallery,
    "VASCharacterPack": VASCharacterPack,
    "VASCharacterRecipe": VASCharacterRecipe,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "VASPoseGallery": "虚拟资产 · 姿势库",
    "VASDepthGallery": "虚拟资产 · 深度图库",
    "VASCostumeGallery": "虚拟资产 · 服装库",
    "VASPortraitGallery": "虚拟资产 · 人像库",
    "VASAnimeCostumeGallery": "虚拟资产 · 动漫衣装",
    "VASCharacterPack": "虚拟资产 · 二次元换装库",
    "VASCharacterRecipe": "虚拟资产 · 参考板合成",
}
