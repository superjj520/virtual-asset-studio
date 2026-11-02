import { randomUUID } from "node:crypto";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import { mkdir, rm, writeFile } from "node:fs/promises";
import type { Asset, AssetType } from "../../src/shared/types";
import {
  CLOUD_REFERENCE_SOURCE,
  type CloudHealthReport,
  type CloudImageProbe,
  type CloudReferenceCatalog,
  type CloudReferenceItem,
  type CloudReferenceKind,
  type CloudSourceHealth,
} from "../../src/shared/reference-library";
import type { AssetRepository } from "./assets/repository";
import type { ImportService } from "./import/import-service";
import type { ProjectRepository } from "./projects/repository";

const BASE_URL = "https://ai-pose-gallery.anhao.app";
const CHAR_DB_DATA_URL = "https://raw.githubusercontent.com/sleepy-zone/char-db-cn/main/data.js";
const CHAR_DB_THUMB_BASE = "https://raw.githubusercontent.com/sleepy-zone/char-db-cn/main/thumbs";
const CHAR_DB_IMAGE_BASE = "https://charadb-2fi.pages.dev";
const DEPTH_BASE = "https://ai-pose-depth-gallery.pages.dev";
const DEPTH_SOURCE = {
  name: "POSE-DB Depth",
  url: "https://ai-pose-depth-gallery.pages.dev/",
  attribution: "depth ポーズ集 POSE-DB-02 · 姿势深度图，供 ControlNet Depth 使用",
} as const;
const ANIME_BASE = "https://ai-costume-anime-gallery.pages.dev";
const ANIME_SOURCE = {
  name: "COSTUME-ANIME-DB",
  url: "https://ai-costume-anime-gallery.pages.dev/",
  attribution: "衣装集 アニメ版 COSTUME-ANIME-DB · 动漫服装参考库",
} as const;
const CHAR_DB_SOURCE = {
  name: "二次元角色换装库 · 中文版",
  url: "https://sleepyzone.online/char-db-cn/",
  attribution: "たき AI / sleepy-zone · 发型 / 服装 / 姿势检索库",
} as const;
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_BYTES = 24 * 1024 * 1024;

type PoseRow = {
  id: string;
  姿势编号?: string;
  姿势名称?: string;
  体系?: string;
  分类?: string;
  角度?: string;
  缩略图?: string;
  原图?: string;
};

type AnimeCostumeRow = {
  id: string;
  カテゴリ?: string;
  キーワード?: string;
  サムネ?: string;
  画像?: string;
  原寸?: string;
};

type DepthRow = {
  id: string;
  系統?: string;
  ポーズ番号?: string;
  分類?: string;
  ポーズ名?: string;
  アングル?: string;
  サムネ?: string;
  原寸?: string;
};

type CostumeRow = {
  id: string;
  分类?: string;
  服装名称?: string;
  标签?: string[];
  缩略图?: string;
  预览图?: string;
  原图?: string;
};

type CharDbRow = {
  id: string;
  /**
   * 上游实际有四种 set。`outfit2` 与动漫衣装站是同一批 1,320 条，
   * 不作为独立条目收录（见 charDbOnly 白名单），但它的 catZh 是中文分类，
   * 拿来当动漫衣装的翻译表。
   */
  set: "hair" | "outfit" | "pose" | "outfit2";
  cat?: string;
  catZh?: string;
  zh?: string;
  jp?: string;
  tags?: string;
  line?: boolean;
};

type PortraitRow = {
  id: string;
  分区?: string;
  发长?: string;
  发型名称?: string;
  标题?: string;
  缩略图?: string;
  原图?: string;
};

class CloudReferenceLibrary {
  private cache?: { value: CloudReferenceCatalog; expiresAt: number };
  private inflight?: Promise<CloudReferenceCatalog>;
  /**
   * 缩略图常驻内存：一张 base64 约 10–40KB，整库 6,980 张全翻一遍就是上百 MB。
   * 用上限 + LRU 淘汰，翻回旧位置时重新拉一张图，比一直涨内存便宜。
   */
  private readonly thumbnailCache = new Map<string, string>();
  private readonly maxThumbnails: number;

  constructor(
    private readonly importer: ImportService,
    private readonly assets: AssetRepository,
    private readonly projects: ProjectRepository,
    options: { maxThumbnails?: number } = {},
  ) {
    this.maxThumbnails = Math.max(1, options.maxThumbnails ?? 300);
  }

  /**
   * 逐源体检。刻意不复用 `load()`：`load()` 里增量源失败会退化成空数组，
   * 那样体检就永远显示「正常但 0 条」，等于自己骗自己。
   */
  async health(): Promise<CloudHealthReport> {
    const probe = async <T>(
      key: string,
      label: string,
      run: () => Promise<T[]>,
      pickUrls: (rows: T[]) => string[] = () => [],
    ): Promise<{ health: CloudSourceHealth; rows: T[] }> => {
      const startedAt = Date.now();
      try {
        const rows = await run();
        const count = rows.length;
        const urls = count > 0 ? pickSample(pickUrls(rows), 3) : [];
        const images =
          urls.length > 0 ? await Promise.all(urls.map((url) => this.probeImage(url))) : [];
        return {
          rows,
          health: {
            key,
            label,
            count,
            status: count > 0 ? "ok" : "empty",
            durationMs: Date.now() - startedAt,
            images,
          },
        };
      } catch (error) {
        return {
          rows: [],
          health: {
            key,
            label,
            count: 0,
            status: "error",
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startedAt,
          },
        };
      }
    };

    const [poses, costumes, portraits, charDb, depths, animeCostumes] = await Promise.all([
      probe(
        "pose",
        "姿势",
        () => this.fetchJson<PoseRow[]>("/data/pose-zh.json"),
        (rows) => rows.map((row) => absoluteUrl(row.缩略图 ?? row.原图)),
      ),
      probe(
        "costume",
        "服装",
        () => this.fetchJson<CostumeRow[]>("/data/costume-zh.json"),
        (rows) => rows.map((row) => absoluteUrl(row.缩略图 ?? row.预览图 ?? row.原图)),
      ),
      probe(
        "portrait",
        "人像",
        () => this.fetchJson<PortraitRow[]>("/data/portrait-zh.json"),
        (rows) => rows.map((row) => absoluteUrl(row.缩略图)),
      ),
      probe(
        "char-db",
        "二次元换装",
        () => this.fetchCharDb(),
        (rows) => rows.map((row) => `${CHAR_DB_THUMB_BASE}/${encodeURIComponent(row.id)}.webp`),
      ),
      probe("depth", "深度图", () => this.fetchDepthPosesStrict(), (rows) =>
        rows.map((row) => depthUrl(row.サムネ ?? row.原寸)),
      ),
      probe("anime-costume", "动漫衣装", () => this.fetchAnimeCostumesStrict(), (rows) =>
        rows.map((row) => animeUrl(row.サムネ ?? row.画像)),
      ),
    ]);

    const charDbOnly = charDb.rows.filter(
      (row) => row.set === "hair" || row.set === "outfit" || row.set === "pose",
    );
    const sources = [
      poses.health,
      costumes.health,
      portraits.health,
      { ...charDb.health, count: charDbOnly.length },
      depths.health,
      animeCostumes.health,
    ];
    // 口径必须和 list() 的 counts 一致：姿势按组算（288），不是按张算（1,439）。
    const poseGroups = groupPoses(poses.rows).length;
    const charDbHair = charDbOnly.filter((row) => row.set === "hair").length;
    const charDbCostume = charDbOnly.filter((row) => row.set === "outfit").length;
    const charDbPose = charDbOnly.filter((row) => row.set === "pose").length;
    return {
      checkedAt: new Date().toISOString(),
      totalItems:
        poseGroups +
        charDbPose +
        costumes.rows.length +
        charDbCostume +
        portraits.rows.length +
        charDbHair +
        depths.rows.length +
        animeCostumes.rows.length,
      totalImages:
        poses.rows.length +
        costumes.rows.length +
        portraits.rows.length +
        charDbOnly.length +
        depths.rows.length +
        animeCostumes.rows.length,
      sources,
    };
  }

  /** 抽一张图看能不能真的打开：只取首 1KB，不把整张图读进内存。 */
  private async probeImage(url: string): Promise<CloudImageProbe> {
    try {
      const response = await transport(url);
      const contentType = response.headers.get("content-type") ?? "";
      // 只看状态码不够：上游把图换成 404 页面时通常还是 200，靠类型区分。
      const isImage = contentType.toLowerCase().startsWith("image/");
      if (response.ok && !isImage)
        return {
          url,
          ok: false,
          status: response.status,
          contentType,
          error: `返回的不是图片（${contentType || "没有 content-type"}）`,
        };
      return { url, ok: response.ok, status: response.status, contentType };
    } catch (error) {
      return { url, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** 体检专用：不吞错，让失败原因能显示出来。 */
  private async fetchDepthPosesStrict(): Promise<DepthRow[]> {
    const response = await transport(DEPTH_BASE);
    if (!response.ok) throw new Error(`深度图库读取失败（${response.status}）。`);
    const rows = parseInlineArray<DepthRow>(await response.text(), "const D=");
    if (rows.length === 0) throw new Error("深度图库返回了 0 条，可能页面结构变了。");
    return rows;
  }

  private async fetchAnimeCostumesStrict(): Promise<AnimeCostumeRow[]> {
    const response = await transport(ANIME_BASE);
    if (!response.ok) throw new Error(`动漫衣装库读取失败（${response.status}）。`);
    const rows = parseInlineArray<AnimeCostumeRow>(await response.text(), "const D=");
    if (rows.length === 0) throw new Error("动漫衣装库返回了 0 条，可能页面结构变了。");
    return rows;
  }

  async list(): Promise<CloudReferenceCatalog> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.value;
    if (this.inflight) return this.inflight;
    this.inflight = this.load().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  async thumbnail(url: string): Promise<string> {
    assertCloudUrl(url);
    const cached = this.thumbnailCache.get(url);
    if (cached) {
      // 命中即提到最新，配合下面按插入顺序淘汰
      this.thumbnailCache.delete(url);
      this.thumbnailCache.set(url, cached);
      return cached;
    }
    const response = await transport(url);
    if (!response.ok)
      throw new Error(`云端缩略图读取失败（${response.status}）。`);
    const contentType = response.headers.get("content-type") ?? "image/webp";
    if (!contentType.startsWith("image/"))
      throw new Error("云端缩略图返回的不是图片。");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 4 * 1024 * 1024)
      throw new Error("云端缩略图超过 4MB。");
    const dataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
    this.thumbnailCache.set(url, dataUrl);
    while (this.thumbnailCache.size > this.maxThumbnails) {
      const oldest = this.thumbnailCache.keys().next().value;
      if (oldest === undefined) break;
      this.thumbnailCache.delete(oldest);
    }
    return dataUrl;
  }

  async importItem(item: CloudReferenceItem, projectId?: string): Promise<Asset> {
    assertCloudItem(item);
    const response = await transport(item.imageUrl);
    if (!response.ok)
      throw new Error(`云端参考图下载失败（${response.status}）。`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_BYTES) throw new Error("云端参考图超过 24MB。");
    const contentType = response.headers.get("content-type") ?? "";
    const extension = extensionFor(item.imageUrl, contentType);
    const safeTitle =
      item.title.replace(/[\\/:*?"<>|]/g, " ").trim().slice(0, 60) ||
      `云端参考-${item.id}`;
    const temporaryDirectory = join(tmpdir(), `vas-cloud-${randomUUID()}`);
    await mkdir(temporaryDirectory, { recursive: true });
    const temporaryPath = join(temporaryDirectory, `${safeTitle}${extension}`);
    try {
      await writeFile(temporaryPath, buffer);
      const result = await this.importer.import({
        filePath: temporaryPath,
        sourcePath: item.imageUrl,
        type: assetTypeFor(item.kind),
        projectId,
        rightsStatus: "authorized",
        rightsReason: `云端参考库直接引用：${item.sourceName}（${item.kind} / ${item.id}）`,
        secondaryCategory: item.category,
      });
      this.assets.updateConfirmation(result.asset.id, "confirmed");
      if (projectId) this.projects.attachAsset(projectId, result.asset.id);
      this.assets.mergeMetadata(result.asset.id, {
        cloudReference: {
          sourceName: item.sourceName,
          sourceUrl: item.sourceUrl,
          itemId: item.id,
          kind: item.kind,
          title: item.title,
          imageUrl: item.imageUrl,
          thumbUrl: item.thumbUrl,
        },
      });
      const updated = this.assets.findById(result.asset.id);
      if (!updated) throw new Error("云端参考图写入资产库后未找到。");
      return updated;
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }

  private async load(): Promise<CloudReferenceCatalog> {
    const [poses, costumes, portraits, charDb, depths, animeCostumes] = await Promise.all([
      this.fetchJson<PoseRow[]>("/data/pose-zh.json"),
      this.fetchJson<CostumeRow[]>("/data/costume-zh.json"),
      this.fetchJson<PortraitRow[]>("/data/portrait-zh.json"),
      this.fetchCharDb(),
      this.fetchDepthPoses(),
      this.fetchAnimeCostumes(),
    ]);
    const poseItems = groupPoses(poses);
    const costumeItems = costumes.map((row) => ({
      id: `costume-${row.id}`,
      kind: "costume" as const,
      title: row.服装名称 ?? row.id,
      category: row.分类 ?? "服装",
      tags: row.标签 ?? [],
      thumbUrl: absoluteUrl(row.缩略图 ?? row.预览图),
      imageUrl: absoluteUrl(row.原图 ?? row.预览图 ?? row.缩略图),
    }));
    const portraitItems = portraits.map((row) => ({
      id: `portrait-${row.id}`,
      kind: "portrait" as const,
      title: row.标题 ?? row.发型名称 ?? row.id,
      category: row.分区 ?? "人像",
      tags: [row.发长, row.发型名称].filter((value): value is string => Boolean(value)),
      thumbUrl: absoluteUrl(row.缩略图),
      imageUrl: absoluteUrl(row.原图 ?? row.缩略图),
    }));
    const normalize = (
      items: Array<Omit<CloudReferenceItem, "sourceName" | "sourceUrl">>,
      source: { name: string; url: string } = CLOUD_REFERENCE_SOURCE,
    ) =>
      items
        .filter((item) => Boolean(item.thumbUrl && item.imageUrl))
        .map((item) => ({
          ...item,
          sourceName: source.name,
          sourceUrl: source.url,
        }));
    // char-db-cn 后来加了一个 outfit2（1,320 条），内容与动漫衣装站完全同一批（id 交集 1,320）。
    // 那边已经单独接成「动漫衣装」分类，这里必须排掉，否则它们会被三元表达式的 else 分支
    // 当成「姿势」混进来，既错分类又和动漫衣装重复计数。
    const charDbOnly = charDb.filter(
      (row) => row.set === "hair" || row.set === "outfit" || row.set === "pose",
    );
    const charDbItems = charDbOnly.map((row) => {
      const kind: CloudReferenceKind =
        row.set === "hair" ? "hair" : row.set === "outfit" ? "costume" : "pose";
      return {
        id: `char-db-${row.id}`,
        kind,
        title: row.zh ?? row.id,
        category: row.catZh ?? row.cat ?? "二次元换装",
        tags: (row.tags ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        thumbUrl: `${CHAR_DB_THUMB_BASE}/${encodeURIComponent(row.id)}.webp`,
        imageUrl: `${CHAR_DB_IMAGE_BASE}/img/${encodeURIComponent(row.id)}.jpg`,
        lineUrl: row.line
          ? `${CHAR_DB_IMAGE_BASE}/line/${encodeURIComponent(row.id)}.png`
          : undefined,
      };
    });
    const depthItems = depths.map((row) => ({
      id: `depth-${row.id}`,
      kind: "depth" as const,
      title: `${row.ポーズ名 ?? row.ポーズ番号 ?? row.id} · ${row.アングル ?? "视角"}`,
      category: row.分類 ?? "姿势深度",
      tags: [row.系統, row.アングル].filter((value): value is string => Boolean(value)),
      thumbUrl: depthUrl(row.サムネ),
      imageUrl: depthUrl(row.原寸 ?? row.サムネ),
    }));
    /**
     * 动漫衣装站的分类是日文（ランジェリー / パーティ / 水着 / セクシー）。
     * char-db-cn 的 outfit2 是同一批 1,320 条，id 一一对应，`catZh` 就是中文分类，
     * 拿它做翻译表，界面才不用中日混排。
     */
    const animeCategoryZh = new Map(
      charDb
        .filter((row) => row.set === "outfit2")
        .map((row) => [row.id, row.catZh ?? ""]),
    );
    const animeItems = animeCostumes.map((row) => {
      const category = animeCategoryZh.get(row.id) || row.カテゴリ || "动漫衣装";
      return {
      id: `anime-costume-${row.id}`,
      kind: "anime-costume" as const,
      title: `${category} · ${row.id}`,
      category,
      tags: [
        category,
        ...(row.キーワード ?? "").split(/\s+/).filter(Boolean),
      ].filter((value): value is string => Boolean(value)),
      thumbUrl: animeUrl(row.サムネ),
      imageUrl: animeUrl(row.画像 ?? row.サムネ),
      };
    });
    const items = [
      ...normalize(portraitItems),
      ...normalize(costumeItems),
      ...normalize(poseItems),
      ...normalize(charDbItems, CHAR_DB_SOURCE),
      ...normalize(depthItems, DEPTH_SOURCE),
      ...normalize(animeItems, ANIME_SOURCE),
    ];
    const value: CloudReferenceCatalog = {
      sourceName: `${CLOUD_REFERENCE_SOURCE.name} + ${CHAR_DB_SOURCE.name} + ${DEPTH_SOURCE.name} + ${ANIME_SOURCE.name}`,
      sourceUrl: CLOUD_REFERENCE_SOURCE.url,
      attribution: `${CLOUD_REFERENCE_SOURCE.attribution}；${CHAR_DB_SOURCE.attribution}；${DEPTH_SOURCE.attribution}；${ANIME_SOURCE.attribution}`,
      fetchedAt: new Date().toISOString(),
      counts: {
        portrait: portraitItems.length,
        costume: costumeItems.length + charDbOnly.filter((row) => row.set === "outfit").length,
        hair: charDbOnly.filter((row) => row.set === "hair").length,
        pose: poseItems.length + charDbOnly.filter((row) => row.set === "pose").length,
        depth: depthItems.length,
        "anime-costume": animeItems.length,
      },
      imageCounts: {
        portrait: portraits.length,
        costume: costumes.length + charDbOnly.filter((row) => row.set === "outfit").length,
        hair: charDbOnly.filter((row) => row.set === "hair").length,
        pose: poses.length + charDbOnly.filter((row) => row.set === "pose").length,
        depth: depths.length,
        "anime-costume": animeCostumes.length,
      },
      totalImages:
        portraits.length +
        costumes.length +
        poses.length +
        charDbOnly.length +
        depths.length +
        animeCostumes.length,
      items,
    };
    this.cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  }

  private async fetchCharDb(): Promise<CharDbRow[]> {
    const response = await transport(CHAR_DB_DATA_URL);
    if (!response.ok)
      throw new Error(`二次元换装库读取失败（${response.status}）。`);
    const text = await response.text();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start)
      throw new Error("二次元换装库数据格式无效。");
    const parsed = JSON.parse(text.slice(start, end + 1)) as { items?: CharDbRow[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  }

  /**
   * 动漫衣装库同样把数据内联在首页脚本里（`const D=[...]`），1,320 条。
   * 属于增量素材：读取失败退化为空列表，不影响主库其余部分。
   */
  private async fetchAnimeCostumes(): Promise<AnimeCostumeRow[]> {
    try {
      const response = await transport(ANIME_BASE);
      if (!response.ok) return [];
      return parseInlineArray<AnimeCostumeRow>(await response.text(), "const D=");
    } catch {
      return [];
    }
  }

  /** 深度姿势集：1,439 条，同样内联在首页。失败时同样退化为空列表。 */
  private async fetchDepthPoses(): Promise<DepthRow[]> {
    try {
      const response = await transport(DEPTH_BASE);
      if (!response.ok) return [];
      return parseInlineArray<DepthRow>(await response.text(), "const D=");
    } catch {
      return [];
    }
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await transport(`${BASE_URL}${path}`);
    if (!response.ok)
      throw new Error(`云端参考库读取失败（${response.status}）。`);
    return (await response.json()) as T;
  }
}

const transport = async (url: string): Promise<Response> => {
  if (process.versions.electron) {
    const { net } = await import("electron");
    return net.fetch(url);
  }
  return fetch(url);
};

/** 从列表里均匀抽三张（首、中、尾），用来验图是否还打得开。 */
const pickSample = <T>(values: T[], size: number): T[] => {
  if (values.length <= size) return values;
  const step = (values.length - 1) / (size - 1);
  return Array.from({ length: size }, (_, index) => values[Math.round(index * step)]);
};

/**
 * pages.dev 的静态站把全部数据内联在首页脚本里（`const D=[...]`），没有独立 JSON 端点。
 * 用括号配对扫描取出数组字面量，字符串里的括号不算层级。
 */
const parseInlineArray = <T>(html: string, marker: string): T[] => {
  const start = html.indexOf(marker);
  if (start < 0) return [];
  const from = start + marker.length;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let index = from; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "[" || char === "{") depth += 1;
    else if (char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
  }
  if (end < 0) return [];
  try {
    const parsed = JSON.parse(html.slice(from, end));
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
};

const animeUrl = (path?: string): string => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${ANIME_BASE}/${path.replace(/^\/+/, "")}`;
};

const depthUrl = (path?: string): string => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${DEPTH_BASE}/${path.replace(/^\/+/, "")}`;
};

const absoluteUrl = (path?: string): string => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${BASE_URL}/${path.replace(/^\/+/, "")}`;
};

const extensionFor = (url: string, contentType: string): string => {
  const fromUrl = extname(new URL(url).pathname).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(fromUrl)) return fromUrl;
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  return ".jpg";
};

const assetTypeFor = (kind: CloudReferenceKind): AssetType =>
  kind === "costume" ? "wardrobe" : kind === "pose" ? "pose" : "reference_image";

const CLOUD_ORIGINS = new Set([
  new URL(BASE_URL).origin,
  new URL(CHAR_DB_SOURCE.url).origin,
  new URL(CHAR_DB_IMAGE_BASE).origin,
  new URL(CHAR_DB_THUMB_BASE).origin,
  new URL(DEPTH_BASE).origin,
  new URL(ANIME_BASE).origin,
]);

const assertCloudUrl = (value: string): void => {
  if (!value) throw new Error("云端参考图缺少图片地址。");
  const url = new URL(value);
  if (!CLOUD_ORIGINS.has(url.origin)) throw new Error("只允许引用已登记的云端参考库。");
};

const assertCloudItem = (item: CloudReferenceItem): void => {
  if (!item?.imageUrl) throw new Error("云端参考图缺少图片地址。");
  assertCloudUrl(item.imageUrl);
};

/** 视角展示顺序：先给最常用的人像机位，再补俯仰与背面。 */
const POSE_ANGLE_ORDER = ["正面", "斜侧", "斜前", "侧面", "仰视", "俯视", "背面"];

const angleRank = (angle?: string): number => {
  const index = angle ? POSE_ANGLE_ORDER.indexOf(angle) : -1;
  return index < 0 ? POSE_ANGLE_ORDER.length : index;
};

const groupPoses = (rows: PoseRow[]): Array<Omit<CloudReferenceItem, "sourceName" | "sourceUrl">> => {
  const groups = new Map<string, PoseRow[]>();
  for (const row of rows) {
    const key = `${row.体系 ?? "未分组"}/${row.姿势编号 ?? row.id}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].map(([key, variants]) => {
    const ordered = [...variants].sort((left, right) => angleRank(left.角度) - angleRank(right.角度));
    const preferred = ordered[0];
    const angles = ordered
      .filter((row): row is PoseRow & { 角度: string } => Boolean(row.角度))
      .map((row) => ({
        id: `pose-${key}-${row.角度}`,
        label: row.角度,
        thumbUrl: absoluteUrl(row.缩略图),
        imageUrl: absoluteUrl(row.原图 ?? row.缩略图),
      }));
    return {
      id: `pose-${key}`,
      kind: "pose" as const,
      title: `${preferred.姿势名称 ?? key} · 编号 ${preferred.姿势编号 ?? key} · ${variants.length} 视角`,
      category: preferred.体系 ?? preferred.分类 ?? "姿势",
      tags: [preferred.分类, preferred.角度].filter((value): value is string => Boolean(value)),
      thumbUrl: absoluteUrl(preferred.缩略图),
      imageUrl: absoluteUrl(preferred.原图 ?? preferred.缩略图),
      ...(angles.length > 1 ? { variants: angles } : {}),
    };
  });
};

export { CloudReferenceLibrary };
export const createCloudReferenceLibrary = (
  importer: ImportService,
  assets: AssetRepository,
  projects: ProjectRepository,
) => new CloudReferenceLibrary(importer, assets, projects);
