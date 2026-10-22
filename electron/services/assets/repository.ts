import { randomUUID } from 'node:crypto';
import type { Asset, AssetType, AssetUsageKind, AssetUsageReference, ConfirmationStatus, RightsStatus } from '../../../src/shared/types';
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

type UsageRow = {
  kind: AssetUsageKind;
  scope_id: string;
  scope_name: string;
  context: string;
  project_id: string | null;
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

  usage(id: string): AssetUsageReference[] {
    if (!this.findById(id)) throw new Error(`资产不存在：${id}`);
    const rows = this.db.database.prepare(`
      SELECT 'project' AS kind, projects.id AS scope_id, projects.name AS scope_name,
        '项目素材' AS context, projects.id AS project_id, project_assets.created_at AS updated_at
      FROM project_assets INNER JOIN projects ON projects.id = project_assets.project_id
      WHERE project_assets.asset_id = ?
      UNION ALL
      SELECT 'project_master', projects.id, projects.name, '项目母版', projects.id, project_masters.created_at
      FROM project_masters INNER JOIN projects ON projects.id = project_masters.project_id
      WHERE project_masters.asset_id = ?
      UNION ALL
      SELECT 'collection', collections.id, collections.name,
        CASE WHEN members.module_key = '' THEN members.membership_role ELSE members.module_key || ' · ' || members.membership_role END,
        collections.project_id, members.created_at
      FROM asset_collection_members AS members
      INNER JOIN asset_collections AS collections ON collections.id = members.collection_id
      WHERE members.asset_id = ?
      UNION ALL
      SELECT 'character', profiles.id, profiles.name, '角色主参考', profiles.project_id, profiles.updated_at
      FROM character_profiles AS profiles WHERE profiles.master_asset_id = ?
      UNION ALL
      SELECT 'character', profiles.id, profiles.name, '角色媒体 · ' || links.role, profiles.project_id, links.created_at
      FROM character_media_links AS links INNER JOIN character_profiles AS profiles ON profiles.id = links.profile_id
      WHERE links.asset_id = ?
      UNION ALL
      SELECT 'character', profiles.id, profiles.name, '细项证据 · ' || facts.label, profiles.project_id, facts.updated_at
      FROM character_fact_evidence AS evidence
      INNER JOIN character_facts AS facts ON facts.id = evidence.fact_id
      INNER JOIN character_profiles AS profiles ON profiles.id = facts.profile_id
      WHERE evidence.asset_id = ?
      UNION ALL
      SELECT 'scene', profiles.id, profiles.name, '场景主参考', profiles.project_id, profiles.updated_at
      FROM scene_profiles AS profiles WHERE profiles.master_asset_id = ?
      UNION ALL
      SELECT 'scene', profiles.id, profiles.name, '场景媒体 · ' || links.role, profiles.project_id, links.created_at
      FROM scene_media_links AS links INNER JOIN scene_profiles AS profiles ON profiles.id = links.profile_id
      WHERE links.asset_id = ?
      UNION ALL
      SELECT 'job', jobs.id, CASE jobs.kind WHEN 'image_generation' THEN '图片生成任务' ELSE '生成任务' END,
        job_assets.role || ' · ' || jobs.status, jobs.project_id, jobs.updated_at
      FROM job_assets INNER JOIN jobs ON jobs.id = job_assets.job_id
      WHERE job_assets.asset_id = ?
      UNION ALL
      SELECT 'recipe', recipes.id, recipes.name, '配方来源素材', recipes.project_id, recipes.updated_at
      FROM creative_recipes AS recipes, json_each(recipes.source_asset_ids_json)
      WHERE json_each.value = ?
      UNION ALL
      SELECT 'review', reviews.id, projects.name, '图片审片 · ' || reviews.decision,
        reviews.project_id, reviews.created_at
      FROM image_review_records AS reviews INNER JOIN projects ON projects.id = reviews.project_id
      WHERE reviews.asset_id = ?
      ORDER BY updated_at DESC
    `).all(id, id, id, id, id, id, id, id, id, id, id) as UsageRow[];
    return rows.map((row) => ({
      kind: row.kind,
      scopeId: row.scope_id,
      scopeName: row.scope_name,
      context: row.context,
      projectId: row.project_id ?? undefined,
      updatedAt: row.updated_at,
    }));
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
