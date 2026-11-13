import { afterEach, expect, it, vi } from "vitest";
import { MagpieProvider } from "./magpie-provider";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const createProvider = () =>
  new MagpieProvider({
    apiKey: () => "magpie-test-gateway-key",
    baseUrl: () => "http://127.0.0.1:3999/v1/",
  });

it("生图走本机网关，竖版尺寸映射到 864x1152 并解出 b64 图片", async () => {
  const png = Buffer.from("fake-png-bytes").toString("base64");
  const fetchMock = vi
    .fn()
    .mockResolvedValue(jsonResponse({ data: [{ b64_json: png }] }));
  globalThis.fetch = fetchMock as typeof fetch;

  const buffer = await createProvider().generateImage({
    prompt: "一盏黄铜台灯，产品图",
    size: "1024x1536",
  });

  expect(buffer.toString()).toBe("fake-png-bytes");
  expect(fetchMock.mock.calls[0]?.[0]).toBe(
    "http://127.0.0.1:3999/v1/images/generations",
  );
  expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
    Authorization: "Bearer magpie-test-gateway-key",
  });
  expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
    model: "freeimg/flux",
    size: "864x1152",
  });
});

it("免费模型拒绝竖版尺寸时自动退回正方形，不把 400 抛给用户", async () => {
  const png = Buffer.from("square-png").toString("base64");
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ error: { message: "unsupported size" } }, 400))
    .mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: png }] }));
  globalThis.fetch = fetchMock as typeof fetch;

  const buffer = await createProvider().generateImage({
    prompt: "正方形产品图",
    size: "1536x1024",
  });

  expect(buffer.toString()).toBe("square-png");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
    size: "1152x864",
  });
  expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
    size: "1024x1024",
  });
});

it("网关返回图片地址时会下载成 Buffer", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ data: [{ url: "http://127.0.0.1:3999/f.png" }] }))
    .mockResolvedValueOnce(new Response("url-png-bytes", { status: 200 }));
  globalThis.fetch = fetchMock as typeof fetch;

  const buffer = await createProvider().generateImage({
    prompt: "地址返回",
    size: "1024x1024",
  });

  expect(buffer.toString()).toBe("url-png-bytes");
  expect(fetchMock.mock.calls[1]?.[0]).toBe("http://127.0.0.1:3999/f.png");
});

it("文本能力默认走免费路由组，并解析成提示词适配结果", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    jsonResponse({
      choices: [
        {
          message: {
            content: JSON.stringify({
              positive: "保持角色身份的写实夜景人像",
              negative: "文字、水印",
              notes: ["保留身份锚点"],
            }),
          },
        },
      ],
    }),
  );
  globalThis.fetch = fetchMock as typeof fetch;

  await expect(
    createProvider().translatePrompt({
      prompt: "角色夜景人像",
      negative: "水印",
      providerId: "magpie",
      qualityTier: "standard",
    }),
  ).resolves.toMatchObject({
    providerId: "magpie",
    qualityTier: "standard",
    positive: "保持角色身份的写实夜景人像",
    notes: ["保留身份锚点"],
  });
  expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
    model: "group/free-token-pool",
  });
});

it("视频三段式：创建拿到编号、查询状态、取回内容", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ id: "vid_1", status: "queued" }))
    .mockResolvedValueOnce(jsonResponse({ id: "vid_1", status: "completed" }))
    .mockResolvedValueOnce(new Response("mp4-bytes", { status: 200 }));
  globalThis.fetch = fetchMock as typeof fetch;

  const provider = createProvider();
  await expect(
    provider.createVideo({ prompt: "镜头推进", model: "sora-2-pro", size: "1280x720", seconds: 8 }),
  ).resolves.toMatchObject({ id: "vid_1", status: "queued" });
  await expect(provider.getVideo("vid_1")).resolves.toMatchObject({ status: "completed" });
  await expect(provider.downloadVideo("vid_1")).resolves.toEqual(Buffer.from("mp4-bytes"));

  expect(fetchMock.mock.calls[1]?.[0]).toBe("http://127.0.0.1:3999/v1/videos/vid_1");
  expect(fetchMock.mock.calls[2]?.[0]).toBe(
    "http://127.0.0.1:3999/v1/videos/vid_1/content",
  );
});

it("网关没有会出图的平台时，报错要指向可执行的下一步而不是原始 404", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    jsonResponse(
      { error: { message: 'magpie knows no model "freeimg/flux" to draw with', type: "not_found_error" } },
      404,
    ),
  );
  globalThis.fetch = fetchMock as typeof fetch;

  await expect(
    createProvider().generateImage({ prompt: "产品图", size: "1024x1536" }),
  ).rejects.toThrow("免费池里还没有会出图的平台");
  // 没有会画图的平台时不该再白白重试一次正方形。
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
