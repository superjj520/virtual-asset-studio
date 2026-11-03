"""对照 anhao（ai-pose-gallery）的 ComfyUI 插件，逐项确认我方没有更少。

为什么把基线写死在文件里：anhao 的插件源码不在本仓库，`/tmp` 下的副本随时会没。
写死的是 2026-11-03 从对方插件包里读到的定义；对方改版时这份基线要跟着改，
而不是让测试「恰好仍然通过」。

只做静态对照，不启动 ComfyUI：比对的是「插件声明了什么」，不是「跑起来什么样」。
跑起来的样子由 selftest.py / depth_test.py / routes_test.py 负责。

用法：
    python3 parity_test.py          # 打印对照表，有缺口时退出码 1
"""

from __future__ import annotations

import ast
import pathlib
import sys

NODES_FILE = pathlib.Path(__file__).with_name("nodes.py")

# anhao 插件包（CATEGORY 均为「AI角色三合一参考图集」）的 4 个节点。
# required / optional 里写的是对方的英文参数名。
ANHAO_BASELINE: dict[str, dict] = {
    "PoseGalleryNode": {
        "returns": ("IMAGE", "STRING", "STRING"),
        "return_names": ("姿势图", "图片ID", "姿势提示词"),
        "required": ("image_id", "resize_mode", "width", "height", "flip_horizontal"),
        "optional": ("use_depth",),
    },
    "CostumeGalleryNode": {
        "returns": ("IMAGE", "STRING", "STRING", "STRING"),
        "return_names": ("服装图", "图片ID", "中文服装描述", "英文服装Prompt"),
        "required": ("image_id", "resize_mode", "width", "height", "flip_horizontal"),
        "optional": (),
    },
    "PortraitGalleryNode": {
        "returns": ("IMAGE", "STRING", "STRING"),
        "return_names": ("人像图", "图片ID", "人像发型描述"),
        "required": ("image_id", "resize_mode", "width", "height", "flip_horizontal"),
        "optional": (),
    },
    "CharacterRecipeNode": {
        "returns": ("IMAGE", "IMAGE", "IMAGE", "IMAGE", "STRING", "STRING"),
        "return_names": (
            "人像图",
            "服装图",
            "姿势图",
            "三合一拼图",
            "中文合成Prompt",
            "英文合成Prompt",
        ),
        "required": (
            "portrait_id",
            "costume_id",
            "pose_id",
            "style_preset",
            "extra_prompt",
            "resize_mode",
            "width",
            "height",
            "flip_pose_horizontal",
        ),
        "optional": ("use_depth",),
    },
}

# 对方参数名 -> 我方参数名。没有等价项的直接留空，会判为缺口。
PARAM_EQUIV: dict[str, str] = {
    "image_id": "选择",
    "portrait_id": "身份",
    "costume_id": "服装",
    "pose_id": "姿态",
    "resize_mode": "尺寸模式",
    "width": "宽度",
    "height": "高度",
    "flip_horizontal": "水平镜像",
    "flip_pose_horizontal": "水平镜像",
    "use_depth": "用深度图",  # Recipe 的等价物是「深度」输入槽，见 PARAM_EQUIV_BY_NODE
    "style_preset": "画风预设",
    "extra_prompt": "补充提示词",
}

# 个别对等关系只在某个节点成立。Recipe 的 use_depth 是布尔开关（自己从库里换图），
# 我方是直接给一张深度 IMAGE——语义更直接，所以那一项按「深度」输入槽算已对齐。
PARAM_EQUIV_BY_NODE: dict[tuple[str, str], str] = {
    ("CharacterRecipeNode", "use_depth"): "深度",
}

# 输出个数不同但能力不减的情况，写清楚原因；有理由的才豁免，不是默认放过。
OUTPUT_SHAPE_OK: dict[str, str] = {
    "CharacterRecipeNode": (
        "对方一个节点同时回传三张单图 + 拼图；我方输入就是那三张 IMAGE，"
        "单图本来就在用户画布上，所以只回传拼图 + 中英提示词。"
    ),
}

# 对方节点 -> 我方节点。Recipe 的设计不同，见下面 parity_check 的说明。
NODE_MAP: dict[str, str] = {
    "PoseGalleryNode": "VASPoseGallery",
    "CostumeGalleryNode": "VASCostumeGallery",
    "PortraitGalleryNode": "VASPortraitGallery",
    "CharacterRecipeNode": "VASCharacterRecipe",
}


def _dict_keys(node: ast.AST) -> tuple[set[str], set[str]]:
    """从一个 dict 字面量里取 (required 的键, optional 的键)。"""
    required: set[str] = set()
    optional: set[str] = set()
    if not isinstance(node, ast.Dict):
        return required, optional
    for key, value in zip(node.keys, node.values):
        if not isinstance(key, ast.Constant):
            continue
        if key.value == "required" and isinstance(value, ast.Dict):
            required = {
                k.value for k in value.keys if isinstance(k, ast.Constant) and isinstance(k.value, str)
            }
        if key.value == "optional" and isinstance(value, ast.Dict):
            optional = {
                k.value for k in value.keys if isinstance(k, ast.Constant) and isinstance(k.value, str)
            }
    return required, optional


def _literal_strings(node: ast.AST) -> tuple[str, ...]:
    try:
        value = ast.literal_eval(node)
    except Exception:
        return ()
    if isinstance(value, (tuple, list)):
        return tuple(str(item) for item in value)
    return ()


def collect_ours() -> dict[str, dict]:
    """静态解析 nodes.py，取每个 VAS* 节点的参数与输出。

    用静态解析而不是 import：节点包依赖 torch，契约测试不该被运行环境卡住。
    """
    source = NODES_FILE.read_text(encoding="utf-8")
    tree = ast.parse(source)

    # 先取基类，子类可能只写 `base = super().INPUT_TYPES()` 再补一两个键。
    base_required: set[str] = set()
    base_optional: set[str] = set()
    base_returns: tuple[str, ...] = ()
    base_return_names: tuple[str, ...] = ()
    classes: dict[str, ast.ClassDef] = {}
    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            classes[node.name] = node
            if node.name == "_GalleryBase":
                for stmt in node.body:
                    if isinstance(stmt, ast.Assign) and isinstance(stmt.targets[0], ast.Name):
                        if stmt.targets[0].id == "RETURN_TYPES":
                            base_returns = _literal_strings(stmt.value)
                        elif stmt.targets[0].id == "RETURN_NAMES":
                            base_return_names = _literal_strings(stmt.value)
                    if isinstance(stmt, ast.FunctionDef) and stmt.name == "INPUT_TYPES":
                        for inner in ast.walk(stmt):
                            if isinstance(inner, ast.Return) and inner.value is not None:
                                r, o = _dict_keys(inner.value)
                                base_required |= r
                                base_optional |= o
                                break

    result: dict[str, dict] = {}
    for name, node in classes.items():
        if not name.startswith("VAS"):
            continue
        inherits_gallery = any(
            isinstance(base, ast.Name) and base.id == "_GalleryBase" for base in node.bases
        )
        info: dict = {
            "returns": base_returns if inherits_gallery else (),
            "return_names": base_return_names if inherits_gallery else (),
            "required": set(base_required) if inherits_gallery else set(),
            "optional": set(base_optional) if inherits_gallery else set(),
        }

        for stmt in node.body:
            if isinstance(stmt, ast.Assign) and isinstance(stmt.targets[0], ast.Name):
                key = stmt.targets[0].id
                if key == "RETURN_TYPES":
                    info["returns"] = _literal_strings(stmt.value)
                elif key == "RETURN_NAMES":
                    info["return_names"] = _literal_strings(stmt.value)
            if isinstance(stmt, ast.FunctionDef) and stmt.name == "INPUT_TYPES":
                # 子类里再补的键（例如姿势节点的 base["optional"]["用深度图"]）。
                # 整函数遍历：子类可能先写 base["optional"]["x"] = ... 再 return base，
                # 只看最后一句会漏掉前面补的键。
                for inner in ast.walk(stmt):
                    if not isinstance(inner, ast.Subscript):
                        continue
                    inner_key = inner.slice.value if isinstance(inner.slice, ast.Constant) else None
                    outer = inner.value
                    outer_key = (
                        outer.slice.value
                        if isinstance(outer, ast.Subscript) and isinstance(outer.slice, ast.Constant)
                        else None
                    )
                    if outer_key in ("required", "optional") and isinstance(inner_key, str):
                        info[outer_key].add(inner_key)
                    elif inner_key in ("required", "optional") and outer_key is not None:
                        info[inner_key].add(str(outer_key))
                # 有的子类直接把整个 dict 写出来，没有继承。
                for inner in ast.walk(stmt):
                    if isinstance(inner, ast.Return) and isinstance(inner.value, ast.Dict):
                        r, o = _dict_keys(inner.value)
                        if r or o:
                            info["required"] = r
                            info["optional"] = o
                            break
        result[name] = info
    return result


def parity_check() -> int:
    ours = collect_ours()
    problems: list[str] = []
    rows: list[tuple[str, str, str, str]] = []

    for anhao_name, spec in ANHAO_BASELINE.items():
        our_name = NODE_MAP[anhao_name]
        if our_name not in ours:
            problems.append(f"{anhao_name}: 我方没有对应节点 {our_name}")
            continue
        mine = ours[our_name]

        missing_params: list[str] = []
        for pname in spec["required"] + spec["optional"]:
            local = PARAM_EQUIV_BY_NODE.get((anhao_name, pname)) or PARAM_EQUIV.get(pname)
            if not local:
                missing_params.append(pname)
                continue
            if local not in mine["required"] and local not in mine["optional"]:
                missing_params.append(f"{pname}->{local}")

        # 输出数量：我方可以更少，但每个对方的输出都得有对应物或者有替代方案。
        ours_ok = len(mine["returns"]) >= len(spec["returns"])
        param_text = "齐" if not missing_params else "缺 " + "、".join(missing_params)
        out_text = (
            f"{len(mine['returns'])}/{len(spec['returns'])}"
            if ours_ok
            else f"{len(mine['returns'])}/{len(spec['returns'])} 少"
        )
        rows.append((anhao_name, our_name, param_text, out_text))
        if missing_params:
            problems.append(f"{anhao_name}: 参数缺口 {missing_params}")
        if not ours_ok and anhao_name not in OUTPUT_SHAPE_OK:
            problems.append(
                f"{anhao_name}: 我方 {our_name} 输出 {len(mine['returns'])} 个，"
                f"对方 {len(spec['returns'])} 个"
            )

    width = max(len(row[0]) for row in rows) if rows else 10
    print(f"{'anhao 节点'.ljust(width)}  {'我方节点':<22} 参数  输出")
    for anhao_name, our_name, param_text, out_text in rows:
        print(f"{anhao_name.ljust(width)}  {our_name:<22} {param_text:<6}{out_text}")

    # Recipe 的输出形态不同：对方一个节点同时给三张单图 + 拼图，我方只给拼图。
    # 不算缺口，因为我方输入就是已连好的 IMAGE——那三张单图本来就在用户画布上。
    # 这里显式记一句，免得下一个人以为漏掉了。
    print()
    print("Recipe 输出形态说明：对方按 id 自己加载并回传三张单图；我方输入是 IMAGE，")
    print("单图本来就在画布上，所以只回传拼图 + 中英提示词。形态不同，能力不减。")

    extra = sorted(set(ours) - set(NODE_MAP.values()))
    if extra:
        print()
        print("我方额外节点：" + "、".join(extra))

    if problems:
        print()
        print("有缺口：")
        for item in problems:
            print(f"  - {item}")
        return 1
    print()
    print("对照通过：对方 4 个节点的参数与输出，我方都有对应物。")
    return 0


if __name__ == "__main__":
    sys.exit(parity_check())
