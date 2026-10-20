import { randomUUID } from 'node:crypto';
import type {
  Asset,
  AssetCollection,
  AssetCollectionDetail,
  AssetCollectionKind,
  AssetCollectionMember,
  AssetCollectionReadiness,
  AssetCollectionStatus,
} from '../../../src/shared/types';
import { StudioDatabase } from '../../db/client';
import { CharacterProfileRepository } from '../characters/repository';
import { evaluateCharacterCoverage } from '../../../src/shared/character-slots';
import type { CharacterDetail } from '../../../src/shared/types';
import { getAssetCollectionBlueprint } from '../../../src/shared/asset-collection-blueprints';

type CollectionRow = {
  id: string; project_id: string | null; character_profile_id: string | null; parent_id: string | null;
  kind: AssetCollectionKind; name: string; description: string; status: AssetCollectionStatus;
  created_at: string; updated_at: string; asset_count: number;
};
type MemberRow = {
  id: string; type: Asset['type']; name: string; managed_path: string; source_path: string | null;
  sha256: string; media_type: string; rights_status: Asset['rightsStatus']; confirmation: Asset['confirmation'];
  metadata_json: string; created_at: string; updated_at: string; membership_role: string; module_key: string; notes: string; sort_order: number; project_master: number;
};

const mapCollection = (row: CollectionRow): AssetCollection => ({
  id: row.id, projectId: row.project_id ?? undefined, characterProfileId: row.character_profile_id ?? undefined,
  parentId: row.parent_id ?? undefined, kind: row.kind, name: row.name, description: row.description,
  status: row.status, assetCount: Number(row.asset_count ?? 0), createdAt: row.created_at, updatedAt: row.updated_at,
});
const mapMember = (row: MemberRow): AssetCollectionMember => ({
  id: row.id, type: row.type, name: row.name, managedPath: row.managed_path, sourcePath: row.source_path ?? undefined,
  sha256: row.sha256, mediaType: row.media_type, rightsStatus: row.rights_status, confirmation: row.confirmation,
  metadata: JSON.parse(row.metadata_json), createdAt: row.created_at, updatedAt: row.updated_at, membershipRole: row.membership_role,
  projectMaster: Boolean(row.project_master),
  moduleKey: row.module_key || undefined, notes: row.notes || undefined, sortOrder: Number(row.sort_order ?? 0),
});
const evaluateReadiness = (
  collection: AssetCollection,
  assets: AssetCollectionMember[],
  character?: CharacterDetail,
): AssetCollectionReadiness => {
  const blueprint = getAssetCollectionBlueprint(collection.kind);
  const usable = (asset: AssetCollectionMember) => asset.confirmation === 'confirmed' && ['original', 'authorized'].includes(asset.rightsStatus);
  const modules = blueprint.modules.map((module) => {
    const moduleAssets = assets.filter((asset) => asset.moduleKey === module.key && module.acceptedAssetTypes.includes(asset.type));
    return { key: module.key, label: module.label, required: module.required, assetCount: moduleAssets.length, confirmedAssetCount: moduleAssets.filter(usable).length };
  });
  const requiredModules = modules.filter((module) => module.required);
  const missingRequiredKeys = requiredModules.filter((module) => module.confirmedAssetCount === 0).map((module) => module.key);
  const moduleCoverage = {
    requiredCount: requiredModules.length,
    confirmedRequiredCount: requiredModules.filter((module) => module.confirmedAssetCount > 0).length,
    missingRequiredKeys,
    modules,
  };
  const characterCoverage = collection.kind === 'character' && character
    ? evaluateCharacterCoverage(character, 'portrait')
    : undefined;
  const confirmedAssetCount = assets.filter(
    (asset) => asset.confirmation === "confirmed" && ["original", "authorized"].includes(asset.rightsStatus),
  ).length;
  const masterReferenceCount = assets.filter(
    (asset) =>
      asset.confirmation === "confirmed" && ["original", "authorized"].includes(asset.rightsStatus) &&
      asset.mediaType.startsWith("image/") &&
      (asset.membershipRole === "主参考" || Boolean(asset.projectMaster)) &&
      (!character || asset.id === character.masterAssetId),
  ).length;
  if (!assets.length)
    return {
      status: "empty",
      confirmedAssetCount,
      masterReferenceCount,
      nextAction: "先导入并归档至少一张可作为此资产包基线的素材。",
      moduleCoverage,
    };
  if (!confirmedAssetCount)
    return {
      status: "incomplete",
      confirmedAssetCount,
      masterReferenceCount,
      nextAction: "先在资产库完成候选审片和使用权确认，确认一张可复用素材。",
      moduleCoverage,
    };
  if (missingRequiredKeys.length)
    return {
      status: "incomplete",
      confirmedAssetCount,
      masterReferenceCount,
      characterCoverage,
      nextAction: characterCoverage && characterCoverage.missingRequiredKeys.length
        ? `角色档案仍缺 ${characterCoverage.missingRequiredKeys.length} 个肖像必需细项；资产包还缺 ${missingRequiredKeys.length} 个模块，请补齐后再投入生产。`
        : `还缺少 ${missingRequiredKeys.length} 个资产包必需模块，请为素材绑定正确的模块后再投入生产。`,
      moduleCoverage,
    };
  if (collection.kind === "character" && !collection.characterProfileId)
    return {
      status: "incomplete", confirmedAssetCount, masterReferenceCount,
      nextAction: "先把角色资产包关联到一个角色档案，才能核对人物细项。",
      moduleCoverage,
    };
  if (collection.kind === "character" && !masterReferenceCount)
    return {
      status: "incomplete",
      confirmedAssetCount,
      masterReferenceCount,
      moduleCoverage,
      nextAction: "为角色资产包指定一张主参考，再开始跨场景生产。",
    };
  if (collection.kind === "character" && character && characterCoverage) {
    return {
      status: characterCoverage.status === "ready" ? "ready" : "incomplete",
      confirmedAssetCount, masterReferenceCount, moduleCoverage, characterCoverage,
      nextAction: characterCoverage.status === "ready"
        ? "角色肖像基线已具备；全身与连续镜头仍需按用途单独核对。"
        : `角色档案仍缺 ${characterCoverage.missingRequiredKeys.length} 个肖像必需细项，请在角色档案中补齐并确认。`,
    };
  }
  return {
    status: "ready",
    confirmedAssetCount,
    masterReferenceCount,
    moduleCoverage,
    nextAction: "资产包已具备生产基线，可在创作任务中继承使用。",
  };
};

export class AssetCollectionRepository {
  constructor(private readonly db: StudioDatabase) {}

  create(input: { projectId?: string; characterProfileId?: string; parentId?: string; kind: AssetCollectionKind; name: string; description?: string; status?: AssetCollectionStatus }): AssetCollection {
    const character = input.characterProfileId ? new CharacterProfileRepository(this.db).get(input.characterProfileId) : undefined;
    if (input.characterProfileId && !character) throw new Error('角色档案不存在。');
    if (input.characterProfileId && input.kind !== 'character') throw new Error('角色档案只能关联角色资产包。');
    const parent = input.parentId ? this.get(input.parentId) : undefined;
    if (input.parentId && !parent) throw new Error('父资产包不存在。');
    const projectId = input.projectId ?? character?.projectId ?? parent?.projectId;
    if (character && character.projectId !== projectId) throw new Error('角色与资产包所属项目不一致。');
    if (parent && parent.projectId !== projectId) throw new Error('父资产包与子资产包所属项目不一致。');
    const id = randomUUID(); const now = new Date().toISOString();
    this.db.database.prepare(`INSERT INTO asset_collections (id, project_id, character_profile_id, parent_id, kind, name, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, projectId ?? null, input.characterProfileId ?? null, input.parentId ?? null, input.kind, input.name, input.description ?? '', input.status ?? 'draft', now, now);
    return this.get(id)!;
  }

  get(id: string): AssetCollection | undefined {
    const row = this.db.database.prepare(this.baseQuery('collections.id = ?')).get(id) as CollectionRow | undefined;
    return row ? mapCollection(row) : undefined;
  }

  list(projectId?: string): AssetCollection[] {
    const query = projectId
      ? [this.baseQuery('collections.project_id = ?') + ' ORDER BY collections.updated_at DESC', projectId]
      : [this.baseQuery() + ' ORDER BY collections.updated_at DESC'];
    return (this.db.database.prepare(query[0]).all(...query.slice(1)) as CollectionRow[]).map(mapCollection);
  }

  getDetail(id: string): AssetCollectionDetail | undefined {
    const collection = this.get(id); if (!collection) return undefined;
    const assets = this.db.database.prepare(`SELECT assets.*, members.membership_role, members.module_key, members.notes, members.sort_order,
      CASE WHEN collections.project_id IS NOT NULL AND EXISTS (SELECT 1 FROM project_masters WHERE project_id = collections.project_id AND asset_id = assets.id) THEN 1 ELSE 0 END AS project_master
      FROM asset_collection_members members
      INNER JOIN assets ON assets.id = members.asset_id
      INNER JOIN asset_collections collections ON collections.id = members.collection_id
      WHERE members.collection_id = ? ORDER BY members.sort_order ASC, members.created_at DESC`).all(id) as MemberRow[];
    const members = assets.map(mapMember);
    const character = collection.characterProfileId
      ? new CharacterProfileRepository(this.db).getDetail(collection.characterProfileId)
      : undefined;
    return { ...collection, assets: members, readiness: evaluateReadiness(collection, members, character) };
  }

  attachAsset(collectionId: string, assetId: string, membershipRole = '素材', moduleKey = '', notes = '', allowSharedAcrossProjects = false): AssetCollectionDetail {
    const collection = this.get(collectionId);
    if (!collection) throw new Error(`资产包不存在：${collectionId}`);
    const asset = this.db.database.prepare('SELECT type FROM assets WHERE id = ?').get(assetId) as { type: Asset['type'] } | undefined;
    if (!asset) throw new Error('素材不存在。');
    if (collection.projectId) {
      const otherProject = this.db.database.prepare("SELECT project_id FROM project_assets WHERE asset_id = ? AND project_id <> ? AND project_id <> 'asset-library' LIMIT 1").get(assetId, collection.projectId) as { project_id: string } | undefined;
      if (otherProject && !allowSharedAcrossProjects) throw new Error('素材与资产包所属项目不一致，请先复制或重新归档素材。');
    }
    if (moduleKey) {
      const module = getAssetCollectionBlueprint(collection.kind).modules.find((item) => item.key === moduleKey);
      if (!module) throw new Error('资产包模块不存在。');
      if (!module.acceptedAssetTypes.includes(asset.type)) throw new Error(`该素材类型不能归入「${module.label}」模块。`);
    }
    this.db.database.transaction(() => {
      this.db.database.prepare(`INSERT INTO asset_collection_members (collection_id, asset_id, membership_role, module_key, notes, sort_order, created_at) VALUES (?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort_order) + 1 FROM asset_collection_members WHERE collection_id = ?), 0), ?)
        ON CONFLICT(collection_id, asset_id) DO UPDATE SET membership_role = excluded.membership_role, module_key = excluded.module_key, notes = excluded.notes`)
        .run(collectionId, assetId, membershipRole, moduleKey, notes.trim(), collectionId, new Date().toISOString());
      if (collection.projectId) this.db.database.prepare('INSERT OR IGNORE INTO project_assets (project_id, asset_id, created_at) VALUES (?, ?, ?)')
        .run(collection.projectId, assetId, new Date().toISOString());
    })();
    this.touch(collectionId); return this.getDetail(collectionId)!;
  }

  /** 人物资产包导入失败时回滚刚建立的空资产包。 */
  remove(id: string): void {
    this.db.transaction(() => {
      this.db.database.prepare('DELETE FROM asset_collection_members WHERE collection_id = ?').run(id);
      this.db.database.prepare('DELETE FROM asset_collections WHERE id = ?').run(id);
    });
  }

  detachAsset(collectionId: string, assetId: string): AssetCollectionDetail {
    const collection = this.get(collectionId);
    if (!collection) throw new Error(`资产包不存在：${collectionId}`);
    return this.db.transaction(() => {
      this.db.database.prepare('DELETE FROM asset_collection_members WHERE collection_id = ? AND asset_id = ?').run(collectionId, assetId);
      if (collection.characterProfileId) new CharacterProfileRepository(this.db).reconcileProfile(collection.characterProfileId);
      this.touch(collectionId);
      return this.getDetail(collectionId)!;
    });
  }

  update(id: string, patch: Partial<Pick<AssetCollection, 'name' | 'description' | 'status' | 'parentId'>>): AssetCollection {
    const current = this.get(id); if (!current) throw new Error(`资产包不存在：${id}`);
    if (patch.status === 'active') {
      const detail = this.getDetail(id);
      if (!detail || detail.readiness.status !== 'ready') throw new Error('资产包尚未就绪，不能切换为使用中。');
    }
    if (patch.parentId) {
      const parent = this.get(patch.parentId);
      if (!parent || parent.projectId !== current.projectId) throw new Error('父资产包与子资产包所属项目不一致。');
      const seen = new Set([id]); let cursor: AssetCollection | undefined = parent;
      while (cursor) {
        if (seen.has(cursor.id)) throw new Error('资产包不能循环嵌套。');
        seen.add(cursor.id); cursor = cursor.parentId ? this.get(cursor.parentId) : undefined;
      }
    }
    this.db.database.prepare('UPDATE asset_collections SET name = ?, description = ?, status = ?, parent_id = ?, updated_at = ? WHERE id = ?')
      .run(patch.name?.trim() || current.name, patch.description ?? current.description, patch.status ?? current.status, patch.parentId === undefined ? current.parentId ?? null : patch.parentId ?? null, new Date().toISOString(), id);
    return this.get(id)!;
  }

  private touch(id: string) { this.db.database.prepare('UPDATE asset_collections SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id); }
  private baseQuery(where?: string) {
    return `SELECT collections.*, COUNT(members.asset_id) AS asset_count FROM asset_collections collections LEFT JOIN asset_collection_members members ON members.collection_id = collections.id${where ? ` WHERE ${where}` : ''} GROUP BY collections.id`;
  }
}
