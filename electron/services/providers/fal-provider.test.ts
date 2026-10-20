import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FalProvider } from "./fal-provider";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

it("fal 使用低成本 schnell 队列生成图片", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ request_id: "req-1" }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: "COMPLETED" }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ images: [{ url: "https://fal.example/image.png" }] }), { status: 200 }))
    .mockResolvedValueOnce(new Response(Buffer.from("fal-image"), { status: 200 }));
  globalThis.fetch = fetchMock as typeof fetch;
  const provider = new FalProvider({ apiKey: () => "fal-test-key-with-enough-length" });
  await expect(provider.generateImage({ prompt: "夜色中的东方人像", size: "1024x1024" })).resolves.toEqual(Buffer.from("fal-image"));
  expect(fetchMock.mock.calls[0]?.[0]).toBe("https://queue.fal.run/fal-ai/flux/schnell");
  expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
    image_size: { width: 1024, height: 1024 },
    num_inference_steps: 4,
    output_format: "png",
  });
});

it("fal 使用 Kontext dev 的 data URI 参考图修订", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ request_id: "req-2" }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: "COMPLETED" }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ images: [{ data: "data:image/png;base64,ZWQ=" }] }), { status: 200 }));
  globalThis.fetch = fetchMock as typeof fetch;
  const provider = new FalProvider({ apiKey: () => "fal-test-key-with-enough-length" });
  const referencePath = join(mkdtempSync(join(tmpdir(), "fal-provider-")), "reference.png");
  writeFileSync(referencePath, Buffer.from("reference"));
  await expect(provider.refineImage({ prompt: "只改光线", size: "1024x1024", referencePath, referenceMediaType: "image/png" })).resolves.toEqual(Buffer.from("ed"));
  expect(fetchMock.mock.calls[0]?.[0]).toBe("https://queue.fal.run/fal-ai/flux-kontext/dev");
  expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
    prompt: "只改光线",
    resolution_mode: "match_input",
    num_images: 1,
  });
});
