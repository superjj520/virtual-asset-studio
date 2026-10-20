import { randomUUID } from 'node:crypto';
import type { LearningPattern } from '../../../src/shared/types';
import { StudioDatabase } from '../../db/client';

type PatternRow = {
  id: string;
  name: string;
  status: LearningPattern['status'];
  scope_json: string;
  module: string;
  raw_input: string;
  evidence_json: string;
  contraindications_json: string;
  created_at: string;
  updated_at: string;
};

const mapPattern = (row: PatternRow): LearningPattern => ({
  id: row.id, name: row.name, status: row.status, scope: JSON.parse(row.scope_json), module: row.module, rawInput: row.raw_input ?? '',
  evidence: JSON.parse(row.evidence_json), contraindications: JSON.parse(row.contraindications_json), createdAt: row.created_at, updatedAt: row.updated_at
});

export type CreatePatternInput = Omit<LearningPattern, 'id' | 'createdAt' | 'updatedAt'>;

export class LearningPatternRepository {
  constructor(private readonly db: StudioDatabase) {}

  create(input: CreatePatternInput): LearningPattern {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.database.prepare(`INSERT INTO learning_patterns (id, name, status, scope_json, module, raw_input, evidence_json, contraindications_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, input.name, input.status, JSON.stringify(input.scope), input.module, input.rawInput, JSON.stringify(input.evidence), JSON.stringify(input.contraindications), now, now);
    return this.findById(id)!;
  }

  findById(id: string): LearningPattern | undefined {
    const row = this.db.database.prepare('SELECT * FROM learning_patterns WHERE id = ?').get(id) as PatternRow | undefined;
    return row ? mapPattern(row) : undefined;
  }

  list(): LearningPattern[] {
    return (this.db.database.prepare('SELECT * FROM learning_patterns ORDER BY updated_at DESC').all() as PatternRow[]).map(mapPattern);
  }

  updateStatus(id: string, status: LearningPattern['status'], note: string): LearningPattern {
    const pattern = this.findById(id);
    if (!pattern) throw new Error('学习模式不存在。');
    const evidence = [...pattern.evidence, note].slice(-12);
    this.db.database.prepare('UPDATE learning_patterns SET status = ?, evidence_json = ?, updated_at = ? WHERE id = ?')
      .run(status, JSON.stringify(evidence), new Date().toISOString(), id);
    return this.findById(id)!;
  }
}
