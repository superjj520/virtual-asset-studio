#!/usr/bin/env python3
"""验证提示词构建：不需要 torch，只看字符串。

选完图直接输出一句中文描述，接 CLIPTextEncode 就能用——这是对齐 anhao 插件的
那三个 STRING 输出。这里只验字符串拼接，不验出图。

    python3 prompt_test.py
"""
from __future__ import annotations

import importlib
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
