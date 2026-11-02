import { randomUUID } from "node:crypto";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import { mkdir, rm, writeFile } from "node:fs/promises";
import type { Asset, AssetType } from "../../src/shared/types";
import {
  CLOUD_REFERENCE_SOURCE,
  type CloudReferenceCatalog,
  type CloudReferenceItem,
  type CloudReferenceKind,
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
  set: "hair" | "outfit" | "pose";
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
  private readonly thumbnailCache = new Map<string, string>();

  constructor(
    private readonly importer: ImportService,
    private readonly assets: AssetRepository,
    private readonly projects: ProjectRepository,
  ) {}

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
    if (cached) return cached;
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
    const [poses, costumes, portraits, charDb, depths] = await Promise.all([
      this.fetchJson<PoseRow[]>("/data/pose-zh.json"),
      this.fetchJson<CostumeRow[]>("/data/costume-zh.json"),
      this.fetchJson<PortraitRow[]>("/data/portrait-zh.json"),
      this.fetchCharDb(),
      this.fetchDepthPoses(),
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
    const charDbItems = charDb.map((row) => {
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
    const items = [
      ...normalize(portraitItems),
      ...normalize(costumeItems),
      ...normalize(poseItems),
      ...normalize(charDbItems, CHAR_DB_SOURCE),
      ...normalize(depthItems, DEPTH_SOURCE),
    ];
    const value: CloudReferenceCatalog = {
      sourceName: `${CLOUD_REFERENCE_SOURCE.name} + ${CHAR_DB_SOURCE.name} + ${DEPTH_SOURCE.name}`,
      sourceUrl: CLOUD_REFERENCE_SOURCE.url,
      attribution: `${CLOUD_REFERENCE_SOURCE.attribution}；${CHAR_DB_SOURCE.attribution}；${DEPTH_SOURCE.attribution}`,
      fetchedAt: new Date().toISOString(),
      counts: {
        portrait: portraitItems.length,
        costume: costumeItems.length + charDb.filter((row) => row.set === "outfit").length,
        hair: charDb.filter((row) => row.set === "hair").length,
        pose: poseItems.length + charDb.filter((row) => row.set === "pose").length,
        depth: depthItems.length,
      },
      imageCounts: {
        portrait: portraits.length,
        costume: costumes.length + charDb.filter((row) => row.set === "outfit").length,
        hair: charDb.filter((row) => row.set === "hair").length,
        pose: poses.length + charDb.filter((row) => row.set === "pose").length,
        depth: depths.length,
      },
      totalImages: portraits.length + costumes.length + poses.length + charDb.length + depths.length,
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
   * 深度姿势集把全部数据内联在首页脚本里（`const D=[...]`），没有独立的 JSON 端点。
   * 它属于增量素材：读取失败时退化为空列表，不影响主库其余部分。
   */
  private async fetchDepthPoses(): Promise<DepthRow[]> {
    try {
      const response = await transport(DEPTH_BASE);
      if (!response.ok) return [];
      const html = await response.text();
      const marker = "const D=";
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
      const parsed = JSON.parse(html.slice(from, end)) as DepthRow[];
      return Array.isArray(parsed) ? parsed : [];
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
