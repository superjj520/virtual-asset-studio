import { expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioDatabase } from '../../db/client';
import { PromptEntryRepository } from './prompt-entry-repository';

it('按关键词和类别检索提示词案例，并限制返回量', () => {
  const database = new StudioDatabase(join(mkdtempSync(join(tmpdir(), 'studio-prompt-entry-')), 'db.sqlite'));
  const now = new Date().toISOString();
  const insert = database.database.prepare('INSERT INTO prompt_entries (id, source_repository, source_path, title, category, prompt_text, usage, license, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  insert.run('1', '示例库', 'portrait.md', '夜景人像', '人物', '电影夜景人像，真实皮肤质感', null, 'MIT', now);
  insert.run('2', '示例库', 'poster.md', '产品海报', '平面', '简洁产品海报', null, 'MIT', now);
  const repository = new PromptEntryRepository(database);
  expect(repository.count()).toBe(2);
  expect(repository.categories()).toEqual(['人物', '平面']);
  expect(repository.search('皮肤', undefined, 1)).toEqual([expect.objectContaining({ id: '1', title: '夜景人像' })]);
  expect(repository.search('', '平面')).toEqual([expect.objectContaining({ id: '2', category: '平面' })]);
  database.close();
});
