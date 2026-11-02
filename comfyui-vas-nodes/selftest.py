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

# 2026-11-02 实测基线。上游增减时这里会报 "!"，不是失败，是先提醒有人去看一眼。
EXPECTED = {"pose": 1439, "costume": 1407, "portrait": 1499, "depth": 1439, "anime": 1320, "chardb": 2347}


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

    # 这几个图床都在国外，SSL 握手偶尔会超时。重试两次再判失败，
    # 否则跑一次自检的结果取决于当次网络抖动，不能用来判断数据源好坏。
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "vas-selftest"})
            with _OPENER.open(request, timeout=30) as response:
                size = response.headers.get("content-length", "?")
                print(f"      图片可访问：HTTP {response.status}, {size} bytes")
            return True
        except Exception as error:  # noqa: BLE001
            last_error = error
            if attempt < 2:
                print(f"      第 {attempt + 1} 次取图失败（{type(error).__name__}），重试…")
    print(f"      ✗ 图片取不到：{type(last_error).__name__}: {last_error}")
    return False


# 这几个站点直连可达；macOS 系统里配了但没在运行的代理会让 urllib 直接 Connection refused，
# 而这里只做「数据源还在不在」的自检，不需要经过用户代理。
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


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
