import { randomUUID } from 'node:crypto';
import type { CreativeCard, GenerationBatch, GenerationBatchStatus, GenerationVariant, GenerationVariantStatus, ProviderId, ReferenceAssetBinding } from '../../../src/shared/types';
import { normalizeReferenceBindings } from '../../../src/shared/reference-bindings';
import { StudioDatabase } from '../../db/client';

type BatchRow = { id: string; project_id: string | null; creative_task_id: string | null; name: string; provider_id: ProviderId; model_id: string | null; aspect_ratio: CreativeCard['aspectRatio']; reference_asset_ids_json: string; reference_bindings_json: string; estimated_cost_usd: number | null; status: GenerationBatchStatus; created_at: string; updated_at: string };
type VariantRow = { id: string; batch_id: string; label: string; prompt: string; status: GenerationVariantStatus; job_id: string | null; asset_id: string | null; error: string | null; actual_cost_usd: number | null; actual_width: number | null; actual_height: number | null; created_at: string; updated_at: string };
const variant = (row: VariantRow): GenerationVariant => ({ id: row.id, batchId: row.batch_id, label: row.label, prompt: row.prompt, status: row.status, jobId: row.job_id ?? undefined, assetId: row.asset_id ?? undefined, error: row.error ?? undefined, actualCostUsd: row.actual_cost_usd ?? undefined, actualWidth: row.actual_width ?? undefined, actualHeight: row.actual_height ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at });

export class GenerationBatchRepository {
  constructor(private readonly db: StudioDatabase) {}
  create(input: { name: string; projectId?: string; creativeTaskId?: string; providerId: ProviderId; modelId?: string; aspectRatio: CreativeCard['aspectRatio']; referenceAssetIds?: string[]; referenceBindings?: ReferenceAssetBinding[]; variants: Array<{ label: string; prompt: string }>; estimatedCostUsd?: number }): GenerationBatch {
    const now = new Date().toISOString(); const id = randomUUID();
    const references = normalizeReferenceBindings(input.referenceAssetIds ?? [], input.referenceBindings);
    this.db.transaction(() => {
      this.db.database.prepare('INSERT INTO generation_batches (id, project_id, creative_task_id, name, provider_id, model_id, aspect_ratio, reference_asset_ids_json, reference_bindings_json, estimated_cost_usd, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, input.projectId ?? null, input.creativeTaskId ?? null, input.name, input.providerId, input.modelId ?? null, input.aspectRatio, JSON.stringify(references.referenceAssetIds), JSON.stringify(references.referenceBindings), input.estimatedCostUsd ?? null, 'draft', now, now);
      const statement = this.db.database.prepare('INSERT INTO generation_variants (id, batch_id, label, prompt, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
      input.variants.forEach((item) => statement.run(randomUUID(), id, item.label, item.prompt, 'planned', now, now));
    });
    return this.get(id)!;
  }
  get(id: string): GenerationBatch | undefined {
    const row = this.db.database.prepare('SELECT * FROM generation_batches WHERE id = ?').get(id) as BatchRow | undefined;
    return row ? this.map(row) : undefined;
  }
  list(projectId?: string): GenerationBatch[] {
    const rows = projectId ? this.db.database.prepare('SELECT * FROM generation_batches WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) : this.db.database.prepare('SELECT * FROM generation_batches ORDER BY updated_at DESC').all();
    return (rows as BatchRow[]).map((row) => this.map(row));
  }
  recoverInterrupted(): number { return this.db.database.prepare("UPDATE generation_batches SET status = 'interrupted', updated_at = ? WHERE status = 'running'").run(new Date().toISOString()).changes; }
  claimForRun(id: string): GenerationBatch | undefined {
    const result = this.db.database.prepare("UPDATE generation_batches SET status = 'running', updated_at = ? WHERE id = ? AND status IN ('draft', 'partially_failed')")
      .run(new Date().toISOString(), id);
    return result.changes === 1 ? this.get(id) : undefined;
  }
  plannedSpendSince(isoDate: string): number {
    const row = this.db.database.prepare('SELECT COALESCE(SUM(estimated_cost_usd), 0) AS total FROM generation_batches WHERE created_at >= ?').get(isoDate) as { total: number };
    return Number(row.total ?? 0);
  }
  updateVariant(id: string, patch: { status: GenerationVariantStatus; jobId?: string; assetId?: string; error?: string; actualCostUsd?: number; actualWidth?: number; actualHeight?: number }): GenerationVariant {
    const result = this.db.database.prepare('UPDATE generation_variants SET status = ?, job_id = ?, asset_id = ?, error = ?, actual_cost_usd = COALESCE(?, actual_cost_usd), actual_width = COALESCE(?, actual_width), actual_height = COALESCE(?, actual_height), updated_at = ? WHERE id = ?').run(patch.status, patch.jobId ?? null, patch.assetId ?? null, patch.error ?? null, patch.actualCostUsd ?? null, patch.actualWidth ?? null, patch.actualHeight ?? null, new Date().toISOString(), id);
    if (result.changes !== 1) throw new Error('批量变体不存在。');
    return variant(this.db.database.prepare('SELECT * FROM generation_variants WHERE id = ?').get(id) as VariantRow);
  }
  updateStatus(id: string, status: GenerationBatchStatus): GenerationBatch { this.db.database.prepare('UPDATE generation_batches SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id); return this.get(id)!; }
  private map(row: BatchRow): GenerationBatch {
    const references = normalizeReferenceBindings(
      JSON.parse(row.reference_asset_ids_json || '[]'),
      JSON.parse(row.reference_bindings_json || '[]'),
    );
    const variants = (this.db.database.prepare('SELECT * FROM generation_variants WHERE batch_id = ? ORDER BY created_at').all(row.id) as VariantRow[]).map(variant);
    const actualCostUsd = variants.reduce((total, item) => total + (item.actualCostUsd ?? 0), 0);
    return { id: row.id, projectId: row.project_id ?? undefined, creativeTaskId: row.creative_task_id ?? undefined, name: row.name, providerId: row.provider_id, modelId: row.model_id ?? undefined, aspectRatio: row.aspect_ratio, ...references, estimatedCostUsd: row.estimated_cost_usd ?? undefined, actualCostUsd: actualCostUsd > 0 ? Number(actualCostUsd.toFixed(4)) : undefined, status: row.status, variants, createdAt: row.created_at, updatedAt: row.updated_at };
  }
}
