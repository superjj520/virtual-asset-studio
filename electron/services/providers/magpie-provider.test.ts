import { afterEach, expect, it, vi } from "vitest";
import { MagpieProvider } from "./magpie-provider";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

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

it("六档尺寸原样透传给出图端点，负向提示词不外发", async () => {
  const png = Buffer.from("fake-png-bytes").toString("base64");
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [{ b64_json: png }] }));
  globalThis.fetch = fetchMock as typeof fetch;

  const buffer = await createProvider().generateImage({
    prompt: "一盏黄铜台灯，暖光，深色木质桌面",
    negative: "文字、水印",
    size: "1536x1152",
    quality: "high",
    seed: 42,
  });

  expect(buffer.toString()).toBe("fake-png-bytes");
  expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:3999/v1/images/generations");
  expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
    Authorization: "Bearer magpie-test-gateway-key",
  });
  const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
  expect(body).toMatchObject({ model: "freeimg/flux", size: "1536x1152", seed: 42 });
  // 免费档没有负向提示词通道：宁可不上，也不要假装传了。
  expect(body).not.toHaveProperty("negative");
});

it("免费档拒绝非正方形尺寸时自动退回 1024x1024", async () => {
  const png = Buffer.from("square-png").toString("base64");
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ error: { message: "unsupported size" } }, 400))
    .mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: png }] }));
  globalThis.fetch = fetchMock as typeof fetch;

  const buffer = await createProvider().generateImage({ prompt: "正方形", size: "864x1536" });

  expect(buffer.toString()).toBe("square-png");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ size: "1024x1024" });
});

it("出图端点回图片地址时会下载成 Buffer", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ data: [{ url: "http://127.0.0.1:3999/f.png" }] }))
    .mockResolvedValueOnce(new Response("url-png-bytes", { status: 200 }));
  globalThis.fetch = fetchMock as typeof fetch;

  const buffer = await createProvider().generateImage({ prompt: "地址返回", size: "1024x1024" });

  expect(buffer.toString()).toBe("url-png-bytes");
  expect(fetchMock.mock.calls[1]?.[0]).toBe("http://127.0.0.1:3999/f.png");
});

it("没有会出图的平台时只请求一次，并给出可执行的下一步", async () => {
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
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("文本能力默认走免费路由组，并解析成提示词适配结果", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    jsonResponse({
      choices: [{
        message: {
          content: JSON.stringify({
            positive: "brass desk lamp, warm glow, dark wood desk, shallow depth of field",
            negative: "text, watermark",
            notes: ["保留材质与光线的对应关系"],
          }),
        },
      }],
    }),
  );
  globalThis.fetch = fetchMock as typeof fetch;

  await expect(
    createProvider().translatePrompt({
      prompt: "黄铜台灯，暖光，深色木桌",
      negative: "水印",
      providerId: "magpie",
      qualityTier: "premium",
    }),
  ).resolves.toMatchObject({
    providerId: "magpie",
    qualityTier: "premium",
    positive: "brass desk lamp, warm glow, dark wood desk, shallow depth of field",
    negative: "text, watermark",
    notes: ["保留材质与光线的对应关系"],
  });
  expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
    model: "group/free-token-pool",
  });
});

it("创作卡补全把模型返回的 JSON 解析成建议字段", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    jsonResponse({
      choices: [{
        message: {
          content: "```json\n" + JSON.stringify({ scene: "雨后玻璃温室", lighting: "侧面柔光", reasoning: "补足场景基线" }) + "\n```",
        },
      }],
    }),
  );
  globalThis.fetch = fetchMock as typeof fetch;

  await expect(
    createProvider().enrichCreativeCard({
      intent: "人物创作", subject: "成年女性", identityAnchor: "", bodyAndWardrobe: "", expressionAndPose: "",
      scene: "", lighting: "", camera: "", style: "", avoid: "", aspectRatio: "9:16", referenceAssetIds: [],
    }),
  ).resolves.toMatchObject({ scene: "雨后玻璃温室", lighting: "侧面柔光" });
});
