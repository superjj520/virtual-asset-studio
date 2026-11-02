#!/usr/bin/env python3
"""验证「用深度图」开关能把姿势换成同一张图的深度版。

姿势库和深度库是同一批图的两套名字（中文名 / 日文名），`id` 完全一致：
`full_sexy_P001_front` 在两边都存在，只是一个叫「S形站姿・胯部侧顶」、
另一个叫「S字立ち・腰を横に突き出す」。所以只能按 id 对。

按编号对是错的：`P001` 底下有 4 个不同姿势、每个 5 个角度，按编号会挑错人。

    python3 depth_test.py            # 用缓存
    python3 depth_test.py --refresh  # 重新下载

不需要 torch：只比字符串。
"""
from __future__ import annotations

import importlib
import sys
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

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

package = types.ModuleType("vas_nodes")
package.__path__ = [str(HERE)]
sys.modules["vas_nodes"] = package
nodes = importlib.import_module("vas_nodes.nodes")
vas = importlib.import_module("vas_nodes.vas_data")


def main() -> int:
    refresh = "--refresh" in sys.argv
    poses = vas.load_rows("pose", refresh=refresh)
    depths = vas.load_rows("depth", refresh=refresh)
    if not poses or not depths:
        print("✗ 数据没下载成功，先检查网络")
        return 1

    depth_by_id = {str(row.get("id", "")): row for row in depths}
    total = hit = 0
    first_miss = ""
    for row in poses:
        choice = vas.label("pose", row)
        got = nodes._depth_choice_for_pose(choice)
        want = depth_by_id.get(str(row.get("id", "")))
        total += 1
        if want is not None and got == vas.label("depth", want):
            hit += 1
        elif not first_miss:
            first_miss = f"{choice} -> {got or '（空）'}"

    rate = hit / total * 100 if total else 0.0
    print(f"姿势 {len(poses)} 条，深度 {len(depths)} 条")
    print(f"按 id 精确匹配 {hit}/{total} = {rate:.1f}%")
    if first_miss:
        print(f"首个未匹配：{first_miss}")
    if hit == total:
        print("✓ 每条姿势都能换成同一张图的深度版，角度也对得上")
        return 0
    print("✗ 有姿势换不到深度版")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
