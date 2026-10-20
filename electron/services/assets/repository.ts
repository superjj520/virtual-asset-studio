import { randomUUID } from 'node:crypto';
import type { Asset, AssetType, ConfirmationStatus, RightsStatus } from '../../../src/shared/types';
import { StudioDatabase } from '../../db/client';
import { CharacterProfileRepository } from '../characters/repository';

type AssetRow = {
  id: string;
  type: AssetType;
  name: string;
  managed_path: string;
  source_path: string | null;
  sha256: string;
  media_type: string;
  rights_status: RightsStatus;
  confirmation: ConfirmationStatus;
  metadata_json: string;
  created_at: string;
  updated_at: string;
};

export type CreateAssetInput = Omit<Asset, 'id' | 'confirmation' | 'createdAt' | 'updatedAt'> & {
  confirmation?: ConfirmationStatus;
};

const mapAsset = (row: AssetRow): Asset => ({
  id: row.id,
  type: row.type,
  name: row.name,
  managedPath: row.managed_path,
  sourcePath: row.source_path ?? undefined,
  sha256: row.sha256,
  mediaType: row.media_type,
  rightsStatus: row.rights_status,
  confirmation: row.confirmation,
  metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export class AssetRepository {
  constructor(private readonly db: StudioDatabase) {}

  createOrGet(input: CreateAssetInput): { asset: Asset; created: boolean } {
    return this.db.transaction(() => {
      const existing = this.findByHash(input.sha256);
      if (existing) return { asset: existing, created: false };

      const id = randomUUID();
      const now = new Date().toISOString();
      this.db.database.prepare(`
        INSERT INTO assets (id, type, name, managed_path, source_path, sha256, media_type, rights_status, confirmation, metadata_json, created_at, updated_at)
        VALUES (@id, @type, @name, @managedPath, @sourcePath, @sha256, @mediaType, @rightsStatus, @confirmation, @metadata, @createdAt, @updatedAt)
      `).run({
        id,
        type: input.type,
        name: input.name,
        managedPath: input.managedPath,
        sourcePath: input.sourcePath ?? null,
        sha256: input.sha256,
        mediaType: input.mediaType,
        rightsStatus: input.rightsStatus,
        confirmation: input.confirmation ?? 'draft',
        metadata: JSON.stringify(input.metadata),
        createdAt: now,
        updatedAt: now
      });
      return { asset: this.findById(id)!, created: true };
    });
  }

  findById(id: string): Asset | undefined {
    const row = this.db.database.prepare('SELECT * FROM assets WHERE id = ?').get(id) as AssetRow | undefined;
    return row ? mapAsset(row) : undefined;
  }

  findByHash(sha256: string): Asset | undefined {
    const row = this.db.database.prepare('SELECT * FROM assets WHERE sha256 = ?').get(sha256) as AssetRow | undefined;
    return row ? mapAsset(row) : undefined;
  }

  list(query: { type?: AssetType; projectId?: string; q?: string } = {}): Asset[] {
    const clauses: string[] = [];
    const values: string[] = [];
    let sql = 'SELECT assets.* FROM assets';
    if (query.projectId) {
      sql += ' INNER JOIN project_assets ON project_assets.asset_id = assets.id';
      clauses.push('project_assets.project_id = ?');
      values.push(query.projectId);
    }
    if (query.type) {
      clauses.push('assets.type = ?');
      values.push(query.type);
    }
    if (query.q) {
      clauses.push('assets.name LIKE ?');
      values.push(`%${query.q}%`);
    }
    if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`;
    sql += ' ORDER BY assets.updated_at DESC';
    return (this.db.database.prepare(sql).all(...values) as AssetRow[]).map(mapAsset);
  }

  updateConfirmation(id: string, confirmation: ConfirmationStatus): Asset {
    if (!['draft', 'confirmed', 'rejected'].includes(confirmation)) throw new Error('无效的审片状态。');
    return this.db.transaction(() => {
      const result = this.db.database.prepare('UPDATE assets SET confirmation = ?, updated_at = ? WHERE id = ?')
        .run(confirmation, new Date().toISOString(), id);
      if (result.changes !== 1) throw new Error(`资产不存在：${id}`);
      if (confirmation !== 'confirmed') new CharacterProfileRepository(this.db).reconcileProfilesUsingAsset(id);
      return this.findById(id)!;
    });
  }

  updateRights(id: string, rightsStatus: RightsStatus, reason: string): Asset {
    const asset = this.findById(id);
    if (!asset) throw new Error(`资产不存在：${id}`);
    if (!['unknown', 'authorized', 'original', 'restricted'].includes(rightsStatus)) throw new Error('无效的素材权利状态。');
    if (['authorized', 'original'].includes(rightsStatus) && (!reason || !reason.trim())) throw new Error('请填写可使用的授权或原创依据。');
    if (rightsStatus === 'original' && (asset.metadata.provenance === 'ai_generated' || asset.metadata.generatedFromJobId || asset.sourcePath?.startsWith('generated://')))
      throw new Error('生成候选不能直接声明为原创；请核实参考来源后标记已授权。');
    const metadata = {
      ...asset.metadata, rightsReview: ['authorized', 'original'].includes(rightsStatus) ? 'approved' : 'pending',
      rightsReviewNote: typeof reason === 'string' ? reason.trim() : '', rightsReviewedAt: new Date().toISOString(),
    };
    return this.db.transaction(() => {
      this.db.database.prepare('UPDATE assets SET rights_status = ?, metadata_json = ?, updated_at = ? WHERE id = ?')
        .run(rightsStatus, JSON.stringify(metadata), new Date().toISOString(), id);
      if (!['authorized', 'original'].includes(rightsStatus)) new CharacterProfileRepository(this.db).reconcileProfilesUsingAsset(id);
      return this.findById(id)!;
    });
  }

  mergeMetadata(id: string, patch: Record<string, unknown>): Asset {
    const asset = this.findById(id);
    if (!asset) throw new Error(`资产不存在：${id}`);
    this.db.database.prepare('UPDATE assets SET metadata_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify({ ...asset.metadata, ...patch }), new Date().toISOString(), id);
    return this.findById(id)!;
  }

  setProjectMaster(projectId: string, id: string, enabled: boolean): Asset {
    const asset = this.findById(id);
    if (!asset) throw new Error(`资产不存在：${id}`);
    const belongs = this.db.database.prepare('SELECT 1 FROM project_assets WHERE project_id = ? AND asset_id = ?').get(projectId, id);
    if (!belongs) throw new Error('请先把素材归档到当前项目，再设为项目母版。');
    if (enabled && asset.confirmation !== 'confirmed') throw new Error('请先确认该资产，再设为项目母版。');
    if (enabled && !['authorized', 'original'].includes(asset.rightsStatus)) throw new Error('请先核实素材使用授权，再设为项目母版。');
    if (enabled)
      this.db.database.prepare('INSERT OR IGNORE INTO project_masters (project_id, asset_id, created_at) VALUES (?, ?, ?)').run(projectId, id, new Date().toISOString());
    else
      this.db.database.prepare('DELETE FROM project_masters WHERE project_id = ? AND asset_id = ?').run(projectId, id);
    return this.findById(id)!;
  }

  /** 仅供导入失败回滚使用；正常素材删除仍应通过上层工作流处理。 */
  remove(id: string): void {
    this.db.transaction(() => {
      this.db.database.prepare('DELETE FROM project_assets WHERE asset_id = ?').run(id);
      this.db.database.prepare('DELETE FROM asset_collection_members WHERE asset_id = ?').run(id);
      this.db.database.prepare('DELETE FROM assets WHERE id = ?').run(id);
    });
  }
}
