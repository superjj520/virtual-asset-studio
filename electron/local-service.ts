/**
 * 本地素材服务。
 *
 * 素材已经落到本机之后，本机的其它程序（脚本、ComfyUI、别的创作工具）不该再去爬上游站点，
 * 而应该直接问这台机器。所以这里只做两件事：
 *
 * 1. 把本地资产库**只读**地暴露成 HTTP 接口；
 * 2. 把图片按字节吐出去，路径不出本机。
 *
 * 出图接口直接复用 `ComfyUiImageProvider`，不另写一套占位符规则——否则会出现
 * 「应用里能出图、服务里出不了」这种分叉，而分叉是这类项目最常见的坏味道。
 *
 * 运行：`npm run serve:materials`（Node 22 的 `node:sqlite` 需要 `--experimental-sqlite`）。
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { ComfyUiImageProvider } from "./services/providers/comfyui-image-provider";
import type { ImageGenerationSize } from "../src/shared/types";

type Row = Record<string, unknown>;

/** `node:sqlite` 在 Node 22 里还没有类型声明，用 require 拿，避免为它加一份 d.ts。 */
const require = createRequire(import.meta.url);
type Statement = { get: (...params: unknown[]) => Row | undefined; all: (...params: unknown[]) => Row[] };
type Database = { prepare: (sql: string) => Statement; close: () => void };
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => Database;
};

const DATA_DIRECTORY = join(homedir(), "Library/Application Support/virtual-asset-studio");
const DEFAULT_DB = join(DATA_DIRECTORY, "virtual-asset-studio.sqlite");
const OUTPUT_DIRECTORY = join(DATA_DIRECTORY, "local-service-output");

const argOf = (name: string, fallback?: string): string | undefined => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const DATABASE_PATH = process.env.VAS_DB?.trim() || argOf("db") || DEFAULT_DB;
const PORT = Number(process.env.VAS_SERVICE_PORT || argOf("port") || 7788);
const HOST = "127.0.0.1";

const COMFY_BASE_URL = process.env.VAS_COMFY_URL?.trim() || "http://127.0.0.1:8188";
const COMFY_CHECKPOINT = process.env.VAS_COMFY_CHECKPOINT?.trim() || "";
const COMFY_WORKFLOW = process.env.VAS_COMFY_WORKFLOW?.trim() || "";

/** 云端素材的 kind 存在 metadata 里，本地自建资产只有 type；两个口径都要认。 */
const KIND_EXPRESSION = "coalesce(json_extract(metadata_json, '$.cloudReference.kind'), type)";

const json = (response: ServerResponse, status: number, body: unknown): void => {
  const payload = Buffer.from(JSON.stringify(body, null, 2), "utf8");
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(payload.length),
    "cache-control": "no-store",
  });
  response.end(payload);
};

const fail = (response: ServerResponse, status: number, message: string): void =>
  json(response, status, { error: message });

const toItem = (row: Row) => {
  const metadata = JSON.parse(String(row.metadata_json ?? "{}")) as {
    cloudReference?: { itemId?: string; kind?: string; sourceName?: string; sourceUrl?: string; title?: string };
    secondaryCategory?: string;
  };
  const cloud = metadata.cloudReference ?? {};
  return {
    id: String(row.id),
    name: String(cloud.title ?? row.name ?? ""),
    kind: cloud.kind ?? String(row.type),
    category: metadata.secondaryCategory ?? null,
    sourceName: cloud.sourceName ?? null,
    sourceUrl: cloud.sourceUrl ?? null,
    imageUrl: `/materials/${encodeURIComponent(String(row.id))}/image`,
  };
};

const run = (database: Database, sql: string, params: unknown[]): Row[] =>
  database.prepare(sql).all(...params);

const createDatabase = (): Database => new DatabaseSync(DATABASE_PATH, { readOnly: true });

const listMaterials = (database: Database, query: URLSearchParams) => {
  const kind = (query.get("kind") ?? "").trim();
  const search = (query.get("q") ?? "").trim();
  const limit = Math.min(Math.max(Number(query.get("limit") ?? 48) || 48, 1), 500);
  const offset = Math.max(Number(query.get("offset") ?? 0) || 0, 0);

  const where: string[] = [];
  const params: unknown[] = [];
  if (kind) {
    where.push(`${KIND_EXPRESSION} = ?`);
    params.push(kind);
  }
  if (search) {
    // 名称、分类、标签都查一遍：用户搜「站姿」时，很多条目的标签里才有这个词。
    where.push("(name LIKE ? OR metadata_json LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = Number(
    run(database, `SELECT count(*) AS total FROM assets ${clause}`, params)[0]?.total ?? 0,
  );
  const rows = run(
    database,
    `SELECT id, type, name, metadata_json FROM assets ${clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return { total, limit, offset, items: rows.map(toItem) };
};

const readMaterial = (database: Database, id: string) => {
  const row = run(database, "SELECT * FROM assets WHERE id = ? LIMIT 1", [id])[0];
  if (!row) return undefined;
  const metadata = JSON.parse(String(row.metadata_json ?? "{}")) as {
    cloudReference?: { itemId?: string; imageUrl?: string; title?: string };
  };
  return {
    ...toItem(row),
    type: String(row.type),
    mediaType: String(row.media_type),
    sha256: String(row.sha256),
    rightsStatus: String(row.rights_status),
    confirmation: String(row.confirmation),
    createdAt: String(row.created_at),
    managedPath: String(row.managed_path),
    originalUrl: metadata.cloudReference?.imageUrl ?? null,
    cloudItemId: metadata.cloudReference?.itemId ?? null,
    fileUrl: `/materials/${encodeURIComponent(String(row.id))}/image`,
  };
};

const sendFile = async (
  response: ServerResponse,
  path: string,
  mediaType: string,
  downloadName?: string,
): Promise<void> => {
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile()) return fail(response, 404, "文件不在磁盘上。");
  const headers: Record<string, string> = {
    "content-type": mediaType,
    "content-length": String(info.size),
    "cache-control": "private, max-age=3600",
  };
  if (downloadName) headers["content-disposition"] = `attachment; filename="${downloadName}"`;
  response.writeHead(200, headers);
  createReadStream(path).pipe(response);
};

const readJsonBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > 2 * 1024 * 1024) throw new Error("请求体超过 2MB。");
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const provider = new ComfyUiImageProvider({
  baseUrl: () => COMFY_BASE_URL,
  checkpoint: () => COMFY_CHECKPOINT,
  // 自定义工作流传文件路径：服务这边不保存设置页状态，靠环境变量说清楚用的哪份。
  workflow: () => COMFY_WORKFLOW,
});

const ALLOWED_SIZES = new Set([
  "1024x1024",
  "1024x1536",
  "1536x1024",
  "1536x1152",
  "864x1536",
  "1536x864",
]);

const generate = async (database: Database, body: Record<string, unknown>) => {
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) throw new Error("缺少 prompt。");
  const size = String(body.size ?? "1024x1536") as ImageGenerationSize;
  if (!ALLOWED_SIZES.has(size)) throw new Error(`不支持的画幅：${size}`);

  const resolveAsset = (id: unknown): { path: string; mediaType: string } | undefined => {
    if (typeof id !== "string" || !id) return undefined;
    const row = run(database, "SELECT managed_path, media_type FROM assets WHERE id = ? LIMIT 1", [id])[0];
    if (!row) throw new Error(`资产不存在：${id}`);
    return { path: String(row.managed_path), mediaType: String(row.media_type) };
  };

  const referenceIds = Array.isArray(body.references) ? body.references.slice(0, 6) : [];
  const references = referenceIds.map(resolveAsset).filter(Boolean) as Array<{ path: string; mediaType: string }>;
  const depth = resolveAsset(body.depthAssetId);
  const normal = resolveAsset(body.normalAssetId);

  // 参考图必须先上传，占位符里填的是 ComfyUI 分配的文件名，不是本地路径。
  const referenceNames: string[] = [];
  for (const file of references) referenceNames.push(await provider.uploadImage(file));
  const depthName = depth ? await provider.uploadImage(depth) : undefined;
  const normalName = normal ? await provider.uploadImage(normal) : undefined;

  const buffer = await provider.generateImage({
    prompt,
    negative: typeof body.negative === "string" ? body.negative : undefined,
    size,
    seed: typeof body.seed === "number" ? body.seed : undefined,
    quality: body.quality === "high" ? "high" : "medium",
    referenceNames: referenceNames.length ? referenceNames : undefined,
    depthName,
    normalName,
  });

  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  const name = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}.png`;
  const file = join(OUTPUT_DIRECTORY, name);
  writeFileSync(file, buffer);
  return {
    file,
    bytes: buffer.length,
    url: `/outputs/${name}`,
    used: {
      references: referenceNames.length,
      depth: Boolean(depthName),
      normal: Boolean(normalName),
    },
  };
};

const route = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);
  const path = decodeURIComponent(url.pathname);
  const database = createDatabase();

  try {
    if (request.method === "GET" && path === "/health") {
      const total = Number(run(database, "SELECT count(*) AS total FROM assets", [])[0]?.total ?? 0);
      const cloud = Number(
        run(database, "SELECT count(*) AS total FROM assets WHERE metadata_json LIKE '%cloudReference%'", [])[0]
          ?.total ?? 0,
      );
      return json(response, 200, {
        ok: true,
        service: "vas-materials",
        version: 1,
        database: DATABASE_PATH,
        assets: total,
        cloudAssets: cloud,
        comfyUrl: COMFY_BASE_URL,
      });
    }

    if (request.method === "GET" && path === "/kinds") {
      const rows = run(
        database,
        `SELECT ${KIND_EXPRESSION} AS kind, count(*) AS total FROM assets GROUP BY kind ORDER BY total DESC`,
        [],
      );
      return json(response, 200, {
        kinds: rows.map((row) => ({ kind: String(row.kind), total: Number(row.total) })),
      });
    }

    if (request.method === "GET" && path === "/materials") {
      return json(response, 200, listMaterials(database, url.searchParams));
    }

    if (request.method === "GET" && path === "/random") {
      const kind = (url.searchParams.get("kind") ?? "").trim();
      const count = Math.min(Math.max(Number(url.searchParams.get("count") ?? 8) || 8, 1), 100);
      const clause = kind ? `WHERE ${KIND_EXPRESSION} = ?` : "";
      const rows = run(
        database,
        `SELECT id, type, name, metadata_json FROM assets ${clause} ORDER BY RANDOM() LIMIT ?`,
        kind ? [kind, count] : [count],
      );
      return json(response, 200, { items: rows.map(toItem) });
    }

    const imageMatch = path.match(/^\/materials\/([^/]+)\/image$/);
    if (request.method === "GET" && imageMatch) {
      const row = run(database, "SELECT managed_path, media_type, name FROM assets WHERE id = ? LIMIT 1", [
        imageMatch[1],
      ])[0];
      if (!row) return fail(response, 404, "没有这条素材。");
      const download = url.searchParams.get("download") === "1";
      return sendFile(
        response,
        String(row.managed_path),
        String(row.media_type),
        download ? `${String(row.name).replace(/[\\/:*?"<>|]/g, "_")}.png` : undefined,
      );
    }

    const detailMatch = path.match(/^\/materials\/([^/]+)$/);
    if (request.method === "GET" && detailMatch) {
      const item = readMaterial(database, detailMatch[1]);
      return item ? json(response, 200, item) : fail(response, 404, "没有这条素材。");
    }

    if (request.method === "GET" && path.startsWith("/outputs/")) {
      const name = path.slice("/outputs/".length);
      const target = resolve(OUTPUT_DIRECTORY, name);
      // 只要拼出来的路径还在输出目录里才发；`../` 之类的写法直接拒。
      if (!target.startsWith(OUTPUT_DIRECTORY + sep)) return fail(response, 400, "非法文件名。");
      return sendFile(response, target, "image/png");
    }

    if (request.method === "POST" && path === "/generate") {
      const body = (await readJsonBody(request)) as Record<string, unknown>;
      try {
        return json(response, 200, await generate(database, body));
      } catch (error) {
        return fail(response, 502, error instanceof Error ? error.message : "出图失败。");
      }
    }

    return fail(response, 404, "没有这个接口。");
  } finally {
    database.close();
  }
};

const server = createServer((request, response) => {
  route(request, response).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "服务内部错误。";
    if (!response.headersSent) fail(response, 500, message);
    else response.end();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`本地素材服务已启动：http://${HOST}:${PORT}`);
  console.log(`  数据库：${DATABASE_PATH}`);
  console.log(`  ComfyUI：${COMFY_BASE_URL}`);
  console.log(
    "  接口：GET /health · /kinds · /materials?kind=&q=&limit=&offset= · /materials/:id · /materials/:id/image · /random · POST /generate",
  );
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
