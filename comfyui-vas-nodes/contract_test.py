#!/usr/bin/env python3
"""没装 ComfyUI 时能做的契约验证：节点类是否符合 ComfyUI 的加载规范。

注入假的 torch / numpy / PIL，只验结构，不验出图。
ComfyUI 加载 custom_nodes 时会做这几件事，任何一件不对都会在启动时报红。

    python3 contract_test.py
"""

from __future__ import annotations

import sys
import types
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent

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

# 让相对 import 生效：把脚本所在目录当成包（从任何 cwd 跑都成立）
sys.path.insert(0, str(HERE))
import importlib

package = types.ModuleType("vas_nodes")
package.__path__ = [str(HERE)]
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
def check_returns(module) -> list[str]:
    """run() 返回的元组长度必须等于 RETURN_TYPES 长度。

    ComfyUI 严格按 RETURN_TYPES 截取，多出来的会被静默丢掉——
    VASCharacterPack 就曾经声明 2 个输出、实际返回 3 个，提示词一直没送到下游，
    但界面和加载都不报错，只有把返回值个数和声明对上才看得出来。
    """
    import ast
    import pathlib

    problems: list[str] = []
    tree = ast.parse(pathlib.Path(HERE / "nodes.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if not isinstance(node, ast.ClassDef):
            continue
        declared = 0
        for item in node.body:
            if isinstance(item, ast.Assign):
                for target in item.targets:
                    if isinstance(target, ast.Name) and target.id == "RETURN_TYPES":
                        if isinstance(item.value, ast.Tuple):
                            declared = len(item.value.elts)
        if not declared:
            continue
        for item in node.body:
            if not isinstance(item, ast.FunctionDef) or item.name not in {"run", "compose"}:
                continue
            for sub in ast.walk(item):
                if isinstance(sub, ast.Return) and isinstance(sub.value, ast.Tuple):
                    got = len(sub.value.elts)
                    if got != declared:
                        problems.append(
                            f"{node.name}.{item.name}() 返回 {got} 个值，但 RETURN_TYPES 只声明了 {declared} 个"
                        )
    return problems


print(f"✓ {len(nodes.NODE_CLASS_MAPPINGS)} 个节点全部符合 ComfyUI 加载规范")

return_problems = check_returns(nodes)
if return_problems:
    for problem in return_problems:
        print(f"  ✗ {problem}")
    raise SystemExit(f"✗ {len(return_problems)} 处返回值个数与 RETURN_TYPES 不一致")
print("✓ 每个 run() 的返回值个数都和 RETURN_TYPES 对得上")

# ---- 下拉选项必须能唯一定位 ----
# 人像库同一个发型有多张样本（「短发・标准款」301 条）。标签不去重的话，
# ComfyUI 的下拉里就是 301 个一模一样的串，用户选了也拿不准是哪一张。
import vas_data

sample = ["短发・标准款"] * 3 + ["长发・大波浪", "短发・标准款"] * 2 + ["独有的标题"]
deduped = vas_data.dedupe_labels(sample)
if len(set(deduped)) != len(deduped):
    raise SystemExit(f"✗ dedupe_labels 之后还有重名：{deduped}")
if "短发・标准款 · 1" not in deduped or "短发・标准款 · 5" not in deduped:
    raise SystemExit(f"✗ 重名标签没按出现顺序编号：{deduped}")
if "独有的标题" not in deduped:
    raise SystemExit(f"✗ 只出现一次的标签被无端加了后缀：{deduped}")
if len(deduped) != len(sample):
    raise SystemExit(f"✗ 去重不能丢条目：{len(sample)} → {len(deduped)}")
print("✓ 重名标签会补组内序号，唯一标签保持原样")
