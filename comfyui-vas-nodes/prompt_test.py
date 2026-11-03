#!/usr/bin/env python3
"""验证提示词构建：不需要 torch，只看字符串。

选完图直接输出一句中文描述，接 CLIPTextEncode 就能用——这是对齐 anhao 插件的
那三个 STRING 输出。这里只验字符串拼接，不验出图。

    python3 prompt_test.py
"""
from __future__ import annotations

import importlib
import pathlib
import re
import sys
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent

torch = types.ModuleType("torch")
torch.Tensor = type("Tensor", (), {})
torch.zeros = lambda *a, **k: torch.Tensor()
torch.from_numpy = lambda arr: torch.Tensor()
torch.flip = lambda tensor, dims=None: tensor
sys.modules["torch"] = torch

numpy = types.ModuleType("numpy")
numpy.ndarray = type("ndarray", (), {})
numpy.array = lambda *a, **k: numpy.ndarray()
numpy.float32 = float
sys.modules["numpy"] = numpy

PIL = types.ModuleType("PIL")
Image = types.ModuleType("PIL.Image")
Image.open = lambda *a, **k: types.SimpleNamespace(convert=lambda mode: None)
PIL.Image = Image
sys.modules["PIL"] = PIL
sys.modules["PIL.Image"] = Image

sys.path.insert(0, str(HERE))
package = types.ModuleType("vas_nodes")
package.__path__ = [str(HERE)]
sys.modules["vas_nodes"] = package
nodes = importlib.import_module("vas_nodes.nodes")
_recipe_prompt = nodes._recipe_prompt

CASES = [
    ("pose", {"角度": "斜侧", "姿势名称": "S形站姿", "体系": "全身单人・标准系", "分类": "立ち"},
     "斜侧视角，动作：S形站姿（全身单人・标准系·立ち）"),
    ("costume", {"服装名称": "象牙白针织衫", "分类": "春", "标签": ["knit", "ivory", "frill"]},
     "身穿春：象牙白针织衫（细节：knit、ivory、frill）"),
    ("portrait", {"发长": "长发", "发型名称": "微卷", "分区": "正脸参考", "标题": "标准款"},
     "人物面部与发型：长发、微卷（正脸参考）"),
    ("depth", {"アングル": "側面", "ポーズ名": "S字立ち"},
     "側面视角深度图，动作：S字立ち"),
]

failed = 0
for site, row, expected in CASES:
    actual = nodes._build_prompt(site, row)
    ok = actual == expected
    print(("  ✓ " if ok else "  ✗ ") + f"{site}: {actual}")
    if not ok:
        print(f"      期望: {expected}")
        failed += 1

# 空字段不能炸
for site in ("pose", "costume", "portrait", "depth", "anime"):
    nodes._build_prompt(site, {})
print("  ✓ 空条目不抛异常")

print()
if failed:
    print(f"✗ {failed} 项不符合预期")
    sys.exit(1)
print("✓ 提示词构建全部符合预期")


# 参考板节点的画风预设：中英各一份，英文只接 ASCII 补充词
for style, expect_en in (
    ("电影写实", "cinematic photography"),
    ("动画赛璐璐", "anime cel shading"),
    ("漫画墨线", "manga ink lineart"),
):
    zh, en = _recipe_prompt(style, "")
    assert zh == style, f"中文应为画风本身，实际 {zh!r}"
    assert expect_en in en, f"{style} 的英文应包含 {expect_en!r}，实际 {en!r}"

zh, en = _recipe_prompt("暗调氛围", "银色双眸")
assert zh == "暗调氛围，银色双眸", zh
assert "银色双眸" not in en, f"英文侧不该混入中文：{en!r}"

zh, en = _recipe_prompt("暗调氛围", "silver eyes")
assert "silver eyes" in en, en

print("  ✓ 参考板画风预设中英分列，中文补充不污染英文")

# 画风名单必须和客户端 src/shared/reference-styles.ts 一致，否则工作流里选不到。
# 这里不再手抄一份名单：抄一次的代价是每次加画风都要改三个地方，
# 而漏改的那次（R31 加尺寸模式时）直到真机跑才被发现。
_STYLES_TS = pathlib.Path(__file__).resolve().parent.parent / "src" / "shared" / "reference-styles.ts"
if _STYLES_TS.exists():
    CLIENT_STYLES = set(re.findall(r'label:\s*"([^"]+)"', _STYLES_TS.read_text(encoding="utf-8")))
    assert set(nodes.STYLE_PRESETS) == CLIENT_STYLES, set(nodes.STYLE_PRESETS) ^ CLIENT_STYLES
    assert set(nodes.STYLE_PRESET_EN) == CLIENT_STYLES, (
        f"英文映射缺：{CLIENT_STYLES - set(nodes.STYLE_PRESET_EN)}"
    )
    print(f"  ✓ {len(CLIENT_STYLES)} 种画风与客户端名单一致，中英映射无缺漏")
else:
    print("  · 跳过画风名单核对：找不到 src/shared/reference-styles.ts")
