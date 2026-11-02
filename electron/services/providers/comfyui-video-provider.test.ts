// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { ComfyUiVideoProvider } from "./comfyui-video-provider";

/** 假 mp4 字节：只要适配器原样交出 /view 的响应体即可。 */
const FAKE_MP4 = Buffer.from("00000018667479706d703432", "hex");

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
  const workflow = server.requests[0].body.prompt;
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
  const workflow = server.requests[0].body.prompt;
  expect(workflow["5"].inputs).toMatchObject({ width: 512, height: 768, batch_size: 16 });
  expect(remote.status).toBe("in_progress");
});

it("切到 Wan 引擎时走文生视频工作流", async () => {
  const server = await startMock((_request, response) => response.end(JSON.stringify({ prompt_id: "p-wan" })));
  const provider = providerFor(server.url, "wan");
  await provider.createVideo({ prompt: "镜头推进", model: "sora-2", size: "1280x720", seconds: 4 });
  const workflow = server.requests[0].body.prompt;
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

it("参考图不参与文生视频，直接给出明确失败而不是静默忽略", async () => {
  const server = await startMock((_request, response) => response.end(JSON.stringify({ prompt_id: "p-2" })));
  const provider = providerFor(server.url);
  const remote = await provider.createVideo({
    prompt: "同一角色",
    model: "sora-2",
    size: "720x1280",
    seconds: 4,
    referencePath: "/tmp/ref.png",
    referenceMediaType: "image/png",
  });
  expect(remote.status).toBe("failed");
  expect(remote.error?.message).toMatch(/参考图/);
});
