import { randomUUID } from 'node:crypto';
import type { ShotContract, ShotPlan } from '../../../src/shared/types';
import { StudioDatabase } from '../../db/client';

type ShotRow = { id: string; project_id: string; name: string; shot_json: string; compiled_prompt: string; reference_asset_id: string | null; created_at: string; updated_at: string };

const mapShot = (row: ShotRow): ShotPlan => ({
  id: row.id, projectId: row.project_id, name: row.name, shot: JSON.parse(row.shot_json) as ShotContract,
  compiledPrompt: row.compiled_prompt, referenceAssetId: row.reference_asset_id ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at
});

export class ShotPlanRepository {
  constructor(private readonly db: StudioDatabase) {}

  create(input: { projectId: string; name: string; shot: ShotContract; compiledPrompt: string; referenceAssetId?: string }): ShotPlan {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db.database.prepare(`INSERT INTO shot_plans (id, project_id, name, shot_json, compiled_prompt, reference_asset_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.projectId, input.name, JSON.stringify(input.shot), input.compiledPrompt, input.referenceAssetId ?? null, now, now);
    return this.get(id)!;
  }

  get(id: string): ShotPlan | undefined {
    const row = this.db.database.prepare('SELECT * FROM shot_plans WHERE id = ?').get(id) as ShotRow | undefined;
    return row ? mapShot(row) : undefined;
  }

  list(projectId: string): ShotPlan[] {
    return (this.db.database.prepare('SELECT * FROM shot_plans WHERE project_id = ? ORDER BY created_at ASC').all(projectId) as ShotRow[]).map(mapShot);
  }
}
