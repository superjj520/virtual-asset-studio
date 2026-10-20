import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

const sourceRoot = '/Users/superjj/Library/Application Support/virtual-asset-studio/prompt-sources';
const databasePath = '/Users/superjj/Library/Application Support/virtual-asset-studio/virtual-asset-studio.sqlite';
const database = new Database(databasePath);
const insert = database.prepare('INSERT OR IGNORE INTO prompt_entries (id, source_repository, source_path, title, category, prompt_text, usage, license, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
const blocked = /\b(minor|underage|schoolgirl|child sexual)\b/i;
const now = new Date().toISOString();
let inserted = 0;
const byRepository = {};

const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const add = (repository, sourcePath, title, category, prompt, license) => {
  if (typeof prompt !== 'string' || prompt.trim().length < 80 || blocked.test(prompt)) return;
  const result = insert.run(crypto.randomUUID(), repository, sourcePath, title || path.basename(sourcePath), category || '未分类', prompt.trim(), '外部参考；需真实出图与审片验证后才可复用。', license, now);
  if (result.changes) { inserted += 1; byRepository[repository] = (byRepository[repository] || 0) + 1; }
};
const visitJson = (value, repository, sourcePath, category, license, index = 0) => {
  if (Array.isArray(value)) { value.forEach((item, itemIndex) => visitJson(item, repository, sourcePath, category, license, itemIndex)); return; }
  if (!value || typeof value !== 'object') return;
  const item = value;
  const prompt = [item.prompt, item.content, item.traits, item.module].filter((part) => typeof part === 'string').join('\n');
  add(repository, sourcePath, String(item.title || item.generation_name || item.name || item.id || index), String(item.category || item.group || category), prompt, license);
  Object.values(item).forEach((child, childIndex) => { if (child && typeof child === 'object') visitJson(child, repository, sourcePath, category, license, childIndex); });
};

for (const directory of fs.readdirSync(sourceRoot)) {
  const root = path.join(sourceRoot, directory);
  if (!fs.statSync(root).isDirectory()) continue;
  const repository = directory.replace('__', '/');
  const license = repository === 'yang0/handraw-style' ? null : 'MIT';
  for (const file of walk(root)) {
    if (file.includes(`${path.sep}.git${path.sep}`) || !/\.(json|md|txt)$/i.test(file)) continue;
    const sourcePath = path.relative(root, file);
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (file.endsWith('.json')) {
      try { visitJson(JSON.parse(raw), repository, sourcePath, path.basename(path.dirname(file)), license); } catch { /* 忽略非数据 JSON */ }
    } else {
      [...raw.matchAll(/```(?:[^\n]*)\n([\s\S]{80,}?)```/g)].forEach((match, index) => add(repository, sourcePath, `${path.basename(file)} #${index + 1}`, path.basename(path.dirname(file)), match[1], license));
    }
  }
}
console.log(JSON.stringify({ inserted, byRepository, total: database.prepare('SELECT COUNT(*) AS count FROM prompt_entries').get().count }));
database.close();
