import { randomUUID } from 'node:crypto';
import type { CreativeCard, CreativeTask, CreativeTaskStatus } from '../../../src/shared/types';
import { StudioDatabase } from '../../db/client';

type TaskRow = { id: string; project_id: string | null; character_profile_id: string | null; name: string; objective: string; status: CreativeTaskStatus; collection_ids_json: string; card_json: string; result_asset_id: string | null; created_at: string; updated_at: string };

const mapTask = (row: TaskRow): CreativeTask => ({
  id: row.id, projectId: row.project_id ?? undefined, characterProfileId: row.character_profile_id ?? undefined,
  name: row.name, objective: row.objective, status: row.status, collectionIds: JSON.parse(row.collection_ids_json || '[]') as string[], card: JSON.parse(row.card_json) as CreativeCard,
  resultAssetId: row.result_asset_id ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at,
});

export class CreativeTaskRepository {
  constructor(private readonly db: StudioDatabase) {}

  create(input: { projectId?: string; characterProfileId?: string; name: string; objective: string; card: CreativeCard; collectionIds?: string[]; status?: CreativeTaskStatus }): CreativeTask {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.database.prepare('INSERT INTO creative_tasks (id, project_id, character_profile_id, name, objective, status, collection_ids_json, card_json, result_asset_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, input.projectId ?? null, input.characterProfileId ?? null, input.name.trim(), input.objective.trim(), input.status ?? 'ready', JSON.stringify([...new Set(input.collectionIds ?? [])]), JSON.stringify(input.card), null, now, now);
    return this.get(id)!;
  }

  get(id: string): CreativeTask | undefined {
    const row = this.db.database.prepare('SELECT * FROM creative_tasks WHERE id = ?').get(id) as TaskRow | undefined;
    return row ? mapTask(row) : undefined;
  }

  list(projectId?: string): CreativeTask[] {
    const statement = projectId
      ? this.db.database.prepare('SELECT * FROM creative_tasks WHERE project_id = ? ORDER BY updated_at DESC')
      : this.db.database.prepare('SELECT * FROM creative_tasks ORDER BY updated_at DESC');
    const rows = projectId ? statement.all(projectId) : statement.all();
    return (rows as TaskRow[]).map(mapTask);
  }

  update(id: string, patch: Partial<Pick<CreativeTask, 'name' | 'objective' | 'status' | 'collectionIds' | 'card' | 'resultAssetId'>>): CreativeTask {
    const current = this.get(id);
    if (!current) throw new Error(`创作任务不存在：${id}`);
    this.db.database.prepare('UPDATE creative_tasks SET name = ?, objective = ?, status = ?, collection_ids_json = ?, card_json = ?, result_asset_id = ?, updated_at = ? WHERE id = ?')
      .run(patch.name?.trim() || current.name, patch.objective?.trim() || current.objective, patch.status ?? current.status, JSON.stringify([...new Set(patch.collectionIds ?? current.collectionIds)]), JSON.stringify(patch.card ?? current.card), patch.resultAssetId === undefined ? current.resultAssetId ?? null : patch.resultAssetId ?? null, new Date().toISOString(), id);
    return this.get(id)!;
  }
}
