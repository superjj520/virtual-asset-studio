import type { PromptEntry } from '../../../src/shared/types';
import { StudioDatabase } from '../../db/client';
type Row = { id: string; source_repository: string; source_path: string; title: string; category: string; prompt_text: string; usage: string | null; license: string | null; created_at: string };
const map = (row: Row): PromptEntry => ({ id: row.id, sourceRepository: row.source_repository, sourcePath: row.source_path, title: row.title, category: row.category, promptText: row.prompt_text, usage: row.usage ?? undefined, license: row.license ?? undefined, createdAt: row.created_at });
export class PromptEntryRepository {
  constructor(private readonly db: StudioDatabase) {}
  search(query = '', category?: string, limit = 30): PromptEntry[] {
    const where: string[] = []; const values: Array<string | number> = [];
    if (query.trim()) { where.push('(title LIKE ? OR category LIKE ? OR prompt_text LIKE ?)'); values.push(`%${query.trim()}%`, `%${query.trim()}%`, `%${query.trim()}%`); }
    if (category) { where.push('category = ?'); values.push(category); }
    values.push(Math.min(Math.max(limit, 1), 50));
    const sql = `SELECT * FROM prompt_entries${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ?`;
    return (this.db.database.prepare(sql).all(...values) as Row[]).map(map);
  }
  categories(): string[] { return (this.db.database.prepare('SELECT DISTINCT category FROM prompt_entries ORDER BY category').all() as Array<{ category: string }>).map((row) => row.category); }
  count(): number { return (this.db.database.prepare('SELECT COUNT(*) AS count FROM prompt_entries').get() as { count: number }).count; }
}
