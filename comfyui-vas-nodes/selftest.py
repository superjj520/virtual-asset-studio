#!/usr/bin/env python3
"""在装进 ComfyUI 之前先验一遍：六个源的数据到底能不能读到。

只需要 Python 标准库，不需要 torch / ComfyUI。

    python3 selftest.py            # 全部站点
    python3 selftest.py pose depth # 只看这两个
    python3 selftest.py --refresh  # 忽略缓存重新下载
"""

from __future__ import annotations

import sys
import urllib.request

from vas_data import (
    SITES,
    char_db_image_url,
    char_db_label,
    load_char_db,
    image_url,
    label,
    load_rows,
)

EXPECTED = {"pose": 1439, "costume": 1407, "portrait": 1499, "depth": 1439, "anime": 1320, "chardb": 1027}


def check(site: str, refresh: bool) -> bool:
    is_chardb = site == "chardb"
    try:
        rows = load_char_db(refresh=refresh) if is_chardb else load_rows(site, refresh=refresh)
    except Exception as error:  # noqa: BLE001 - 自检脚本要把失败原样报出来
        print(f"  ✗ {site}: 拉取失败 —— {type(error).__name__}: {error}")
        return False

    if not rows:
        print(f"  ✗ {site}: 拉到了内容但没解析出条目（页面结构可能变了）")
        return False

    first = rows[0]
    name = char_db_label(first) if is_chardb else label(site, first)
    url = char_db_image_url(first) if is_chardb else image_url(site, first)
    expected = EXPECTED.get(site)
    flag = "✓" if expected is None or len(rows) == expected else "!"
    print(f"  {flag} {site}: {len(rows)} 条" + (f"（预期 {expected}）" if expected and len(rows) != expected else ""))
    print(f"      首条：{name}")
    print(f"      图片：{url}")

    if not url:
        print("      ✗ 首条没有图片地址，节点会一直回退灰图")
        return False

    try:
        request = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "vas-selftest"})
        with urllib.request.urlopen(request, timeout=30) as response:
            size = response.headers.get("content-length", "?")
            print(f"      图片可访问：HTTP {response.status}, {size} bytes")
    except Exception as error:  # noqa: BLE001
        print(f"      ✗ 图片取不到：{type(error).__name__}: {error}")
        return False
    return True


def main(argv: list[str]) -> int:
    refresh = "--refresh" in argv
    picked = [item for item in argv if not item.startswith("--")] or [*SITES, "chardb"]
    print(f"检查 {len(picked)} 个数据源{'（忽略缓存）' if refresh else '（优先用缓存）'}：")
    results = [check(site, refresh) for site in picked]
    ok = sum(1 for item in results if item)
    print(f"\n通过 {ok}/{len(picked)}")
    return 0 if ok == len(picked) else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
