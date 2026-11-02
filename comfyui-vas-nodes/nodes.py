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


def _to_tensor(payload: bytes) -> torch.Tensor:
    from PIL import Image

    image = Image.open(BytesIO(payload)).convert("RGB")
    array = np.array(image).astype(np.float32) / 255.0
    return torch.from_numpy(array).unsqueeze(0)


def _load_image(site: str, choice: str, refresh: bool = False) -> tuple[torch.Tensor, str]:
    for row in load_rows(site, refresh=refresh):
        if label(site, row) != choice:
            continue
        url = image_url(site, row)
        if not url:
            break
        return _to_tensor(fetch(url, cache_name_for(site, row), refresh=refresh)), choice
    # 找不到就退回一张 64×64 灰图，让流程继续跑而不是整个工作流崩掉。
    return torch.zeros((1, 64, 64, 3), dtype=torch.float32), f"未找到：{choice}"


class _GalleryBase:
    SITE = ""
    LABEL = ""

    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        return {
            "required": {
                "选择": (choices(cls.SITE), {"default": choices(cls.SITE)[0]}),
            },
            "optional": {
                "刷新数据": ("BOOLEAN", {"default": False}),
            },
        }

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("图片", "名称")
    FUNCTION = "run"
    CATEGORY = "虚拟资产"

    def run(self, 选择: str, 刷新数据: bool = False):  # noqa: N803 - ComfyUI 入参允许中文
        if 刷新数据 and os.path.isdir(CACHE_DIR):
            for name in os.listdir(CACHE_DIR):
                if name.startswith(self.SITE):
                    os.remove(os.path.join(CACHE_DIR, name))
        return _load_image(self.SITE, 选择, refresh=刷新数据)


class VASPoseGallery(_GalleryBase):
    """姿势库：1,439 张五视角姿势线稿。"""

    SITE = "pose"


class VASDepthGallery(_GalleryBase):
    """深度图库：1,439 张 ControlNet Depth 专用图。"""

    SITE = "depth"


class VASCostumeGallery(_GalleryBase):
    """服装库：1,407 套，另含 char-db-cn 的 440 套。"""

    SITE = "costume"


class VASPortraitGallery(_GalleryBase):
    """人像库：1,499 张正脸参考与造型氛围。"""

    SITE = "portrait"


class VASAnimeCostumeGallery(_GalleryBase):
    """动漫衣装库：1,320 套。"""

    SITE = "anime"


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

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("图片", "名称")
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
            return _to_tensor(fetch(url, f"chardb-{row.get('id', 'x')}.img", refresh=刷新数据)), 选择
        return torch.zeros((1, 64, 64, 3), dtype=torch.float32), f"未找到：{选择}"


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
            },
        }

    RETURN_TYPES = ("IMAGE", "INT", "INT")
    RETURN_NAMES = ("参考板", "宽", "高")
    FUNCTION = "compose"
    CATEGORY = "虚拟资产"

    def compose(  # noqa: N803
        self,
        身份,
        服装=None,
        姿态=None,
        深度=None,
        底色: str = "#101014",
    ):
        """只接身份也能出图：缺的格子留底色，不会因为少连一根线就跑不了。"""
        rgb = _hex_to_rgb(底色)
        cells = [身份, 服装, 姿态, 深度]
        side = 512
        canvas = torch.zeros((1, side * 2, side * 2, 3), dtype=torch.float32)
        canvas[0, :, :, 0] = rgb[0]
        canvas[0, :, :, 1] = rgb[1]
        canvas[0, :, :, 2] = rgb[2]
        for index, cell in enumerate(cells):
            if cell is None:
                continue
            resized = torch.nn.functional.interpolate(
                cell.permute(0, 3, 1, 2), size=(side, side), mode="bilinear", align_corners=False
            ).permute(0, 2, 3, 1)[0]
            row, column = divmod(index, 2)
            canvas[0, row * side : (row + 1) * side, column * side : (column + 1) * side] = resized
        return (canvas, side * 2, side * 2)


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
