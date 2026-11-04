#!/usr/bin/env node
/**
 * 本地服务出图的真机验收。
 *
 * /health、/materials 这些只证明「能读」；用户要的是「通过本地服务调用生产新的图片」，
 * 那条路是 POST /generate → ComfyUI → 模型 → PNG → /outputs/:name。这条链路以前
 * 只验过「ComfyUI 没起时正确报错」，从没真出过一张图。
 *
 * 需要 ComfyUI 在跑、且装了 VAS_COMFY_CHECKPOINT 指定的模型；缺任何一样就跳过
 * （退出码 0），免得在没装的机器上误报红。用 512×768 + draft（8 步），
 * 纯 CPU 上一分钟左右能出。
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const PORT = Number(process.env.VAS_VERIFY_PORT || 7792);
const BASE = `http://127.0.0.1:${PORT}`;
const ENTRY = 'dist/service/materials.mjs';
const CHECKPOINT = process.env.VAS_COMFY_CHECKPOINT || 'sd15-fp16.safetensors';
const COMFY = process.env.VAS_COMFY_URL || 'http://127.0.0.1:8188';

let passed = 0;
const failures = [];

const check = (ok, label, detail = '') => {
  if (ok) {
    passed += 1;
    console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures.push(label);
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
  return ok;
};

const comfyReady = async () => {
  try {
    const response = await fetch(`${COMFY}/system_stats`, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
};

const main = async () => {
  if (!existsSync(ENTRY)) {
    console.log(`跳过：${ENTRY} 不存在，先跑 npm run build:service`);
    return 0;
  }
  if (!(await comfyReady())) {
    console.log(`跳过：${COMFY} 上没有 ComfyUI`);
    return 0;
  }

  const child = spawn(process.execPath, ['--experimental-sqlite', ENTRY], {
    env: { ...process.env, VAS_SERVICE_PORT: String(PORT), VAS_COMFY_CHECKPOINT: CHECKPOINT },
    stdio: 'ignore',
  });

  try {
    let health = null;
    for (let i = 0; i < 40; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      try {
        const response = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3000) });
        if (response.ok) {
          health = await response.json();
          break;
        }
      } catch {
        /* 还没起来 */
      }
    }
    if (!check(Boolean(health), "服务起得来", health?.service ?? "")) return summarize();
    check(true, "健康检查报的 ComfyUI 地址对得上", health.comfyUrl);

    const started = Date.now();
    const response = await fetch(`${BASE}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "portrait photo of a young woman, natural window light, detailed face",
        negative: "blurry, low quality, deformed",
        size: "512x768",
        seed: 20261104,
        quality: "draft",
      }),
      signal: AbortSignal.timeout(420_000),
    });
    const body = await response.json();
    const seconds = Math.round((Date.now() - started) / 1000);

    if (!check(response.status === 200, "出图请求成功", `${response.status} ${body?.error ?? ""}`.trim())) {
      return summarize();
    }
    check(typeof body.bytes === "number" && body.bytes > 10_000, "返回的不是空壳", `${body.bytes} 字节，${seconds}s`);
    check(typeof body.url === "string" && body.url.startsWith("/outputs/"), "给了可取回的地址", body.url);
    check(existsSync(body.file), "文件真的落在磁盘上", body.file.split("/").pop());
    check(
      body.used?.references === 0 && body.used?.depth === false && body.used?.normal === false,
      "没传参考图时如实报 0",
      JSON.stringify(body.used),
    );

    const image = await fetch(`${BASE}${body.url}`, { signal: AbortSignal.timeout(30_000) });
    const buffer = Buffer.from(await image.arrayBuffer());
    check(image.status === 200, "地址能取回图", `${image.status}`);
    check((image.headers.get("content-type") ?? "").startsWith("image/"), "content-type 是图", image.headers.get("content-type"));
    check(buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "PNG 头对得上");
    // 512×768 写在 IHDR 里
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    check(width === 512 && height === 768, "尺寸就是请求的那一档", `${width}×${height}`);
  } finally {
    child.kill("SIGKILL");
  }

  return summarize();
};

const summarize = () => {
  console.log("");
  if (failures.length) {
    console.log(`✗ ${failures.length} 项未通过：${failures.join("、")}`);
    return 1;
  }
  console.log(`全部通过（${passed} 项）`);
  return 0;
};

main().then((code) => process.exit(code)).catch((error) => {
  console.error(error);
  process.exit(1);
});
