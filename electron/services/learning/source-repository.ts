import { randomUUID } from 'node:crypto';
import type { PromptSource } from '../../../src/shared/types';
import { StudioDatabase } from '../../db/client';

type Row = { id: string; url: string; repository: string; title: string; license: string | null; summary: string; source_type: PromptSource['sourceType']; status: PromptSource['status']; imported_at: string };
const map = (row: Row): PromptSource => ({ id: row.id, url: row.url, repository: row.repository, title: row.title, license: row.license ?? undefined, summary: row.summary, sourceType: row.source_type, status: row.status, importedAt: row.imported_at });
export class PromptSourceRepository {
  constructor(private readonly db: StudioDatabase) {}
  create(input: Omit<PromptSource, 'id' | 'importedAt'>): PromptSource {
    const existing = this.db.database.prepare('SELECT * FROM prompt_sources WHERE url = ?').get(input.url) as Row | undefined;
    if (existing) return map(existing);
    const result: PromptSource = { ...input, id: randomUUID(), importedAt: new Date().toISOString() };
    this.db.database.prepare('INSERT INTO prompt_sources (id, url, repository, title, license, summary, source_type, status, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(result.id, result.url, result.repository, result.title, result.license ?? null, result.summary, result.sourceType, result.status, result.importedAt);
    return result;
  }
  list(): PromptSource[] { return (this.db.database.prepare('SELECT * FROM prompt_sources ORDER BY imported_at DESC').all() as Row[]).map(map); }
}
