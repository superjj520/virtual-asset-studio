# -*- coding: utf-8 -*-
"""为 ComfyUI 前端选图器提供图库数据与缩略图代理。

为什么需要这一层：浏览器的 <img src> 直接指向
`https://ai-pose-gallery.anhao.app/thumbs/...` 会被跨域和防盗链挡掉，
前端拿不到图；而且六个来源的数据格式各不相同（JSON / 内联 const D / window.CHARDB），
前端解析不了。所以由 ComfyUI 自己的 aiohttp 服务转一手：

    GET /vas_gallery/sites                      六个来源的元信息
    GET /vas_gallery/catalogue?site=pose&q=&offset=&limit=   条目列表
    GET /vas_gallery/thumb?site=pose&id=xxx     缩略图字节流

只在 ComfyUI 运行时注册（`server.PromptServer` 不存在时静默跳过），
所以 `python3 routes_test.py` 这种纯标准库检查不会因为缺 aiohttp 就报错。
"""

from __future__ import annotations

import urllib.error
import urllib.request
from typing import Any

from . import vas_data

# 允许代理的图片来源主机白名单。任何不在这里的地址一律拒绝——
# 这个接口是对 ComfyUI 前端开放的，不能变成任意 URL 的代理。
ALLOWED_HOSTS = {
    "ai-pose-gallery.anhao.app",
    "ai-pose-depth-gallery.pages.dev",
    "ai-costume-anime-gallery.pages.dev",
    "charadb-2fi.pages.dev",
    "raw.githubusercontent.com",
}

MAX_IMAGE_BYTES = 12 * 1024 * 1024

# 前端一次最多取多少条。图库有 1,439 条，全量塞给弹窗会卡。
MAX_LIMIT = 200
DEFAULT_LIMIT = 60

SITE_KEYS = ["pose", "depth", "costume", "portrait", "anime", "chardb"]


def site_catalogue(site: str, *, refresh: bool = False) -> list[dict[str, Any]]:
    """按站点返回统一结构的条目列表。"""
    if site == "chardb":
        # 二次元换装库分发型/服装/姿势三组，弹窗里并成一列，靠 set 区分。
        rows = vas_data.load_char_db(refresh=refresh)
        items = []
        for row in rows:
            entry = dict(row)
            entry["_site"] = "chardb"
            items.append(entry)
        return items

    if site not in SITE_KEYS:
        raise ValueError(f"未知图库来源: {site}")
    rows = vas_data.load_rows(site, refresh=refresh)
    items = []
    for row in rows:
        entry = dict(row)
        entry["_site"] = site
        items.append(entry)
    return items


def _entry_thumb(site: str, row: dict[str, Any]) -> str:
    """统一取缩略图地址（原图太大，弹窗只拉缩略图）。"""
    if site == "chardb":
        return vas_data.char_db_image_url(row)
    if site == "depth":
        return vas_data.image_url("depth", row)
    return vas_data.image_url(site, row)


def _entry_label(site: str, row: dict[str, Any]) -> str:
    if site == "chardb":
        return vas_data.char_db_label(row)
    return vas_data.label(site, row)


def _entry_id(site: str, row: dict[str, Any]) -> str:
    raw = str(row.get("id") or row.get("编号") or "")
    return f"{site}-{raw}" if site == "chardb" else raw


def _entry_tags(site: str, row: dict[str, Any]) -> str:
    """把可搜索的字段拼成一段，前端不用理解每个库的字段名。"""
    parts: list[str] = []
    for key in ("体系", "分类", "角度", "発型", "分区", "カテゴリ", "キーワード", "set", "tags"):
        value = row.get(key)
        if isinstance(value, list):
            parts.extend(str(v) for v in value)
        elif value:
            parts.append(str(value))
    fields = row.get("fields") or {}
    if isinstance(fields, dict):
        parts.extend(str(v) for v in fields.values())
    return " ".join(parts)


def search_entries(
    site: str,
    query: str = "",
    offset: int = 0,
    limit: int = DEFAULT_LIMIT,
    *,
    refresh: bool = False,
) -> dict[str, Any]:
    rows = site_catalogue(site, refresh=refresh)
    needle = (query or "").strip().lower()

    matched = rows
    if needle:
        matched = []
        for row in rows:
            haystack = f"{_entry_label(site, row)} {_entry_tags(site, row)}".lower()
            if needle in haystack:
                matched.append(row)

    safe_limit = max(1, min(int(limit or DEFAULT_LIMIT), MAX_LIMIT))
    safe_offset = max(0, int(offset or 0))
    window = matched[safe_offset : safe_offset + safe_limit]

    return {
        "site": site,
        "total": len(rows),
        "matched": len(matched),
        "offset": safe_offset,
        "limit": safe_limit,
        "items": [
            {
                "id": _entry_id(site, row),
                "label": _entry_label(site, row),
                # 给前端的是本服务的代理地址，不是远程地址——远程会被跨域挡掉。
                "thumb": f"/vas_gallery/thumb?site={site}&id={_entry_id(site, row)}",
                "tags": _entry_tags(site, row),
            }
            for row in window
        ],
    }


def find_entry(site: str, entry_id: str, *, refresh: bool = False) -> dict[str, Any]:
    for row in site_catalogue(site, refresh=refresh):
        if _entry_id(site, row) == entry_id:
            return row
    raise KeyError(f"{site} 里没有 {entry_id}")


def thumbnail_url(site: str, entry_id: str, *, refresh: bool = False) -> str:
    row = find_entry(site, entry_id, refresh=refresh)
    return _entry_thumb(site, row)


def _host_of(url: str) -> str:
    without_scheme = url.split("://", 1)[-1]
    return without_scheme.split("/", 1)[0].split("?", 1)[0]


def fetch_thumbnail(url: str, timeout: int = 20) -> tuple[bytes, str]:
    """拉一张缩略图，返回 (字节, content-type)。

    三道校验：主机白名单、大小上限、返回确实是图片。
    少任何一道，这个接口就会变成「用 ComfyUI 当跳板下载任意 URL」。
    """
    if not url.startswith(("https://", "http://")):
        raise ValueError("只接受 http/https 图片地址")

    host = _host_of(url)
    if host not in ALLOWED_HOSTS:
        raise ValueError(f"不允许代理这个主机: {host}")

    request = urllib.request.Request(url, headers=vas_data.UA)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            content_type = response.headers.get_content_type()
            if not content_type.startswith("image/"):
                raise ValueError(f"返回的不是图片: {content_type}")
            declared = response.headers.get("Content-Length")
            if declared and int(declared) > MAX_IMAGE_BYTES:
                raise ValueError("图片超过 12MB")
            payload = response.read(MAX_IMAGE_BYTES + 1)
    except urllib.error.HTTPError as exc:  # pragma: no cover - 网络分支
        raise ValueError(f"图片地址返回 {exc.code}") from exc

    if len(payload) > MAX_IMAGE_BYTES:
        raise ValueError("图片超过 12MB")
    return payload, content_type


def register_routes() -> None:
    """在 ComfyUI 里挂三条只读路由。非 ComfyUI 环境静默跳过。"""
    try:
        from aiohttp import web
        from server import PromptServer
    except ImportError:
        return

    if getattr(PromptServer, "instance", None) is None:
        return

    routes = PromptServer.instance.routes

    @routes.get("/vas_gallery/sites")
    async def get_sites(_request):
        result = []
        for site in SITE_KEYS:
            try:
                rows = site_catalogue(site)
                result.append({"site": site, "label": vas_data.SITE_LABELS.get(site, site), "count": len(rows)})
            except Exception as exc:  # 单个源挂了不影响别的，和客户端的降级策略一致
                result.append({"site": site, "label": vas_data.SITE_LABELS.get(site, site), "count": 0, "error": str(exc)})
        return web.json_response({"sites": result})

    @routes.get("/vas_gallery/catalogue")
    async def get_catalogue(request):
        site = request.query.get("site", "pose")
        try:
            payload = search_entries(
                site,
                request.query.get("q", ""),
                int(request.query.get("offset", 0) or 0),
                int(request.query.get("limit", DEFAULT_LIMIT) or DEFAULT_LIMIT),
            )
            return web.json_response(payload, headers={"Cache-Control": "no-store"})
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=400)

    @routes.get("/vas_gallery/thumb")
    async def get_thumb(request):
        site = request.query.get("site", "")
        entry_id = request.query.get("id", "")
        try:
            url = thumbnail_url(site, entry_id)
            payload, content_type = fetch_thumbnail(url)
            return web.Response(
                body=payload,
                content_type=content_type.split("/", 1)[-1],
                headers={"Cache-Control": "public, max-age=86400"},
            )
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=404)
