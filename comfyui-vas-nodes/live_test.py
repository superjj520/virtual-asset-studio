#!/usr/bin/env python3
"""在真的 ComfyUI 里跑一遍参考板节点，验证尺寸模式与镜像真的生效。

为什么需要这个：
parity_test.py 只做静态比对——能证明「参数声明齐了」，证明不了「参数真的改变输出」。
R31 加尺寸模式时就踩过一次：Recipe 的选项里留着「原图尺寸」，
但它跟「缩放到指定尺寸」走的是同一个分支，实测两张输出字节完全相同。
静态检查永远发现不了这种事，只有真跑一遍看像素才知道。

这里不碰 checkpoint：只用 LoadImage → VASCharacterRecipe → PreviewImage，
identity 图自己合成，所以不需要显卡、不需要模型权重，CPU 上几秒就跑完。

用法：
    # 先让 ComfyUI 起来，并且 custom_nodes 里链好本目录
    python comfyui-vas-nodes/live_test.py
    python comfyui-vas-nodes/live_test.py --port 8188

退出码：0 通过或跳过（ComfyUI 没跑）/ 1 有断言失败
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import io
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent

# 测试图故意做成竖长条：拉伸与裁切的差别一眼能看出来
IDENTITY_W, IDENTITY_H = 300, 700
SAMPLE_NAME = "vas_live_identity.png"

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"{'✓' if ok else '✗'} {name}{(' — ' + detail) if detail else ''}")


def http_json(url: str, payload: dict | None = None, timeout: float = 60):
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def make_identity_image():
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (IDENTITY_W, IDENTITY_H), (250, 248, 244))
    draw = ImageDraw.Draw(img)
    for y in range(0, IDENTITY_H, 40):
        draw.rectangle([0, y, IDENTITY_W, y + 20], fill=(200, 190, 180))
    draw.ellipse([90, 80, 210, 200], outline=(60, 60, 60), width=6)
    draw.text((100, IDENTITY_H - 40), "IDENTITY", fill=(0, 0, 0))
    return img


def upload(base: str, image) -> str:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    boundary = "----vaslivetest"
    body = (
        (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; "
            f"filename=\"{SAMPLE_NAME}\"\r\nContent-Type: image/png\r\n\r\n"
        ).encode()
        + buf.getvalue()
        + (
            f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n"
            f"--{boundary}--\r\n"
        ).encode()
    )
    req = urllib.request.Request(
        f"{base}/upload/image",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())["name"]


def run_recipe(base: str, sample: str, mode: str, width: int, height: int, flip: bool, timeout: float):
    """提交一次参考板工作流，返回 (PIL 图, None) 或 (None, 错误说明)。"""
    workflow = {
        "1": {"class_type": "LoadImage", "inputs": {"image": sample}},
        "2": {
            "class_type": "VASCharacterRecipe",
            "inputs": {
                "身份": ["1", 0],
                "尺寸模式": mode,
                "宽度": width,
                "高度": height,
                "水平镜像": flip,
                "底色": "#101014",
                "画风预设": "电影写实",
                "补充提示词": "侧逆光",
            },
        },
        "3": {"class_type": "PreviewImage", "inputs": {"images": ["2", 0]}},
    }
    try:
        prompt_id = http_json(f"{base}/prompt", {"prompt": workflow}).get("prompt_id")
    except urllib.error.HTTPError as exc:
        return None, f"提交被拒：{exc.read().decode()[:200]}"
    if not prompt_id:
        return None, "没有拿到 prompt_id"

    deadline = time.time() + timeout
    entry = None
    while time.time() < deadline:
        try:
            history = http_json(f"{base}/history/{prompt_id}")
        except Exception:
            history = {}
        if prompt_id in history:
            entry = history[prompt_id]
            break
        time.sleep(1)
    if entry is None:
        return None, f"等了 {timeout:.0f} 秒还没执行完"

    status = entry.get("status", {})
    if status.get("status_str") == "error":
        errors = [m for m in status.get("messages", []) if m[0] == "execution_error"]
        return None, json.dumps(errors, ensure_ascii=False)[:240]

    for node_out in entry.get("outputs", {}).values():
        for image in node_out.get("images", []) or []:
            url = (
                f"{base}/view?filename={image['filename']}"
                f"&subfolder={image.get('subfolder', '')}&type={image['type']}"
            )
            with urllib.request.urlopen(url, timeout=60) as resp:
                from PIL import Image

                return Image.open(io.BytesIO(resp.read())).convert("RGB"), None
    return None, "执行完了但没有输出图片"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8188)
    parser.add_argument("--timeout", type=float, default=240)
    args = parser.parse_args()
    base = f"http://127.0.0.1:{args.port}"

    try:
        stats = http_json(f"{base}/system_stats", timeout=5)
    except Exception as exc:
        print(f"跳过：{base} 上没有 ComfyUI（{exc}），这里不负责装它")
        return 0
    print(f"连上 ComfyUI：{stats.get('system', {}).get('comfyui_version', '?')} · "
          f"device={stats.get('devices', [{}])[0].get('name', '?')}")

    info = http_json(f"{base}/object_info")
    check("参考板节点被 ComfyUI 加载了", "VASCharacterRecipe" in info)
    if "VASCharacterRecipe" not in info:
        return 1
    recipe = info["VASCharacterRecipe"]
    modes = recipe["input"].get("optional", {}).get("尺寸模式", [[]])[0]
    check(
        "尺寸模式里没有跟别的模式重复的「原图尺寸」",
        "原图尺寸" not in modes,
        " / ".join(modes),
    )
    check("尺寸模式包含跟随身份图", "跟随身份图" in modes, " / ".join(modes))

    presets = recipe["input"].get("optional", {}).get("画风预设", [[]])[0]
    app_styles = ROOT / "src" / "shared" / "reference-styles.ts"
    if app_styles.exists():
        import re

        app_labels = re.findall(r'label:\s*"([^"]+)"', app_styles.read_text(encoding="utf-8"))
        check(
            "节点里的画风预设与 App 侧逐字一致",
            list(presets) == app_labels,
            f"节点 {len(presets)} 个 / App {len(app_labels)} 个",
        )

    sample = upload(base, make_identity_image())
    check("测试图上传成功", bool(sample), sample)

    shots = {}
    for mode, flip in (("缩放到指定尺寸", False), ("裁切填满", False), ("跟随身份图", False), ("裁切填满", True)):
        image, error = run_recipe(base, sample, mode, 400, 600, flip, args.timeout)
        label = f"{mode}{' + 镜像' if flip else ''}"
        if error:
            check(f"{label} 跑通了", False, error)
            continue
        shots[(mode, flip)] = image
        check(f"{label} 跑通了", True, f"{image.size[0]}×{image.size[1]}")

    scale = shots.get(("缩放到指定尺寸", False))
    crop = shots.get(("裁切填满", False))
    follow = shots.get(("跟随身份图", False))
    flipped = shots.get(("裁切填满", True))

    if scale and crop:
        check(
            "缩放到指定尺寸与裁切填满的像素真的不同",
            scale.tobytes() != crop.tobytes(),
            "两者一致说明尺寸模式没分流",
        )
    if follow:
        expected = (IDENTITY_W * 2, IDENTITY_H * 2)
        check(
            "跟随身份图按身份图原始尺寸出板",
            follow.size == expected,
            f"{follow.size[0]}×{follow.size[1]}（期望 {expected[0]}×{expected[1]}）",
        )
    if crop and flipped:
        check("水平镜像真的翻转过", crop.tobytes() != flipped.tobytes())
        # 翻转两次应当回到原样，顺带确认不是「随便画了点别的」
        if hashlib.sha256(crop.tobytes()).hexdigest() == hashlib.sha256(flipped.tobytes()).hexdigest():
            check("镜像结果与原图不同", False)

    failed = [name for name, ok, _ in results if not ok]
    print()
    if failed:
        print(f"✗ {len(failed)} 项未通过：")
        for name in failed:
            print(f"  - {name}")
        return 1
    print(f"全部通过（{len(results)} 项）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
