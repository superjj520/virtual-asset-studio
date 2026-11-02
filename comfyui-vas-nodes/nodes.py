"""虚拟资产创作工作台 · ComfyUI 选图节点。

把云端参考库（姿势 / 深度 / 服装 / 人像 / 动漫衣装）搬进 ComfyUI 的原生弹窗里，
选一条就输出可直接进 ControlNet / IPAdapter 的 IMAGE。

数据源与主应用一致，均为公开的静态 JSON；首次使用会下载并缓存到本地。
"""

from __future__ import annotations

import json
import os
import re
import urllib.request
from typing import Any

import numpy as np
import torch

CACHE_DIR = os.path.join(os.path.expanduser("~"), ".cache", "vas-nodes")
UA = {"User-Agent": "virtual-asset-studio-comfyui/1.0"}

# 站点 → 数据来源。与 electron/services/reference-library.ts 保持同一份口子。
SITES: dict[str, dict[str, str]] = {
    "pose": {"base": "https://ai-pose-gallery.anhao.app", "path": "/data/pose-zh.json"},
    "costume": {"base": "https://ai-pose-gallery.anhao.app", "path": "/data/costume-zh.json"},
    "portrait": {"base": "https://ai-pose-gallery.anhao.app", "path": "/data/portrait-zh.json"},
    # 深度站与动漫衣装站是 SPA，数据内联在首页里，解析方式见 _inline_array。
    "depth": {"base": "https://ai-pose-depth-gallery.pages.dev", "path": "/", "inline": "const D="},
    "anime": {"base": "https://ai-costume-anime-gallery.pages.dev", "path": "/", "inline": "const D="},
}


def _fetch(url: str, cache_name: str) -> bytes:
    os.makedirs(CACHE_DIR, exist_ok=True)
    cached = os.path.join(CACHE_DIR, cache_name)
    if os.path.exists(cached) and os.path.getsize(cached) > 0:
        with open(cached, "rb") as handle:
            return handle.read()
    request = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = response.read()
    with open(cached, "wb") as handle:
        handle.write(payload)
    return payload


def _inline_array(html: str, marker: str) -> list[dict[str, Any]]:
    """从 SPA 首页里抠出 const D=[...]；括号配对扫描，字符串内的括号不误判。"""
    start = html.find(marker)
    if start < 0:
        return []
    open_at = html.find("[", start)
    if open_at < 0:
        return []
    depth = 0
    in_string = False
    escaped = False
    for index in range(open_at, len(html)):
        char = html[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(html[open_at : index + 1])
                except json.JSONDecodeError:
                    return []
    return []


def load_rows(site: str) -> list[dict[str, Any]]:
    config = SITES[site]
    raw = _fetch(config["base"] + config["path"], f"{site}.cache")
    text = raw.decode("utf-8", errors="replace")
    if "inline" in config:
        return _inline_array(text, config["inline"])
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return []
    return parsed if isinstance(parsed, list) else []


def _image_url(site: str, row: dict[str, Any]) -> str:
    base = SITES[site]["base"]
    if site == "depth":
        return f"{base}/{row.get('サムネ') or row.get('原寸') or ''}"
    if site == "anime":
        return f"{base}/{row.get('画像') or row.get('サムネ') or ''}"
    return str(row.get("原图") or row.get("缩略图") or "")


def _label(site: str, row: dict[str, Any]) -> str:
    if site == "depth":
        return f"{row.get('ポーズ名', '')} · {row.get('アングル', '')}"
    if site == "anime":
        return f"{row.get('カテゴリ', '')} · {row.get('id', '')}"
    for key in ("姿势名称", "服装名称", "标题", "发型名称", "名称"):
        if row.get(key):
            return str(row[key])
    return str(row.get("id", ""))


def _choices(site: str) -> list[str]:
    rows = load_rows(site)
    labels = [_label(site, row) for row in rows]
    return labels or ["（数据还没下载成功，检查网络后重启 ComfyUI）"]


def _to_tensor(payload: bytes) -> torch.Tensor:
    from io import BytesIO

    from PIL import Image

    image = Image.open(BytesIO(payload)).convert("RGB")
    array = np.array(image).astype(np.float32) / 255.0
    return torch.from_numpy(array).unsqueeze(0)


def _load_image(site: str, label: str) -> tuple[torch.Tensor, str]:
    rows = load_rows(site)
    for row in rows:
        if _label(site, row) == label:
            url = _image_url(site, row)
            if not url:
                break
            cache_name = f"{site}-{re.sub(r'[^A-Za-z0-9._-]', '_', str(row.get('id', 'x')))}.img"
            return _to_tensor(_fetch(url, cache_name)), label
    # 找不到就退回一张 64×64 灰图，让流程继续跑而不是整个工作流崩掉。
    return torch.zeros((1, 64, 64, 3), dtype=torch.float32), f"未找到：{label}"


class _GalleryBase:
    SITE = ""
    LABEL = ""

    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        return {
            "required": {
                "选择": (_choices(cls.SITE), {"default": _choices(cls.SITE)[0]}),
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
        if 刷新数据:
            for name in os.listdir(CACHE_DIR) if os.path.isdir(CACHE_DIR) else []:
                if name.startswith(self.SITE):
                    os.remove(os.path.join(CACHE_DIR, name))
        return _load_image(self.SITE, 选择)


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


class VASCharacterRecipe:
    """把身份 / 服装 / 姿态 / 深度四张图拼成一张参考板，直接接 IPAdapter 或 ControlNet。"""

    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        return {
            "required": {
                "身份": ("IMAGE",),
                "服装": ("IMAGE",),
                "姿态": ("IMAGE",),
                "深度": ("IMAGE",),
                "底色": ("STRING", {"default": "#101014"}),
            },
        }

    RETURN_TYPES = ("IMAGE", "INT", "INT")
    RETURN_NAMES = ("参考板", "宽", "高")
    FUNCTION = "compose"
    CATEGORY = "虚拟资产"

    def compose(self, 身份, 服装, 姿态, 深度, 底色: str = "#101014"):  # noqa: N803
        cells = [身份, 服装, 姿态, 深度]
        side = 512
        canvas = torch.zeros((1, side * 2, side * 2, 3), dtype=torch.float32)
        for index, cell in enumerate(cells):
            resized = torch.nn.functional.interpolate(
                cell.permute(0, 3, 1, 2), size=(side, side), mode="bilinear", align_corners=False
            ).permute(0, 2, 3, 1)[0]
            row, column = divmod(index, 2)
            canvas[0, row * side : (row + 1) * side, column * side : (column + 1) * side] = resized
        return canvas, side * 2, side * 2


NODE_CLASS_MAPPINGS = {
    "VASPoseGallery": VASPoseGallery,
    "VASDepthGallery": VASDepthGallery,
    "VASCostumeGallery": VASCostumeGallery,
    "VASPortraitGallery": VASPortraitGallery,
    "VASAnimeCostumeGallery": VASAnimeCostumeGallery,
    "VASCharacterRecipe": VASCharacterRecipe,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "VASPoseGallery": "虚拟资产 · 姿势库",
    "VASDepthGallery": "虚拟资产 · 深度图库",
    "VASCostumeGallery": "虚拟资产 · 服装库",
    "VASPortraitGallery": "虚拟资产 · 人像库",
    "VASAnimeCostumeGallery": "虚拟资产 · 动漫衣装",
    "VASCharacterRecipe": "虚拟资产 · 参考板合成",
}
