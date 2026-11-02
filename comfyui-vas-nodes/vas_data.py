"""数据层：只用标准库。

单独拆出来的理由：ComfyUI 运行时才需要 torch，而「数据能不能读到」这件事
应该能被随时验证，不该被 torch 绑住。`python3 selftest.py` 就靠这个模块。
"""

from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.request
from typing import Any

CACHE_DIR = os.path.join(os.path.expanduser("~"), ".cache", "vas-nodes")
UA = {"User-Agent": "virtual-asset-studio-comfyui/1.0"}

# 与 electron/services/reference-library.ts 保持同一份口子。
SITES: dict[str, dict[str, str]] = {
    "pose": {"base": "https://ai-pose-gallery.anhao.app", "path": "/data/pose-zh.json"},
    "costume": {"base": "https://ai-pose-gallery.anhao.app", "path": "/data/costume-zh.json"},
    "portrait": {"base": "https://ai-pose-gallery.anhao.app", "path": "/data/portrait-zh.json"},
    "depth": {"base": "https://ai-pose-depth-gallery.pages.dev", "path": "/", "inline": "const D="},
    "anime": {"base": "https://ai-costume-anime-gallery.pages.dev", "path": "/", "inline": "const D="},
}

# char-db-cn 不是静态 JSON，是 window.CHARDB={items:[...]}；图片分两处托管。
CHARDB_DATA = "https://raw.githubusercontent.com/sleepy-zone/char-db-cn/main/data.js"
CHARDB_IMAGE_BASE = "https://charadb-2fi.pages.dev"

CHARDB_SETS = {"hair": "发型", "outfit": "服装", "pose": "姿势"}

SITE_LABELS = {
    "pose": "姿势",
    "costume": "服装",
    "portrait": "人像",
    "depth": "深度",
    "anime": "动漫衣装",
}


def fetch(url: str, cache_name: str, *, refresh: bool = False, timeout: int = 60) -> bytes:
    os.makedirs(CACHE_DIR, exist_ok=True)
    cached = os.path.join(CACHE_DIR, cache_name)
    if not refresh and os.path.exists(cached) and os.path.getsize(cached) > 0:
        with open(cached, "rb") as handle:
            return handle.read()
    request = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = response.read()
    # 上游偶尔会给出截断的响应；只有能解析的结果才落地成缓存。
    with open(cached, "wb") as handle:
        handle.write(payload)
    return payload


def inline_array(html: str, marker: str) -> list[dict[str, Any]]:
    """从 SPA 首页抠出 const D=[...]；括号配对扫描，字符串内的括号不误判。"""
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


def load_rows(site: str, *, refresh: bool = False) -> list[dict[str, Any]]:
    config = SITES[site]
    if "inline" not in config:
        cache = os.path.join(CACHE_DIR, f"{site}.json")
        # JSON 站可以先验一遍缓存是否完整，避免半截文件永久生效。
        if not refresh and os.path.exists(cache):
            try:
                json.loads(open(cache, "rb").read().decode("utf-8"))
            except Exception:
                os.remove(cache)
    raw = fetch(config["base"] + config["path"], f"{site}.{'html' if 'inline' in config else 'json'}", refresh=refresh)
    text = raw.decode("utf-8", errors="replace")
    if "inline" in config:
        return inline_array(text, config["inline"])
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return []
    return parsed if isinstance(parsed, list) else []


def image_url(site: str, row: dict[str, Any]) -> str:
    base = SITES[site]["base"]
    if site == "depth":
        tail = row.get("サムネ") or row.get("原寸") or ""
    elif site == "anime":
        tail = row.get("画像") or row.get("サムネ") or ""
    else:
        tail = row.get("原图") or row.get("缩略图") or ""
    return f"{base}/{tail}" if tail else ""


def label(site: str, row: dict[str, Any]) -> str:
    if site == "pose":
        # 带上编号和角度：只写名字的话下拉里五个角度一模一样，
        # 而且深度匹配要靠编号才找得到对应条目。
        code = str(row.get("姿势编号", "")).strip()
        name = row.get("姿势名称", "")
        angle = row.get("角度", "")
        return f"{code} · {name} · {angle}".strip(" ·")
    if site == "depth":
        return f"{row.get('ポーズ名', '')} · {row.get('アングル', '')}".strip(" ·")
    if site == "anime":
        return f"{row.get('カテゴリ', '')} · {row.get('id', '')}".strip(" ·")
    for key in ("姿势名称", "服装名称", "标题", "发型名称", "名称"):
        if row.get(key):
            return str(row[key])
    return str(row.get("id", ""))


def choices(site: str, *, refresh: bool = False) -> list[str]:
    labels = [label(site, row) for row in load_rows(site, refresh=refresh)]
    return labels or ["（数据还没下载成功，检查网络后重启 ComfyUI）"]


def load_char_db(*, refresh: bool = False) -> list[dict[str, Any]]:
    """解析 window.CHARDB 里的 items。"""
    raw = fetch(CHARDB_DATA, "chardb.js", refresh=refresh)
    text = raw.decode("utf-8", errors="replace")
    marker = text.find("window.CHARDB")
    if marker < 0:
        return []
    open_at = text.find("{", marker)
    if open_at < 0:
        return []
    depth = 0
    in_string = False
    escaped = False
    for index in range(open_at, len(text)):
        char = text[index]
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
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                try:
                    parsed = json.loads(text[open_at : index + 1])
                except json.JSONDecodeError:
                    return []
                items = parsed.get("items")
                return items if isinstance(items, list) else []
    return []


def char_db_rows(set_name: str, *, refresh: bool = False) -> list[dict[str, Any]]:
    return [row for row in load_char_db(refresh=refresh) if row.get("set") == set_name]


def char_db_label(row: dict[str, Any]) -> str:
    name = row.get("zh") or row.get("id") or ""
    category = row.get("catZh") or row.get("cat") or ""
    return f"{category} · {name}" if category else str(name)


def char_db_image_url(row: dict[str, Any]) -> str:
    item_id = str(row.get("id", ""))
    return f"{CHARDB_IMAGE_BASE}/img/{urllib.parse.quote(item_id)}.jpg" if item_id else ""


def cache_name_for(site: str, row: dict[str, Any]) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", str(row.get("id", "x")))
    return f"{site}-{safe}.img"
