import { expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StudioDatabase } from "../../db/client";
import { VisualParadigmRepository } from "./repository";

it("初始化范式库、识别冲突并生成可带入创作卡的模块", () => {
  const database = new StudioDatabase(
    join(mkdtempSync(join(tmpdir(), "studio-paradigm-")), "db.sqlite"),
  );
  const repository = new VisualParadigmRepository(database);
  const all = repository.list();
  expect(all.length).toBeGreaterThanOrEqual(8);
  const editorial = all.find((item) => item.name === "编辑式人像")!;
  const cover = all.find((item) => item.name === "极简时尚封面")!;
  const composition = repository.compose([editorial.id, cover.id]);
  expect(composition.canApply).toBe(true);
  expect(composition.promptModule).toContain("编辑式人像摄影");
  const setting = all.find((item) => item.name === "角色设定板")!;
  expect(repository.compose([cover.id, setting.id]).canApply).toBe(false);
  database.close();
});
