// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { createServer, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { ComfyUiVideoProvider } from "./comfyui-video-provider";

/** 假 mp4 字节：只要适配器原样交出 /view 的响应体即可。 */
const FAKE_MP4 = Buffer.from("00000018667479706d703432", "hex");

/** 1×1 PNG：上传接口只检查有没有拿到字节，不需要真的能显示。 */
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

type MockRequest = { method?: string; url?: string; body: any };
type MockServer = { url: string; requests: MockRequest[]; close: () => Promise<void> };

const openServers: MockServer[] = [];

afterEach(async () => {
  while (openServers.length) await openServers.pop()!.close();
});

const startMock = async (
  respond: (request: MockRequest, response: ServerResponse) => void,
): Promise<MockServer> => {
  const requests: MockRequest[] = [];
  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      let body: any = raw;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        body = raw;
      }
      const entry = { method: request.method, url: request.url, body };
      requests.push(entry);
      respond(entry, response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const wrapped: MockServer = {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
  openServers.push(wrapped);
  return wrapped;
};

const providerFor = (baseUrl: string, mode: "animate" | "wan" = "animate") =>
  new ComfyUiVideoProvider({
    baseUrl: () => baseUrl,
    mode: () => mode,
    checkpoint: () => "Counterfeit-V2.5_fp16.safetensors",
    motion: () => "animatediff_lightning_4step_comfyui.safetensors",
    unet: () => "wan2.1_t2v_1.3B_fp16.safetensors",
    clip: () => "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
    vae: () => "wan_2.1_vae.safetensors",
  });

it("入队后把 ComfyUI 的 prompt_id 当成远程编号", async () => {
  const server = await startMock((request, response) => {
    if (request.url === "/prompt") {
      response.end(JSON.stringify({ prompt_id: "p-123" }));
      return;
    }
    response.end("{}");
  });
  const provider = providerFor(server.url);
  const remote = await provider.createVideo({ prompt: "镜头缓慢推进", model: "sora-2", size: "1280x720", seconds: 4 });

  expect(remote).toMatchObject({ id: "p-123", status: "in_progress" });
  const workflow = server.requests.find((request) => request.url === "/prompt")!.body.prompt;
  // 默认动画引擎：SD1.5 + AnimateDiff Lightning，4 步出帧。
  expect(workflow["1"].inputs.ckpt_name).toBe("Counterfeit-V2.5_fp16.safetensors");
  expect(workflow["2"].class_type).toBe("ADE_AnimateDiffLoaderGen1");
  expect(workflow["2"].inputs.model_name).toBe("animatediff_lightning_4step_comfyui.safetensors");
  // 4 秒 → 8fps 的 32 帧，上限收到 16 帧；横版固定 512×512（SD1.5 原生比例）。
  expect(workflow["5"].inputs).toMatchObject({ width: 512, height: 512, batch_size: 16 });
  expect(workflow["6"].inputs.steps).toBe(4);
  expect(workflow["8"].inputs.format).toBe("video/h264-mp4");
  expect(workflow["3"].inputs.text).toBe("镜头缓慢推进");
});

it("竖版按 Wan 的竖屏尺寸出片，并遵守帧数上限", async () => {
  const server = await startMock((_request, response) => response.end(JSON.stringify({ prompt_id: "p-9" })));
  const provider = providerFor(server.url);
  const remote = await provider.createVideo({ prompt: "竖屏", model: "sora-2", size: "720x1280", seconds: 12 });
  const workflow = server.requests.find((request) => request.url === "/prompt")!.body.prompt;
  expect(workflow["5"].inputs).toMatchObject({ width: 512, height: 768, batch_size: 16 });
  expect(remote.status).toBe("in_progress");
});

it("切到 Wan 引擎时走文生视频工作流", async () => {
  const server = await startMock((_request, response) => response.end(JSON.stringify({ prompt_id: "p-wan" })));
  const provider = providerFor(server.url, "wan");
  await provider.createVideo({ prompt: "镜头推进", model: "sora-2", size: "1280x720", seconds: 4 });
  const workflow = server.requests.find((request) => request.url === "/prompt")!.body.prompt;
  expect(workflow["1"].inputs.unet_name).toBe("wan2.1_t2v_1.3B_fp16.safetensors");
  expect(workflow["2"].inputs.type).toBe("wan");
  expect(workflow["7"].inputs).toMatchObject({ width: 832, height: 480, length: 65 });
});

it("history 未完成时保持进行中，完成后可下载字节", async () => {
  let done = false;
  const server = await startMock((request, response) => {
    if (request.url === "/prompt") {
      response.end(JSON.stringify({ prompt_id: "p-1" }));
      return;
    }
    if (request.url?.startsWith("/history/")) {
      response.end(
        JSON.stringify(
          done
            ? {
                "p-1": {
                  status: { status_str: "success", completed: true },
                  outputs: { "11": { images: [{ filename: "clip.mp4", subfolder: "", type: "output" }] } },
                },
              }
            : {},
        ),
      );
      return;
    }
    if (request.url?.startsWith("/view")) {
      response.end(FAKE_MP4);
      return;
    }
    response.end("{}");
  });
  const provider = providerFor(server.url);
  await provider.createVideo({ prompt: "杯子", model: "sora-2", size: "1280x720", seconds: 4 });

  await expect(provider.getVideo("p-1")).resolves.toMatchObject({ status: "in_progress" });
  done = true;
  await expect(provider.getVideo("p-1")).resolves.toMatchObject({ status: "completed", progress: 1 });
  await expect(provider.downloadVideo("p-1")).resolves.toEqual(FAKE_MP4);
  expect(server.requests.some((request) => request.url?.startsWith("/view?filename=clip.mp4"))).toBe(true);
});

it("给参考图时切到图生视频：先上传再以原图为首帧加运动", async () => {
  const dir = mkdtempSync(join(tmpdir(), "comfy-i2v-"));
  const referencePath = join(dir, "ref.png");
  writeFileSync(referencePath, ONE_PIXEL_PNG);
  const server = await startMock((request, response) => {
    if (request.url?.startsWith("/upload/image")) {
      response.end(JSON.stringify({ name: "ref.png", subfolder: "", type: "input" }));
      return;
    }
    response.end(JSON.stringify({ prompt_id: "p-2" }));
  });
  const provider = providerFor(server.url);
  const remote = await provider.createVideo({
    prompt: "让台灯轻微呼吸",
    model: "sora-2",
    size: "1280x720",
    seconds: 2,
    referencePath,
    referenceMediaType: "image/png",
  });
  expect(remote).toMatchObject({ id: "p-2", status: "in_progress" });
  expect(server.requests.some((request) => request.url?.startsWith("/upload/image"))).toBe(true);
  const posted = server.requests.find((request) => request.url === "/prompt")?.body?.prompt;
  // 首帧来自参考图：LoadImage → ImageScale 到训练分辨率 → VAEEncode → RepeatLatentBatch 复制成 16 帧
  expect(posted["3"]).toMatchObject({ class_type: "LoadImage", inputs: { image: "ref.png" } });
  expect(posted["4"].inputs).toMatchObject({ width: 512, height: 512, crop: "center" });
  expect(posted["6"]).toMatchObject({ class_type: "RepeatLatentBatch", inputs: { amount: 16 } });
  expect(posted["9"].inputs).toMatchObject({ denoise: 0.55, latent_image: ["6", 0] });
  rmSync(dir, { recursive: true, force: true });
});

it("Wan 引擎下给参考图会明确说明不支持图生视频", async () => {
  const server = await startMock((_request, response) => response.end(JSON.stringify({ prompt_id: "p-3" })));
  const provider = providerFor(server.url, "wan");
  const remote = await provider.createVideo({
    prompt: "同一角色",
    model: "sora-2",
    size: "720x1280",
    seconds: 4,
    referencePath: "/tmp/ref.png",
    referenceMediaType: "image/png",
  });
  expect(remote.status).toBe("failed");
  expect(remote.error?.message).toMatch(/图生视频/);
});

it("出片前内存不够时先拦下来，并说清要多少、剩多少", async () => {
  const server = await startMock((request, response) => {
    if (request.url === "/system_stats") {
      response.end(
        JSON.stringify({ system: { ram_total: 16 * 1024 ** 3, ram_free: 1.2 * 1024 ** 3 } }),
      );
      return;
    }
    response.end(JSON.stringify({ prompt_id: "p-guard" }));
  });
  const provider = providerFor(server.url);
  await expect(
    provider.createVideo({ prompt: "台灯", model: "sora-2", size: "1280x720", seconds: 4 }),
  ).rejects.toThrow(/内存不够.*GB.*帧/);
  // 被拦下就不要真的把任务塞进队列
  expect(server.requests.some((request) => request.url === "/prompt")).toBe(false);
});

it("内存不足挂掉时把 ComfyUI 的英文报错翻成中文，并让它释放模型缓存", async () => {
  let done = false;
  const server = await startMock((request, response) => {
    if (request.url === "/system_stats") {
      response.end(JSON.stringify({ system: { ram_total: 16 * 1024 ** 3, ram_free: 8 * 1024 ** 3 } }));
      return;
    }
    if (request.url === "/free") {
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (request.url === "/prompt") {
      response.end(JSON.stringify({ prompt_id: "p-oom" }));
      return;
    }
    if (!done) {
      response.end(JSON.stringify({ "p-oom": {} }));
      return;
    }
    response.end(
      JSON.stringify({
        "p-oom": {
          status: {
            status_str: "error",
            completed: false,
            messages: [["execution_error", { exception_message: "RuntimeError: Not enough memory" }]],
          },
        },
      }),
    );
  });
  const provider = providerFor(server.url);
  const remote = await provider.createVideo({ prompt: "台灯", model: "sora-2", size: "1280x720", seconds: 2 });
  await expect(provider.getVideo(remote.id)).resolves.toMatchObject({ status: "in_progress" });
  done = true;
  const failed = await provider.getVideo(remote.id);
  expect(failed.status).toBe("failed");
  expect(failed.error?.message).toMatch(/内存不足/);
  expect(server.requests.some((request) => request.url === "/free")).toBe(true);
});

it("等太久会中断任务、释放缓存，并告诉用户先看内存", async () => {
  const server = await startMock((request, response) => {
    if (request.url?.startsWith("/history")) {
      response.end("{}");
      return;
    }
    if (request.url?.startsWith("/queue")) {
      response.end(JSON.stringify({ queue_running: [["1", "still-there"]], queue_pending: [] }));
      return;
    }
    response.end("{}");
  });
  const provider = new ComfyUiVideoProvider({
    baseUrl: () => server.url,
    mode: () => "animate",
    timeoutMs: 1,
  });
  // 第一次调用只是记下起始时间，隔一会儿再查才会超过 1ms 的预算
  await provider.getVideo("gone");
  await new Promise((resolve) => setTimeout(resolve, 10));
  const remote = await provider.getVideo("gone");
  expect(remote.status).toBe("failed");
  expect(remote.error?.message).toMatch(/中断这条任务并释放 ComfyUI 缓存/);
  const urls = server.requests.map((request) => `${request.method} ${request.url}`);
  expect(urls).toContain("POST /interrupt");
  expect(urls).toContain("POST /free");
  expect(server.requests.find((request) => request.url === "/free")?.body).toEqual({
    unload_models: true,
    free_memory: true,
  });
});

it("任务既不在队列也不在 history 时判为丢失，而不是一直转圈", async () => {
  const server = await startMock((request, response) => {
    if (request.url?.startsWith("/queue")) {
      response.end(JSON.stringify({ queue_running: [], queue_pending: [] }));
      return;
    }
    response.end("{}");
  });
  const provider = new ComfyUiVideoProvider({
    baseUrl: () => server.url,
    mode: () => "animate",
    lostPolls: 2,
  });
  const first = await provider.getVideo("dropped");
  expect(first.status).toBe("in_progress");
  const second = await provider.getVideo("dropped");
  expect(second.status).toBe("failed");
  expect(second.error?.message).toMatch(/在 ComfyUI 里已经不见了/);
});

it("队列里还在跑就继续等，不误判", async () => {
  const server = await startMock((request, response) => {
    if (request.url?.startsWith("/queue")) {
      response.end(JSON.stringify({ queue_running: [["9", "busy-one"]], queue_pending: [] }));
      return;
    }
    response.end("{}");
  });
  const provider = new ComfyUiVideoProvider({ baseUrl: () => server.url, mode: () => "animate" });
  for (let i = 0; i < 5; i += 1) {
    const remote = await provider.getVideo("busy-one");
    expect(remote.status).toBe("in_progress");
  }
});
