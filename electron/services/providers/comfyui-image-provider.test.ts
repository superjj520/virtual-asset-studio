// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { createServer, type ServerResponse } from "node:http";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import {
  ComfyUiImageProvider,
  applyWorkflowPlaceholders,
} from "./comfyui-image-provider";

/** 1×1 RGBA PNG：验证适配器把 ComfyUI 的 /view 字节原样交出。 */
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

type MockRequest = { method?: string; url?: string; body: any; raw?: string };
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
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let parsed: unknown;
      try {
        parsed = raw ? JSON.parse(raw) : undefined;
      } catch {
        parsed = undefined;
      }
      const captured: MockRequest = {
        method: request.method,
        url: request.url,
        body: parsed,
        raw,
      };
      requests.push(captured);
      respond(captured, response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const mock: MockServer = {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
  openServers.push(mock);
  return mock;
};

const providerFor = (input: {
  baseUrl?: string | undefined;
  checkpoint?: string;
  workflow?: string;
}) =>
  new ComfyUiImageProvider({
    baseUrl: () => input.baseUrl,
    checkpoint: () => input.checkpoint,
    workflow: () => input.workflow,
    pollIntervalMs: 1,
    timeoutMs: 2000,
  });

it("整串占位符保留原始类型，内插占位符转成字符串", () => {
  const injected = applyWorkflowPlaceholders(
    {
      width: "{{width}}",
      height: "{{ height }}",
      text: "光线：{{prompt}} / 种子 {{seed}}",
      untouched: "固定值",
      unknown: "{{missing}}",
    },
    { width: 1024, height: 1536, prompt: "黄昏", seed: 42 },
  ) as Record<string, unknown>;

  expect(injected.width).toBe(1024);
  expect(injected.height).toBe(1536);
  expect(injected.text).toBe("光线：黄昏 / 种子 42");
  expect(injected.untouched).toBe("固定值");
  // 未定义的占位符原样保留，方便用户发现拼写错误。
  expect(injected.unknown).toBe("{{missing}}");
});

it("内置工作流按画幅与种子注入参数", () => {
  const workflow = providerFor({ baseUrl: "http://127.0.0.1:8188", checkpoint: "sd_xl_base_1.0.safetensors" })
    .buildWorkflow({
      prompt: "白发少女，窗边逆光",
      negative: "水印",
      size: "1024x1536",
      seed: 7,
      quality: "high",
    });

  expect(workflow["4"].inputs.ckpt_name).toBe("sd_xl_base_1.0.safetensors");
  expect(workflow["5"].inputs).toMatchObject({ width: 1024, height: 1536 });
  expect(workflow["3"].inputs.seed).toBe(7);
  expect(workflow["3"].inputs.steps).toBe(28);
  expect(workflow["6"].inputs.text).toBe("白发少女，窗边逆光");
  expect(workflow["7"].inputs.text).toBe("水印");
});

it("没有 checkpoint 也没有自定义工作流时给出可执行提示", () => {
  expect(() =>
    providerFor({ baseUrl: "http://127.0.0.1:8188" }).buildWorkflow({
      prompt: "任意",
      size: "1024x1024",
    }),
  ).toThrow(/checkpoint/);
});

it("自定义工作流优先于内置模板", () => {
  const custom = JSON.stringify({
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "{{checkpoint}}" } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}", clip: ["1", 1] } },
  });
  const workflow = providerFor({
    baseUrl: "http://127.0.0.1:8188",
    checkpoint: "custom.safetensors",
    workflow: custom,
  }).buildWorkflow({ prompt: "测试", size: "1024x1024" });

  expect(Object.keys(workflow)).toEqual(["1", "2"]);
  expect(workflow["2"].inputs.text).toBe("测试");
  expect(workflow["1"].inputs.ckpt_name).toBe("custom.safetensors");
});

it("自定义工作流不是合法 JSON 时直接报错", () => {
  expect(() =>
    providerFor({ baseUrl: "http://127.0.0.1:8188", workflow: "{不是 JSON" }).buildWorkflow({
      prompt: "任意",
      size: "1024x1024",
    }),
  ).toThrow(/JSON/);
});

it("按 /prompt → /history → /view 顺序取回图片字节", async () => {
  let historyCalls = 0;
  const server = await startMock((request, response) => {
    if (request.method === "POST" && request.url === "/prompt") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ prompt_id: "job-1", number: 1 }));
      return;
    }
    if (request.url === "/history/job-1") {
      historyCalls += 1;
      response.writeHead(200, { "Content-Type": "application/json" });
      // 第一次还在排队，第二次才完成——覆盖轮询分支。
      if (historyCalls === 1) return response.end(JSON.stringify({}));
      return response.end(
        JSON.stringify({
          "job-1": {
            status: { status_str: "success" },
            outputs: { "9": { images: [{ filename: "vas_0001.png", subfolder: "", type: "output" }] } },
          },
        }),
      );
    }
    if (request.url?.startsWith("/view?")) {
      response.writeHead(200, { "Content-Type": "image/png" });
      return response.end(ONE_PIXEL_PNG);
    }
    response.writeHead(404).end();
  });

  const provider = providerFor({ baseUrl: server.url, checkpoint: "sd_xl_base_1.0.safetensors" });
  const image = await provider.generateImage({ prompt: "猫", size: "1024x1024", seed: 1 });

  expect(image.equals(ONE_PIXEL_PNG)).toBe(true);
  expect(server.requests[0].url).toBe("/prompt");
  expect(server.requests[0].body.prompt["6"].inputs.text).toBe("猫");
  expect(historyCalls).toBe(2);
  const viewCall = server.requests.find((item) => item.url?.startsWith("/view?"));
  expect(viewCall?.url).toContain("filename=vas_0001.png");
});

it("节点执行失败时把 ComfyUI 的异常信息带出来", async () => {
  const server = await startMock((request, response) => {
    if (request.url === "/prompt") {
      response.writeHead(200, { "Content-Type": "application/json" });
      return response.end(JSON.stringify({ prompt_id: "job-2" }));
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        "job-2": {
          status: {
            status_str: "error",
            messages: [["execution_error", { exception_message: "mat1 and mat2 shapes cannot be multiplied" }]],
          },
        },
      }),
    );
  });

  const provider = providerFor({ baseUrl: server.url, checkpoint: "sd_xl_base_1.0.safetensors" });
  await expect(provider.generateImage({ prompt: "猫", size: "1024x1024" })).rejects.toThrow(
    /mat1 and mat2/,
  );
});

it("地址为空时不发起任何请求", async () => {
  const provider = providerFor({ baseUrl: undefined, checkpoint: "x.safetensors" });
  expect(provider.isConfigured()).toBe(false);
  await expect(provider.generateImage({ prompt: "猫", size: "1024x1024" })).rejects.toThrow(
    /ComfyUI 地址/,
  );
});

it("带参考图出图时先上传，再把返回的文件名注进 {{reference_image}} 占位符", async () => {
  const referencePath = join(tmpdir(), `comfy-ref-${Date.now()}.png`);
  writeFileSync(referencePath, ONE_PIXEL_PNG);
  const server = await startMock((request, response) => {
    if (request.url === "/upload/image") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ name: "uploaded-ref.png", subfolder: "" }));
      return;
    }
    if (request.url === "/prompt") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ prompt_id: "p1" }));
      return;
    }
    if (request.url === "/history/p1") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ p1: { outputs: { "9": { images: [{ filename: "out.png", subfolder: "", type: "output" }] } } } }));
      return;
    }
    if (request.url?.startsWith("/view?")) {
      response.writeHead(200, { "Content-Type": "image/png" });
      response.end(ONE_PIXEL_PNG);
      return;
    }
    response.writeHead(404).end();
  });

  const provider = new ComfyUiImageProvider({
    baseUrl: () => server.url,
    checkpoint: () => "sd_xl_base_1.0.safetensors",
    workflow: () =>
      JSON.stringify({
        "10": { class_type: "LoadImage", inputs: { image: "{{reference_image}}" } },
        "9": { class_type: "SaveImage", inputs: { images: ["10", 0] } },
      }),
    pollIntervalMs: 1,
    timeoutMs: 5000,
  });

  const image = await provider.refineImage({
    prompt: "把参考图里的人画成侧脸",
    size: "1:1",
    referencePath,
    referenceMediaType: "image/png",
  });

  expect(image.equals(ONE_PIXEL_PNG)).toBe(true);
  const upload = server.requests.find((request) => request.url === "/upload/image");
  expect(upload?.method).toBe("POST");
  expect(upload?.raw).toContain("name=\"image\"");
  expect(upload?.raw).toContain("comfy-ref-");
  const prompt = server.requests.find((request) => request.url === "/prompt");
  expect(prompt?.body.prompt["10"].inputs.image).toBe("uploaded-ref.png");
});

it("工作流没有参考图占位符时直接报错，不静默丢掉参考图", async () => {
  const referencePath = join(tmpdir(), `comfy-ref-missing-${Date.now()}.png`);
  writeFileSync(referencePath, ONE_PIXEL_PNG);
  const server = await startMock((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ name: "uploaded-ref.png", subfolder: "" }));
  });

  const provider = new ComfyUiImageProvider({
    baseUrl: () => server.url,
    checkpoint: () => "sd_xl_base_1.0.safetensors",
    workflow: () => JSON.stringify({ "9": { class_type: "SaveImage", inputs: { images: ["4", 0] } } }),
    pollIntervalMs: 1,
    timeoutMs: 5000,
  });

  await expect(
    provider.refineImage({
      prompt: "参考图锁身份",
      size: "1:1",
      referencePath,
      referenceMediaType: "image/png",
    }),
  ).rejects.toThrow(/没有 \{\{reference_image\}\} 占位符/);
  expect(server.requests.some((request) => request.url === "/prompt")).toBe(false);
});
