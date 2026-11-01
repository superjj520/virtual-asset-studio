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
    expect(catalog.counts).toEqual({ portrait: 1, costume: 1, pose: 2 });
    expect(catalog.items).toHaveLength(4);
    expect(catalog.items.filter((item) => item.kind === "pose")).toHaveLength(2);
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
