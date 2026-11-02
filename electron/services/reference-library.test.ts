import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudReferenceLibrary } from "./reference-library";
import type { AssetRepository } from "./assets/repository";
import type { ImportService } from "./import/import-service";
import type { ProjectRepository } from "./projects/repository";
import type { Asset } from "../../src/shared/types";

const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const image = () =>
  new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { "content-type": "image/webp" },
  });

const poseRow = (angle: string) => ({
  id: `P001-${angle}`,
  姿势编号: "P001",
  姿势名称: "站姿",
  体系: "全身单人",
  分类: "站姿",
  角度: angle,
  缩略图: `thumbs/full_single_P001_${angle}.jpg`,
  原图: `img/full_single_P001_${angle}.jpg`,
});

describe("云端参考库", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("合并三类数据，并按姿势编号分组", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("char-db-cn/main/data.js")) {
          return new Response(
            `window.CHARDB=${JSON.stringify({
              items: [
                { id: "H001", set: "hair", cat: "髪型", catZh: "发型", zh: "长发", tags: "long hair", line: false },
                { id: "O001", set: "outfit", cat: "制服", catZh: "制服/学生", zh: "水手服", tags: "serafuku" },
                { id: "P001", set: "pose", cat: "立ち", catZh: "站姿", zh: "站姿", tags: "standing", line: true },
              ],
            })};`,
            { status: 200, headers: { "content-type": "application/javascript" } },
          );
        }
        if (url.includes("pose-zh"))
          return json([
            poseRow("正面"),
            poseRow("侧面"),
            { ...poseRow("正面"), id: "half_P001_front", 体系: "上半身单人" },
          ]);
        if (url.includes("costume-zh"))
          return json([
            {
              id: "SPR-0001",
              服装名称: "白色衬衫",
              分类: "春",
              标签: ["白衬衫"],
              缩略图: "thumbs/costume/SPR-0001.webp",
              原图: "img/costume/SPR-0001.webp",
            },
          ]);
        return json([
          {
            id: "f71f980dde3",
            分区: "人像",
            发型名称: "短发",
            缩略图: "thumbs/portrait/f71f980dde3.webp",
            原图: "img/portrait/f71f980dde3.webp",
          },
        ]);
      }),
    );
    const library = new CloudReferenceLibrary(
      {} as ImportService,
      {} as AssetRepository,
      {} as ProjectRepository,
    );
    const catalog = await library.list();
    expect(catalog.counts).toEqual({ portrait: 1, costume: 2, hair: 1, pose: 3, depth: 0, "anime-costume": 0 });
    expect(catalog.imageCounts).toEqual({ portrait: 1, costume: 2, hair: 1, pose: 4, depth: 0, "anime-costume": 0 });
    expect(catalog.totalImages).toBe(8);
    expect(catalog.items).toHaveLength(7);
    expect(catalog.items.filter((item) => item.kind === "pose")).toHaveLength(3);
    const linePose = catalog.items.find((item) => item.id === "char-db-P001");
    expect(linePose?.lineUrl).toContain("/line/P001.png");
    expect(catalog.items.find((item) => item.kind === "hair")?.sourceName).toContain("二次元");
  });

  it("同一姿势保留全部视角，正面排首位作为默认预览", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("char-db-cn/main/data.js"))
          return new Response(`window.CHARDB=${JSON.stringify({ items: [] })};`, {
            status: 200,
            headers: { "content-type": "application/javascript" },
          });
        if (url.includes("pose-zh"))
          return json([
            poseRow("侧面"),
            poseRow("俯视"),
            poseRow("正面"),
            poseRow("斜侧"),
            poseRow("仰视"),
          ]);
        if (url.includes("costume-zh")) return json([]);
        if (url.includes("portrait-zh")) return json([]);
        throw new Error(`未预期的请求：${url}`);
      }),
    );
    const library = new CloudReferenceLibrary(
      {} as ImportService,
      {} as AssetRepository,
      {} as ProjectRepository,
    );
    const catalog = await library.list();
    const pose = catalog.items.find((item) => item.kind === "pose");
    expect(pose).toBeDefined();
    expect(pose?.variants?.map((variant) => variant.label)).toEqual([
      "正面",
      "斜侧",
      "侧面",
      "仰视",
      "俯视",
    ]);
    expect(pose?.variants?.[0].imageUrl).toBe(pose?.imageUrl);
    expect(pose?.variants?.[0].thumbUrl).toBe(pose?.thumbUrl);
    expect(pose?.variants?.every((variant) => variant.id.startsWith("pose-"))).toBe(true);
    expect(new Set(pose?.variants?.map((variant) => variant.id)).size).toBe(5);
  });

  it("单视角姿势不产生视角列表", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("char-db-cn/main/data.js"))
          return new Response(`window.CHARDB=${JSON.stringify({ items: [] })};`, {
            status: 200,
            headers: { "content-type": "application/javascript" },
          });
        if (url.includes("pose-zh")) return json([poseRow("正面")]);
        if (url.includes("costume-zh")) return json([]);
        if (url.includes("portrait-zh")) return json([]);
        throw new Error(`未预期的请求：${url}`);
      }),
    );
    const library = new CloudReferenceLibrary(
      {} as ImportService,
      {} as AssetRepository,
      {} as ProjectRepository,
    );
    const catalog = await library.list();
    expect(catalog.items.find((item) => item.kind === "pose")?.variants).toBeUndefined();
  });

  it("解析深度姿势集的内联数据并作为独立分类", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("char-db-cn/main/data.js"))
          return new Response(`window.CHARDB=${JSON.stringify({ items: [] })};`, {
            status: 200,
            headers: { "content-type": "application/javascript" },
          });
        if (url.includes("pose-zh")) return json([]);
        if (url.includes("costume-zh")) return json([]);
        if (url.includes("portrait-zh")) return json([]);
        if (url.includes("ai-pose-depth-gallery"))
          return new Response(
            `<!doctype html><script>const META={"lines":[]}; const D=[{"id":"full_sexy_P001_front","系統":"全身1人・セクシー系","ポーズ番号":"P001","分類":"立ち","ポーズ名":"S字立ち","アングル":"正面","サムネ":"thumbs/a.jpg","原寸":"img/a.png"}];</script>`,
            { status: 200, headers: { "content-type": "text/html" } },
          );
        throw new Error(`未预期的请求：${url}`);
      }),
    );
    const library = new CloudReferenceLibrary(
      {} as ImportService,
      {} as AssetRepository,
      {} as ProjectRepository,
    );
    const catalog = await library.list();
    expect(catalog.counts.depth).toBe(1);
    const depth = catalog.items.find((item) => item.kind === "depth");
    expect(depth).toMatchObject({
      id: "depth-full_sexy_P001_front",
      thumbUrl: "https://ai-pose-depth-gallery.pages.dev/thumbs/a.jpg",
      imageUrl: "https://ai-pose-depth-gallery.pages.dev/img/a.png",
      sourceName: "POSE-DB Depth",
    });
    expect(depth?.title).toContain("正面");
    expect(depth?.category).toBe("立ち");
  });

  it("解析动漫衣装库的内联数据并作为独立分类", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("char-db-cn/main/data.js"))
          return new Response(`window.CHARDB=${JSON.stringify({ items: [] })};`, {
            status: 200,
            headers: { "content-type": "application/javascript" },
          });
        if (url.includes("pose-zh")) return json([]);
        if (url.includes("costume-zh")) return json([]);
        if (url.includes("portrait-zh")) return json([]);
        if (url.includes("ai-costume-anime-gallery"))
          return new Response(
            `<!doctype html><script>const META={"total":1,"cats":["春"]}; const D=[{"id":"SPR-0001","カテゴリ":"春","キーワード":"ivory frill knit denim mini skirt","サムネ":"thumbs/SPR-0001.webp","画像":"img/SPR-0001.webp","原寸":"png/SPR-0001.png"}];</script>`,
            { status: 200, headers: { "content-type": "text/html" } },
          );
        throw new Error(`未预期的请求：${url}`);
      }),
    );
    const library = new CloudReferenceLibrary(
      {} as ImportService,
      {} as AssetRepository,
      {} as ProjectRepository,
    );
    const catalog = await library.list();
    expect(catalog.counts["anime-costume"]).toBe(1);
    const item = catalog.items.find((entry) => entry.kind === "anime-costume");
    expect(item).toMatchObject({
      id: "anime-costume-SPR-0001",
      thumbUrl: "https://ai-costume-anime-gallery.pages.dev/thumbs/SPR-0001.webp",
      imageUrl: "https://ai-costume-anime-gallery.pages.dev/img/SPR-0001.webp",
      sourceName: "COSTUME-ANIME-DB",
    });
    expect(item?.category).toBe("春");
    // 关键词拆成标签，搜索框能命中「denim」这类词。
    expect(item?.tags).toContain("denim");
    expect(catalog.totalImages).toBe(1);
  });

  it("深度姿势集读取失败时不影响其余素材", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("char-db-cn/main/data.js"))
          return new Response(`window.CHARDB=${JSON.stringify({ items: [] })};`, {
            status: 200,
            headers: { "content-type": "application/javascript" },
          });
        if (url.includes("pose-zh")) return json([poseRow("正面")]);
        if (url.includes("costume-zh")) return json([]);
        if (url.includes("portrait-zh")) return json([]);
        if (url.includes("ai-pose-depth-gallery"))
          return new Response("服务不可用", { status: 503 });
        throw new Error(`未预期的请求：${url}`);
      }),
    );
    const library = new CloudReferenceLibrary(
      {} as ImportService,
      {} as AssetRepository,
      {} as ProjectRepository,
    );
    const catalog = await library.list();
    expect(catalog.counts.depth).toBe(0);
    expect(catalog.counts.pose).toBe(1);
  });

  it("引用单张时入库、确认、绑定项目并写入来源", async () => {
    const asset = { id: "asset-1", metadata: {} } as Asset;
    const importer = {
      import: vi.fn().mockResolvedValue({ asset }),
    } as unknown as ImportService;
    const assets = {
      updateConfirmation: vi.fn(),
      mergeMetadata: vi.fn(),
      findById: vi.fn().mockReturnValue(asset),
    } as unknown as AssetRepository;
    const projects = { attachAsset: vi.fn() } as unknown as ProjectRepository;
    vi.stubGlobal("fetch", vi.fn(async () => image()));
    const library = new CloudReferenceLibrary(importer, assets, projects);
    const result = await library.importItem(
      {
        id: "portrait-f71f980dde3",
        kind: "portrait",
        title: "短发 · 标准款",
        category: "人像",
        tags: [],
        thumbUrl: "https://ai-pose-gallery.anhao.app/thumbs/portrait/f71.webp",
        imageUrl: "https://ai-pose-gallery.anhao.app/img/portrait/f71.webp",
        sourceName: "anhao",
        sourceUrl: "https://ai-pose-gallery.anhao.app/",
      },
      "project-1",
    );
    expect(result.id).toBe("asset-1");
    expect(importer.import).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        rightsStatus: "authorized",
        type: "reference_image",
      }),
    );
    expect(assets.updateConfirmation).toHaveBeenCalledWith("asset-1", "confirmed");
    expect(projects.attachAsset).toHaveBeenCalledWith("project-1", "asset-1");
    expect(assets.mergeMetadata).toHaveBeenCalledWith(
      "asset-1",
      expect.objectContaining({
        cloudReference: expect.objectContaining({
          sourceName: "anhao",
          itemId: "portrait-f71f980dde3",
        }),
      }),
    );
  });

  it("拒绝未登记的云端来源", async () => {
    const library = new CloudReferenceLibrary(
      {} as ImportService,
      {} as AssetRepository,
      {} as ProjectRepository,
    );
    await expect(
      library.importItem({
        id: "x",
        kind: "portrait",
        title: "x",
        category: "x",
        tags: [],
        thumbUrl: "https://evil.example/x.webp",
        imageUrl: "https://evil.example/x.webp",
        sourceName: "evil",
        sourceUrl: "https://evil.example",
      }),
    ).rejects.toThrow("只允许引用已登记的云端参考库");
  });
});

it("缩略图缓存有上限，翻太多张时淘汰最旧的，不会一直涨内存", async () => {
  let imageFetches = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/thumbs/")) {
        imageFetches += 1;
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/webp" },
        });
      }
      throw new Error(`未预期的请求：${url}`);
    }),
  );
  const library = new CloudReferenceLibrary(
    {} as ImportService,
    {} as AssetRepository,
    {} as ProjectRepository,
    { maxThumbnails: 2 },
  );
  const base = "https://ai-pose-gallery.anhao.app/thumbs/";
  await library.thumbnail(`${base}a.webp`);
  await library.thumbnail(`${base}b.webp`);
  // a、b 都在缓存里
  expect(imageFetches).toBe(2);
  await library.thumbnail(`${base}a.webp`);
  expect(imageFetches).toBe(2);
  // 第三张进来，最旧的 b 被淘汰
  await library.thumbnail(`${base}c.webp`);
  expect(imageFetches).toBe(3);
  await library.thumbnail(`${base}c.webp`);
  expect(imageFetches).toBe(3);
  await library.thumbnail(`${base}b.webp`);
  expect(imageFetches).toBe(4);
});
