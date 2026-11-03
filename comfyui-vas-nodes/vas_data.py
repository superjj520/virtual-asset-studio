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

HERE = os.path.dirname(os.path.abspath(__file__))
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
# Shisei 的法线图（CC0 1.0 可商用）。清单内置成 JSON，只有图片本身联网——
# 上游 catalog.json 挂在 raw.githubusercontent，限速时 20 秒都拿不到，
# 那种情况下不该让整个下拉变成空的。清单由 scripts/export-shisei-catalog.mjs
# 从 electron/services/shisei-catalog.ts 导出，两边同一份。
NORMAL_CATALOG = os.path.join(HERE, "normal-catalog.json")
NORMAL_BASE = "https://raw.githubusercontent.com/wquguru/shisei/main/images/normal/w600"
NORMAL_VIEW_LABELS = {
    "front": "正面",
    "diag": "斜侧",
    "side": "侧面",
    "above": "俯视",
    "below": "仰视",
}

CHARDB_DATA = "https://raw.githubusercontent.com/sleepy-zone/char-db-cn/main/data.js"
CHARDB_IMAGE_BASE = "https://charadb-2fi.pages.dev"

CHARDB_SETS = {"hair": "发型", "outfit": "服装", "pose": "姿势"}

SITE_LABELS = {
    "pose": "姿势",
    "costume": "服装",
    "portrait": "人像",
    "depth": "深度",
    "anime": "动漫衣装",
    "normal": "法线",
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


def load_normal_rows() -> list[dict[str, Any]]:
    """把内置的法线清单展开成一条一行的「一张图一行」。

    清单是 {series, id, name, category, views}，一个姿势有 2–5 个视角，
    每个视角是一张独立的图，下拉里也得是独立的一项。
    """
    try:
        data = json.loads(open(NORMAL_CATALOG, "rb").read().decode("utf-8"))
    except Exception:
        return []
    rows: list[dict[str, Any]] = []
    for pose in data.get("poses") or []:
        for view in str(pose.get("views") or "").split(","):
            view = view.strip()
            if not view:
                continue
            rows.append(
                {
                    "id": f"{pose.get('id')}-{view}",
                    "名称": pose.get("name") or "",
                    "分类": pose.get("category") or "法线",
                    "角度": NORMAL_VIEW_LABELS.get(view, view),
                    "文件": f"{pose.get('series')}_{pose.get('id')}_{view}.webp",
                }
            )
    return rows


def load_rows(site: str, *, refresh: bool = False) -> list[dict[str, Any]]:
    if site == "normal":
        # 清单在本地，不走网络，也不受上游限速影响。
        return load_normal_rows()
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
    base = NORMAL_BASE if site == "normal" else SITES[site]["base"]
    if site == "normal":
        tail = row.get("文件") or ""
    elif site == "depth":
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
    if site == "normal":
        # 和 App 侧一致：名字 · 视角。姿势编号不进标题，因为法线是按视角分的，
        # 用户找的是「哪个姿势的哪一面」，编号对他是噪声。
        return f"{row.get('名称', '')} · {row.get('角度', '')}".strip(" ·")
    for key in ("姿势名称", "服装名称", "标题", "发型名称", "名称"):
        if row.get(key):
            return str(row[key])
    return str(row.get("id", ""))


def dedupe_labels(labels: list[str]) -> list[str]:
    """把重名的标签补上组内序号，保证下拉里每一项都能唯一定位。

    人像库是「同一个发型的多张样本」：「短发・标准款」有 301 条，标签完全一样的话
    下拉里就是 301 个一模一样的选项，用户没法说自己要的是哪一张。
    只出现一次的标签保持原样，不在界面上无端加后缀。
    姿势/深度/动漫衣装本来就把编号或角度写进标签，天然唯一，加不到它们身上。
    """
    total: dict[str, int] = {}
    for text in labels:
        total[text] = total.get(text, 0) + 1
    seen: dict[str, int] = {}
    out: list[str] = []
    for text in labels:
        if total[text] > 1:
            n = seen.get(text, 0) + 1
            seen[text] = n
            out.append(f"{text} · {n}")
        else:
            out.append(text)
    return out


def choices(site: str, *, refresh: bool = False) -> list[str]:
    labels = [label(site, row) for row in load_rows(site, refresh=refresh)]
    if not labels:
        return ["（数据还没下载成功，检查网络后重启 ComfyUI）"]
    return dedupe_labels(labels)


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
