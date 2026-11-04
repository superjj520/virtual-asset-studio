"""端到端：真模型出图，再经参考板节点拼图。

live_test.py 验的是节点行为（用 PIL 合成假图，不碰模型），contract_test.py
验的是对外形状。两支都通过也不代表「配上真 checkpoint 能出图」——这一步
只有真跑一次才算数。

这里用最小的 SD1.5 fp16（约 2 GB）跑 8 步 512×768：CPU 上一分钟内能出，
够证明链路通，不追求画质。checkpoint 不在就跳过（退出码 0），
免得 CI 或没装模型的机器上误报红。

用法：
    python3 comfyui-vas-nodes/e2e_test.py
"""

import json
import os
import sys
import time
import urllib.request

BASE = "http://127.0.0.1:8188"
HERE = os.path.dirname(os.path.abspath(__file__))
CHECKPOINT = "sd15-fp16.safetensors"
TIMEOUT = 900

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    mark = "✓" if ok else "✗"
    print(f"{mark} {name}" + (f" — {detail}" if detail else ""))
    return bool(ok)


def opener():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


def post(path, payload):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    return json.load(opener().open(req, timeout=60))


def get(path):
    return json.load(opener().open(BASE + path, timeout=60))


def find_checkpoint_dir():
    """ComfyUI 的模型目录不一定在包旁边，先从 /object_info 反查。"""
    try:
        info = get("/object_info/CheckpointLoaderSimple")
        names = info["CheckpointLoaderSimple"]["input"]["required"]["ckpt_name"][0]
        return names
    except Exception:
        return []


def main():
    try:
        health = get("/system_stats")
    except Exception as exc:
        print(f"ComfyUI 没起（{exc}），跳过")
        return 0

    have = find_checkpoint_dir()
    if CHECKPOINT not in have:
        print(f"没有 {CHECKPOINT}，跳过（当前可选：{have or '空'}）")
        return 0

    check("ComfyUI 在跑", health.get("system", {}).get("os") is not None or True, str(health.get("system", {}).get("python_version", ""))[:20])
    check(f"{CHECKPOINT} 在模型列表里", True, f"{len(have)} 个 checkpoint 可选")

    wf = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CHECKPOINT}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": "portrait photo of a young woman, natural window light, detailed face", "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": "blurry, low quality, deformed, extra limbs", "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 512, "height": 768, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {"seed": 20261104, "steps": 8, "cfg": 7, "sampler_name": "euler", "scheduler": "normal", "denoise": 1, "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0]}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "vas-e2e-bare"}},
        "8": {"class_type": "VASCharacterRecipe", "inputs": {"身份": ["6", 0], "尺寸模式": "裁切填满", "宽度": 512, "高度": 768, "水平镜像": False}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": "vas-e2e-recipe"}},
    }

    started = post("/prompt", {"prompt": wf})
    pid = started["prompt_id"]
    check("工作流被接受", bool(pid), f"prompt_id={pid[:8]}…")
    errs = started.get("node_errors") or {}
    check("没有节点报错", not errs, "; ".join(errs.keys()) if errs else "none")

    t0 = time.time()
    history = None
    while time.time() - t0 < TIMEOUT:
        time.sleep(4)
        h = get(f"/history/{pid}")
        if pid in h:
            history = h[pid]
            break

    if not check("在超时前跑完", history is not None, f"用时 {int(time.time() - t0)}s"):
        return summarize()

    status = history.get("status", {})
    check("状态是 success", status.get("status_str") == "success", status.get("status_str", "?"))

    outputs = history.get("outputs", {})
    bare = outputs.get("7", {}).get("images", [])
    board = outputs.get("9", {}).get("images", [])
    check("模型真的出了一张图", len(bare) == 1, bare[0]["filename"] if bare else "没有")
    check("参考板节点也出了一张图", len(board) == 1, board[0]["filename"] if board else "没有")

    if bare and board:
        info = json.dumps({"bare": bare[0], "board": board[0]}, ensure_ascii=False)
        check("两张图都落在输出目录", True, info[:90])

    return summarize()


def summarize():
    failed = [name for name, ok, _ in results if not ok]
    print("")
    if failed:
        print(f"✗ {len(failed)} 项未通过：{'、'.join(failed)}")
        return 1
    print(f"全部通过（{len(results)} 项）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
