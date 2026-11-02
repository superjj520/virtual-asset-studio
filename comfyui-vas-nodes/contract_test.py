#!/usr/bin/env python3
"""没装 ComfyUI 时能做的契约验证：节点类是否符合 ComfyUI 的加载规范。

注入假的 torch / numpy / PIL，只验结构，不验出图。
ComfyUI 加载 custom_nodes 时会做这几件事，任何一件不对都会在启动时报红。

    python3 contract_test.py
"""

from __future__ import annotations

import sys
import types
from typing import Any

# ---- 假依赖：够让 nodes.py 被 import 即可 ----
torch = types.ModuleType("torch")
torch.Tensor = type("Tensor", (), {})
torch.zeros = lambda *a, **k: torch.Tensor()
torch.from_numpy = lambda arr: torch.Tensor()
torch.nn = types.SimpleNamespace(
    functional=types.SimpleNamespace(interpolate=lambda *a, **k: torch.Tensor())
)
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

# 让相对 import 生效：把本目录当成包
sys.path.insert(0, ".")
import importlib

package = types.ModuleType("vas_nodes")
package.__path__ = ["."]
sys.modules["vas_nodes"] = package
nodes = importlib.import_module("vas_nodes.nodes")

failures: list[str] = []


def require(condition: bool, message: str) -> None:
    if not condition:
        failures.append(message)


def check_input(name: str, value: Any) -> None:
    """ComfyUI 要求每个输入是 (类型, 参数字典) 的二元组。"""
    require(isinstance(value, tuple) and len(value) == 2, f"{name}: 输入定义必须是二元组")
    if not isinstance(value, tuple) or len(value) != 2:
        return
    kind, options = value
    require(isinstance(options, dict), f"{name}: 输入参数必须是 dict")
    allowed = (str, int, float, bool, list)
    require(
        isinstance(kind, allowed) or (isinstance(kind, tuple) and isinstance(kind[0], str)),
        f"{name}: 类型必须是字符串或字面量元组，实际是 {type(kind).__name__}",
    )
    if isinstance(kind, list):
        require(len(kind) > 0, f"{name}: 下拉选项为空")
        require(all(isinstance(item, str) for item in kind), f"{name}: 下拉选项必须全是字符串")


print("检查 NODE_CLASS_MAPPINGS：")
require(isinstance(nodes.NODE_CLASS_MAPPINGS, dict), "NODE_CLASS_MAPPINGS 必须是 dict")
require(
    set(nodes.NODE_CLASS_MAPPINGS) == set(nodes.NODE_DISPLAY_NAME_MAPPINGS),
    "NODE_CLASS_MAPPINGS 与 NODE_DISPLAY_NAME_MAPPINGS 的键必须一一对应",
)

for key, cls in nodes.NODE_CLASS_MAPPINGS.items():
    display = nodes.NODE_DISPLAY_NAME_MAPPINGS.get(key, "?")
    label = f"{key}（{display}）"
    try:
        inputs = cls.INPUT_TYPES()
    except Exception as error:  # noqa: BLE001
        failures.append(f"{label}: INPUT_TYPES() 抛错 —— {type(error).__name__}: {error}")
        continue
    require(isinstance(inputs, dict), f"{label}: INPUT_TYPES 必须返回 dict")
    require("required" in inputs, f"{label}: 缺少 required 段")
    for section in ("required", "optional"):
        for input_name, spec in (inputs.get(section) or {}).items():
            check_input(f"{label}.{section}.{input_name}", spec)

    require(isinstance(getattr(cls, "RETURN_TYPES", None), tuple), f"{label}: RETURN_TYPES 必须是 tuple")
    require(
        isinstance(getattr(cls, "RETURN_NAMES", None), tuple),
        f"{label}: RETURN_NAMES 必须是 tuple",
    )
    require(
        len(cls.RETURN_TYPES) == len(cls.RETURN_NAMES),
        f"{label}: RETURN_TYPES 与 RETURN_NAMES 数量不一致",
    )
    function_name = getattr(cls, "FUNCTION", None)
    require(function_name in dir(cls), f"{label}: FUNCTION={function_name} 在类里不存在")
    require(isinstance(getattr(cls, "CATEGORY", None), str), f"{label}: 缺少 CATEGORY")
    print(f"  {'✓' if not failures else '?'} {label}: {len(inputs.get('required', {}))} 个必填输入")

print()
if failures:
    print(f"✗ {len(failures)} 处不符合 ComfyUI 规范：")
    for item in failures:
        print("   -", item)
    raise SystemExit(1)
print(f"✓ {len(nodes.NODE_CLASS_MAPPINGS)} 个节点全部符合 ComfyUI 加载规范")
