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
    const recipe = this.get(id);
    if (!recipe) throw new Error('配方不存在。');
    let evidenceItems = evidence.trim() ? [evidence.trim()] : [];
    if (status === 'validated') {
      const review = this.db.database.prepare(`SELECT reviews.id, reviews.project_id, reviews.creative_task_id,
        reviews.asset_id, assets.name AS asset_name, assets.confirmation, assets.rights_status
        FROM image_review_records AS reviews INNER JOIN assets ON assets.id = reviews.asset_id
        WHERE reviews.id = ? AND reviews.decision = 'approved'`).get(evidence.trim()) as {
          id: string; project_id: string; creative_task_id: string | null; asset_id: string; asset_name: string;
          confirmation: string; rights_status: string;
        } | undefined;
      if (!review) throw new Error('配方必须绑定一条已通过的图片审片记录，才能标记为已验证。');
      if (recipe.projectId && review.project_id !== recipe.projectId) throw new Error('审片证据与配方所属项目不一致。');
      if (recipe.creativeTaskId && review.creative_task_id !== recipe.creativeTaskId) throw new Error('审片证据不是该配方来源任务的结果。');
      if (review.confirmation !== 'confirmed' || !['authorized', 'original'].includes(review.rights_status))
        throw new Error('审片图片尚未完成画面确认和使用权复核。');
      evidenceItems = [`审片记录 ${review.id} · 成图 ${review.asset_name}`];
    }
    const result = this.db.database.prepare('UPDATE creative_recipes SET status = ?, evidence_json = ?, updated_at = ? WHERE id = ?')
      .run(status, JSON.stringify(evidenceItems), new Date().toISOString(), id);
    if (result.changes !== 1) throw new Error('配方不存在。');
    return this.get(id)!;
  }

  private get(id: string): CreativeRecipe | undefined {
    const row = this.db.database.prepare('SELECT * FROM creative_recipes WHERE id = ?').get(id) as Row | undefined;
    return row ? map(row) : undefined;
  }
}
