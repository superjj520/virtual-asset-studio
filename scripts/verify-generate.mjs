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
import { existsSync, readFileSync } from 'node:fs';

const PORT = Number(process.env.VAS_VERIFY_PORT || 7792);
const BASE = `http://127.0.0.1:${PORT}`;
const ENTRY = 'dist/service/materials.mjs';
const CHECKPOINT = process.env.VAS_COMFY_CHECKPOINT || 'sd15-fp16.safetensors';
const COMFY = process.env.VAS_COMFY_URL || 'http://127.0.0.1:8188';
const IMG2IMG_WORKFLOW = 'comfyui-vas-nodes/workflows/sd15-img2img.json';
const DEPTH_WORKFLOW = 'comfyui-vas-nodes/workflows/sd15-depth.json';
const NORMAL_WORKFLOW = 'comfyui-vas-nodes/workflows/sd15-normal.json';
// 每次换个种子：ComfyUI 对「同工作流 + 同参数」有缓存，复用上一次的种子会
// 一秒返回旧图，看着像跑通了其实没采样。要固定就设 VAS_VERIFY_SEED。
const SEED = Number(process.env.VAS_VERIFY_SEED) || Math.floor(Date.now() / 1000) % 100000;

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

const hasControlNet = async (kind) => {
  try {
    const response = await fetch(`${COMFY}/object_info/ControlNetLoader`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return false;
    const body = await response.json();
    const names = body?.ControlNetLoader?.input?.required?.control_net_name?.[0] ?? [];
    return Array.isArray(names) && names.some((name) => String(name).includes(kind));
  } catch {
    return false;
  }
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

  const children = [];
  const child = spawn(process.execPath, ['--experimental-sqlite', ENTRY], {
    env: { ...process.env, VAS_SERVICE_PORT: String(PORT), VAS_COMFY_CHECKPOINT: CHECKPOINT },
    stdio: 'ignore',
  });
  children.push(child);

  const waitForHealth = async () => {
    for (let i = 0; i < 40; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      try {
        const response = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3000) });
        if (response.ok) return await response.json();
      } catch {
        /* 还没起来 */
      }
    }
    return null;
  };

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
        seed: SEED,
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
    if (seconds < 5) console.log(`  （${seconds}s 太快，可能命中了 ComfyUI 的缓存；换 VAS_VERIFY_SEED 可强制重算）`);
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
    // 第二段：换一个带 {{reference_image}} 的工作流，验证「参考图真的进模型」。
    // used.references 只证明参数传到了，所以还要看输出跟纯文生图确实不一样。
    const reference = await fetch(`${BASE}/materials?kind=portrait&limit=1`, { signal: AbortSignal.timeout(10_000) });
    const referenceBody = await reference.json();
    const referenceId = referenceBody?.items?.[0]?.id;
    if (!check(Boolean(referenceId), "库里有可当参考的人像", referenceBody?.items?.[0]?.name ?? "")) {
      return summarize();
    }

    child.kill("SIGKILL");
    await new Promise((resolve) => setTimeout(resolve, 500));
    const second = spawn(process.execPath, ["--experimental-sqlite", ENTRY], {
      env: {
        ...process.env,
        VAS_SERVICE_PORT: String(PORT),
        VAS_COMFY_CHECKPOINT: CHECKPOINT,
        VAS_COMFY_WORKFLOW: readFileSync(IMG2IMG_WORKFLOW, "utf8"),
      },
      stdio: "ignore",
    });
    children.push(second);
    await waitForHealth();

    const withRef = await fetch(`${BASE}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "same person, wearing a dark coat, city street at night",
        negative: "blurry, low quality",
        size: "512x768",
        seed: SEED,
        quality: "draft",
        references: [referenceId],
      }),
      signal: AbortSignal.timeout(420_000),
    });
    const refBody = await withRef.json();
    if (!check(withRef.status === 200, "带参考图能出图", `${withRef.status} ${refBody?.error ?? ""}`.trim())) {
      return summarize();
    }
    check(refBody.used?.references === 1, "如实上报用了 1 张参考图", JSON.stringify(refBody.used));
    check(refBody.bytes > 10_000, "带参考图的结果不是空壳", `${refBody.bytes} 字节`);

    const refImage = await fetch(`${BASE}${refBody.url}`, { signal: AbortSignal.timeout(30_000) });
    const refBuffer = Buffer.from(await refImage.arrayBuffer());
    check(refBuffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), "带参考图的也是 PNG");
    // 同一提示词、同一 seed，带参考图与不带的像素必须不同——否则只能说参数传过去了。
    check(!refBuffer.equals(buffer), "带参考图的画面与纯文生图不同", `${refBuffer.length} vs ${buffer.length} 字节`);
    // 第三段：深度图走 ControlNet。素材库有 1,439 张深度图，但「能不能真驱动
    // ControlNet」一直没验过——这段要 ComfyUI 装了 ControlNet 深度模型才跑得动。
    const depthReady = await hasControlNet('depth');
    if (!depthReady) {
      console.log("⊘ 跳过深度图那一段 —— ComfyUI 的 models/controlnet 下没有 SD1.5 深度模型");
      console.log("  （可从 hf-mirror.com/comfyanonymous/ControlNet-v1-1_fp16_safetensors 取 control_v11f1p_sd15_depth_fp16）");
    } else {
      const depthList = await fetch(`${BASE}/materials?kind=depth&limit=1`, { signal: AbortSignal.timeout(10_000) });
      const depthBody = await depthList.json();
      const depthId = depthBody?.items?.[0]?.id;
      if (check(Boolean(depthId), "库里有深度图", depthBody?.items?.[0]?.name ?? "")) {
        child.kill("SIGKILL");
        for (const item of children) item.kill("SIGKILL");
        children.length = 0;
        await new Promise((resolve) => setTimeout(resolve, 500));
        const third = spawn(process.execPath, ["--experimental-sqlite", ENTRY], {
          env: {
            ...process.env,
            VAS_SERVICE_PORT: String(PORT),
            VAS_COMFY_CHECKPOINT: CHECKPOINT,
            VAS_COMFY_WORKFLOW: readFileSync(DEPTH_WORKFLOW, "utf8"),
          },
          stdio: "ignore",
        });
        children.push(third);
        await waitForHealth();

        const withDepth = await fetch(`${BASE}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: "a woman standing, soft studio light, detailed",
            negative: "blurry, low quality",
            size: "512x768",
            seed: SEED + 1,
            quality: "draft",
            depthAssetId: depthId,
          }),
          signal: AbortSignal.timeout(500_000),
        });
        const depthResult = await withDepth.json();
        if (check(withDepth.status === 200, "带深度图能出图", `${withDepth.status} ${depthResult?.error ?? ""}`.trim())) {
          check(depthResult.used?.depth === true, "如实上报用了深度图", JSON.stringify(depthResult.used));
          check(depthResult.bytes > 10_000, "带深度图的结果不是空壳", `${depthResult.bytes} 字节`);
          const depthImage = await fetch(`${BASE}${depthResult.url}`, { signal: AbortSignal.timeout(30_000) });
          const depthBuffer = Buffer.from(await depthImage.arrayBuffer());
          check(depthBuffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), "带深度图的也是 PNG");
          check(!depthBuffer.equals(buffer), "带深度图的画面与纯文生图不同", `${depthBuffer.length} vs ${buffer.length} 字节`);
        }
      }
    }
    // 第四段：法线图走 ControlNet Normal。跟深度图是两条独立通道——
    // 深度管「离镜头多远」，法线管「表面朝哪边」，模型也不能混用。
    const normalReady = await hasControlNet('normal');
    if (!normalReady) {
      console.log("⊘ 跳过法线图那一段 —— ComfyUI 的 models/controlnet 下没有 SD1.5 法线模型");
      console.log("  （可从 hf-mirror.com/comfyanonymous/ControlNet-v1-1_fp16_safetensors 取 control_v11p_sd15_normalbae_fp16）");
    } else {
      const normalList = await fetch(`${BASE}/materials?kind=normal&limit=1`, { signal: AbortSignal.timeout(10_000) });
      const normalBody = await normalList.json();
      const normalId = normalBody?.items?.[0]?.id;
      if (check(Boolean(normalId), "库里有法线图", normalBody?.items?.[0]?.name ?? "")) {
        for (const item of children) item.kill("SIGKILL");
        children.length = 0;
        await new Promise((resolve) => setTimeout(resolve, 500));
        const fourth = spawn(process.execPath, ["--experimental-sqlite", ENTRY], {
          env: {
            ...process.env,
            VAS_SERVICE_PORT: String(PORT),
            VAS_COMFY_CHECKPOINT: CHECKPOINT,
            VAS_COMFY_WORKFLOW: readFileSync(NORMAL_WORKFLOW, "utf8"),
          },
          stdio: "ignore",
        });
        children.push(fourth);
        await waitForHealth();

        const withNormal = await fetch(`${BASE}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: "a woman sitting, soft studio light, detailed portrait",
            negative: "blurry, low quality",
            size: "512x768",
            seed: SEED + 2,
            quality: "draft",
            normalAssetId: normalId,
          }),
          signal: AbortSignal.timeout(500_000),
        });
        const normalResult = await withNormal.json();
        if (check(withNormal.status === 200, "带法线图能出图", `${withNormal.status} ${normalResult?.error ?? ""}`.trim())) {
          check(normalResult.used?.normal === true, "如实上报用了法线图", JSON.stringify(normalResult.used));
          check(normalResult.bytes > 10_000, "带法线图的结果不是空壳", `${normalResult.bytes} 字节`);
          const normalImage = await fetch(`${BASE}${normalResult.url}`, { signal: AbortSignal.timeout(30_000) });
          const normalBuffer = Buffer.from(await normalImage.arrayBuffer());
          check(normalBuffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), "带法线图的也是 PNG");
          check(!normalBuffer.equals(buffer), "带法线图的画面与纯文生图不同", `${normalBuffer.length} vs ${buffer.length} 字节`);
        }
      }
    }
  } finally {
    for (const item of children) {
      try {
        item.kill("SIGKILL");
      } catch {
        /* 已经退了 */
      }
    }
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
