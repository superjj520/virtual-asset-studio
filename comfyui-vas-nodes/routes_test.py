# -*- coding: utf-8 -*-
"""图库路由的纯逻辑检查（不联网、不需要 ComfyUI）。

跑法：python3 routes_test.py

覆盖：分页窗口、搜索匹配、缩略图地址白名单、未知 id 的处理。
register_routes() 依赖 aiohttp 与 PromptServer，这里不测——它只在 ComfyUI 里生效。
"""

from __future__ import annotations

import importlib
import sys
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent

# 目录名带连字符，import 不了；照 prompt_test.py 的办法注册成 vas_nodes 包。
sys.path.insert(0, str(HERE))
_package = types.ModuleType("vas_nodes")
_package.__path__ = [str(HERE)]
sys.modules["vas_nodes"] = _package

vas_data = importlib.import_module("vas_nodes.vas_data")
routes = importlib.import_module("vas_nodes.routes")


POSE_ROWS = [
    {"id": f"full_P{i:03d}_front", "体系": "全身", "分类": "立ち", "姿勢名稱": "S字", "角度": "正面", "縮略圖": f"thumbs/P{i:03d}.jpg"}
    for i in range(1, 101)
]
DEPTH_ROWS = [
    {"id": f"full_P{i:03d}_front", "系統": "全身", "分類": "立ち", "ポーズ名": "S字立ち", "アングル": "正面", "サムネ": f"thumbs/d{i:03d}.jpg"}
    for i in range(1, 101)
]
CHARDB_ROWS = [
    {"id": "AUT-0001", "set": "outfit2", "fields": {"关键词": "denim skirt"}},
    {"id": "HAR-0001", "set": "hair", "fields": {"发型": "long"}},
]

FAKE = {"pose": POSE_ROWS, "depth": DEPTH_ROWS, "costume": [], "portrait": [], "anime": []}


def fake_load_rows(site, *, refresh=False):
    return FAKE.get(site, [])


def fake_load_char_db(*, refresh=False):
    return CHARDB_ROWS


def fake_image_url(site, row):
    if site == "depth":
        return f"https://ai-pose-depth-gallery.pages.dev/{row.get('サムネ', '')}"
    return f"https://ai-pose-gallery.anhao.app/{row.get('縮略圖', '')}"


def fake_label(site, row):
    if site == "depth":
        return f"{row.get('ポーズ名')} · {row.get('アングル')}"
    return f"{row.get('姿勢名稱')} · {row.get('角度')}"


checns: list[str] = []


def check(condition: bool, message: str) -> None:
    if not condition:
        checns.append(message)
        print(f"  ✗ {message}")


def main() -> int:
    # 打桩：这些测试只验逻辑，不该真的去拉 1,439 条姿势库
    vas_data.load_rows = fake_load_rows
    vas_data.load_char_db = fake_load_char_db
    vas_data.image_url = fake_image_url
    vas_data.label = fake_label
    vas_data.char_db_label = lambda row: f"{row['set']} · {row['id']}"
    vas_data.char_db_image_url = lambda row: f"https://charadb-2fi.pages.dev/img/{row['id']}.jpg"

    print("检查分页：")
    page = routes.search_entries("pose", "", 0, 10)
    check(page["total"] == 100, f"总数应为 100，实得 {page['total']}")
    check(len(page["items"]) == 10, f"首页应 10 条，实得 {len(page['items'])}")
    check(page["items"][0]["thumb"].startswith("/vas_gallery/thumb?"), "缩略图应指向本服务代理地址")
    check("anhao.app" not in page["items"][0]["thumb"], "缩略图地址不应把远程域名暴露给前端")
    print(f"  ✓ 总数 {page['total']}，首页 {len(page['items'])} 条，缩略图走代理")

    print("检查翻页：")
    tail = routes.search_entries("pose", "", 95, 10)
    check(len(tail["items"]) == 5, f"末页应 5 条，实得 {len(tail['items'])}")
    check(tail["items"][0]["id"] == "full_P096_front", f"末页首条应为 P096，实得 {tail['items'][0]['id']}")
    print(f"  ✓ 末页 {len(tail['items'])} 条，首条 {tail['items'][0]['id']}")

    print("检查搜索：")
    hit = routes.search_entries("pose", "立ち", 0, 10)
    check(hit["matched"] == 100, f"按分类搜应命中 100，实得 {hit['matched']}")
    miss = routes.search_entries("pose", "不存在的词", 0, 10)
    check(miss["matched"] == 0 and not miss["items"], "搜不到时应返回空列表")
    print(f"  ✓ 命中 {hit['matched']}，无结果时返回空")

    print("检查二次元换装库合并：")
    pack = routes.search_entries("chardb", "denim", 0, 10)
    check(pack["total"] == 2, f"chardb 应为 2 条，实得 {pack['total']}")
    check(pack["matched"] == 1, f"搜 denim 应命中 1，实得 {pack['matched']}")
    check(pack["items"][0]["id"] == "chardb-AUT-0001", f"id 应带来源前缀，实得 {pack['items'][0]['id']}")
    print(f"  ✓ chardb {pack['total']} 条，搜 denim 命中 {pack['matched']}")

    print("检查缩略图白名单：")
    for bad_url, why in [
        ("https://evil.example.com/a.jpg", "未知主机"),
        ("file:///etc/passwd", "非 http"),
        ("https://ai-pose-gallery.anhao.app.evil.com/a.jpg", "后缀伪装"),
    ]:
        try:
            routes.fetch_thumbnail(bad_url)
            check(False, f"{why} 应被拒绝，却放行了")
        except ValueError:
            pass
    print("  ✓ 未知主机 / 非 http / 后缀伪装 全部拒绝")

    print("检查未知 id：")
    try:
        routes.thumbnail_url("pose", "不存在")
        check(False, "未知 id 应抛 KeyError")
    except KeyError:
        pass
    print("  ✓ 未知 id 抛 KeyError")

    if checns:
        print(f"\n✗ {len(checns)} 项未通过")
        return 1
    print("\n✓ 图库路由逻辑全部通过")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
