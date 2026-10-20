import { randomUUID } from 'node:crypto';
import type { CreativeCard, CreativeRecipe, ProviderId, RecipeStatus } from '../../../src/shared/types';
import { StudioDatabase } from '../../db/client';

type Row = {
  id: string; project_id: string | null; creative_task_id: string | null; provider_id: ProviderId | null; name: string; purpose: string; card_json: string;
  prompt: string; negative: string; source_asset_ids_json: string; status: RecipeStatus;
  evidence_json: string; created_at: string; updated_at: string;
};

const map = (row: Row): CreativeRecipe => ({
  id: row.id, projectId: row.project_id ?? undefined, creativeTaskId: row.creative_task_id ?? undefined, providerId: row.provider_id ?? undefined, name: row.name, purpose: row.purpose,
  card: JSON.parse(row.card_json) as CreativeCard, prompt: row.prompt, negative: row.negative,
  sourceAssetIds: JSON.parse(row.source_asset_ids_json) as string[], status: row.status,
  evidence: JSON.parse(row.evidence_json) as string[], createdAt: row.created_at, updatedAt: row.updated_at,
});

export class CreativeRecipeRepository {
  constructor(private readonly db: StudioDatabase) {}

  create(input: Pick<CreativeRecipe, 'name' | 'projectId' | 'creativeTaskId' | 'providerId' | 'purpose' | 'card' | 'prompt' | 'negative' | 'sourceAssetIds'>): CreativeRecipe {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.database.prepare('INSERT INTO creative_recipes (id, project_id, creative_task_id, provider_id, name, purpose, card_json, prompt, negative, source_asset_ids_json, status, evidence_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, input.projectId ?? null, input.creativeTaskId ?? null, input.providerId ?? null, input.name, input.purpose, JSON.stringify(input.card), input.prompt, input.negative, JSON.stringify([...new Set(input.sourceAssetIds)]), 'draft', '[]', now, now);
    return this.get(id)!;
  }

  list(projectId?: string): CreativeRecipe[] {
    const query = projectId
      ? ['SELECT * FROM creative_recipes WHERE project_id = ? ORDER BY updated_at DESC', projectId]
      : ['SELECT * FROM creative_recipes ORDER BY updated_at DESC'];
    return (this.db.database.prepare(query[0]).all(...(projectId ? [query[1]] : [])) as Row[]).map(map);
  }

  updateStatus(id: string, status: Exclude<RecipeStatus, 'draft'>, evidence: string): CreativeRecipe {
    const result = this.db.database.prepare('UPDATE creative_recipes SET status = ?, evidence_json = ?, updated_at = ? WHERE id = ?')
      .run(status, JSON.stringify(evidence.trim() ? [evidence.trim()] : []), new Date().toISOString(), id);
    if (result.changes !== 1) throw new Error('配方不存在。');
    return this.get(id)!;
  }

  private get(id: string): CreativeRecipe | undefined {
    const row = this.db.database.prepare('SELECT * FROM creative_recipes WHERE id = ?').get(id) as Row | undefined;
    return row ? map(row) : undefined;
  }
}
