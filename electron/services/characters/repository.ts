import { randomUUID } from 'node:crypto';
import type { Asset, CharacterDetail, CharacterFact, CharacterFactEvidence, CharacterFactInput, CharacterGroup, CharacterLifecycle, CharacterProfile, CharacterSpecification, CharacterVariant, CharacterVariantKind, CreativeCard } from '../../../src/shared/types';
import { CHARACTER_GROUPS, evaluateCharacterCoverage, findCharacterSlot, type CharacterSlotGroup } from '../../../src/shared/character-slots';
import type { StudioDatabase } from '../../db/client';

type CharacterRow = { id: string; project_id: string | null; name: string; card_json: string; specification_json: string; master_asset_id: string | null; character_group: CharacterGroup; lifecycle: CharacterLifecycle; created_at: string; updated_at: string };
type FactRow = { id: string; profile_id: string; variant_id: string; slot_key: string; group_key: string; label: string; value: string; state: CharacterFact['state']; note: string; updated_at: string };
type VariantRow = { id: string; profile_id: string; kind: CharacterVariantKind; name: string; created_at: string; updated_at: string };
type EvidenceRow = { fact_id: string; asset_id: string; region_json: string | null; region_note: string };
type AssetRow = { id: string; type: Asset['type']; name: string; managed_path: string; source_path: string | null; sha256: string; media_type: string; rights_status: Asset['rightsStatus']; confirmation: Asset['confirmation']; metadata_json: string; created_at: string; updated_at: string };

const defaultSpecification = (card: CreativeCard): CharacterSpecification => ({
  identityLocks: card.identityAnchor ? [card.identityAnchor] : [], wardrobeLocks: card.bodyAndWardrobe ? [card.bodyAndWardrobe] : [],
  visualMotifs: [card.style, card.lighting].filter(Boolean), forbiddenChanges: card.avoid ? [card.avoid] : [], requiredAssetKinds: ['character', 'wardrobe', 'pose', 'scene']
});
const normalizeSpecification = (raw: string): CharacterSpecification => {
  let parsed: Partial<CharacterSpecification> = {};
  try { parsed = JSON.parse(raw || '{}') as Partial<CharacterSpecification>; } catch { /* 旧记录格式不完整，保留为未核验空设定。 */ }
  const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  return {
    identityLocks: strings(parsed?.identityLocks), wardrobeLocks: strings(parsed?.wardrobeLocks),
    visualMotifs: strings(parsed?.visualMotifs), forbiddenChanges: strings(parsed?.forbiddenChanges),
    requiredAssetKinds: strings(parsed?.requiredAssetKinds) as CharacterSpecification['requiredAssetKinds'],
  };
};

const mapProfile = (row: CharacterRow): CharacterProfile => ({
  id: row.id, projectId: row.project_id ?? undefined, name: row.name, card: JSON.parse(row.card_json) as CreativeCard,
  specification: normalizeSpecification(row.specification_json), masterAssetId: row.master_asset_id ?? undefined,
  group: row.character_group ?? 'lead', lifecycle: row.lifecycle ?? 'draft', createdAt: row.created_at, updatedAt: row.updated_at
});
const mapAsset = (row: AssetRow): Asset => ({
  id: row.id, type: row.type, name: row.name, managedPath: row.managed_path,
  sourcePath: row.source_path ?? undefined, sha256: row.sha256, mediaType: row.media_type,
  rightsStatus: row.rights_status, confirmation: row.confirmation,
  metadata: JSON.parse(row.metadata_json), createdAt: row.created_at, updatedAt: row.updated_at,
});
const mapVariant = (row: VariantRow): CharacterVariant => ({
  id: row.id, profileId: row.profile_id, kind: row.kind, name: row.name,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

export class CharacterProfileRepository {
  constructor(private readonly db: StudioDatabase) {}

  private checkMasterAsset(assetId: string, projectId?: string): void {
    const asset = this.db.database.prepare('SELECT * FROM assets WHERE id = ?').get(assetId) as AssetRow | undefined;
    if (!asset || !asset.media_type.startsWith('image/') || asset.confirmation !== 'confirmed' ||
      !['authorized', 'original'].includes(asset.rights_status))
      throw new Error('主参考必须是已确认且具备授权的图片素材。');
    if (projectId && !this.db.database.prepare('SELECT 1 FROM project_assets WHERE project_id = ? AND asset_id = ?').get(projectId, assetId))
      throw new Error('主参考尚未归属角色所属项目，请先在素材库关联项目。');
    if ((!projectId || projectId === 'asset-library') &&
      this.db.database.prepare("SELECT 1 FROM project_assets WHERE asset_id = ? AND project_id <> 'asset-library'").get(assetId))
      throw new Error('未归档角色不能绑定其他项目的图片，请先选择对应项目建立角色。');
  }

  create(input: { name: string; card: CreativeCard; projectId?: string; masterAssetId?: string; specification?: CharacterSpecification; group?: CharacterGroup; lifecycle?: CharacterLifecycle }): CharacterProfile {
    if (input.lifecycle === 'confirmed') throw new Error('新角色必须先补齐肖像与主参考，不能直接确认锁定。');
    if (input.masterAssetId) this.checkMasterAsset(input.masterAssetId, input.projectId);
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db.database.prepare('INSERT INTO character_profiles (id, project_id, name, card_json, specification_json, master_asset_id, character_group, lifecycle, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, input.projectId ?? null, input.name, JSON.stringify(input.card), JSON.stringify(input.specification ?? defaultSpecification(input.card)), input.masterAssetId ?? null, input.group ?? 'lead', input.lifecycle ?? 'draft', now, now);
    return this.get(id)!;
  }

  get(id: string): CharacterProfile | undefined {
    const row = this.db.database.prepare('SELECT * FROM character_profiles WHERE id = ?').get(id) as CharacterRow | undefined;
    return row ? mapProfile(row) : undefined;
  }

  list(projectId?: string): CharacterProfile[] {
    const query = projectId ? ['SELECT * FROM character_profiles WHERE project_id = ? ORDER BY updated_at DESC', projectId] : ['SELECT * FROM character_profiles ORDER BY updated_at DESC'];
    return (this.db.database.prepare(query[0]).all(...query.slice(1)) as CharacterRow[]).map(mapProfile);
  }

  getDetail(id: string): CharacterDetail | undefined {
    const profile = this.get(id);
    if (!profile) return undefined;
    const facts = this.db.database.prepare('SELECT * FROM character_facts WHERE profile_id = ? ORDER BY created_at ASC').all(id) as FactRow[];
    const evidence = this.db.database.prepare(`SELECT evidence.* FROM character_fact_evidence evidence
      INNER JOIN character_facts facts ON facts.id = evidence.fact_id WHERE facts.profile_id = ?`).all(id) as EvidenceRow[];
    const variants = this.db.database.prepare('SELECT * FROM character_variants WHERE profile_id = ? ORDER BY created_at ASC').all(id) as VariantRow[];
    const evidenceAssets = this.db.database.prepare(`SELECT assets.* FROM assets WHERE assets.id IN (
      SELECT members.asset_id FROM asset_collection_members members
      INNER JOIN asset_collections collections ON collections.id = members.collection_id
      WHERE collections.character_profile_id = ? AND collections.kind = 'character' AND collections.project_id IS ?
    ) ORDER BY assets.created_at DESC`).all(id, profile.projectId ?? null) as AssetRow[];
    const evidenceByFact = new Map<string, EvidenceRow[]>();
    for (const item of evidence) evidenceByFact.set(item.fact_id, [...(evidenceByFact.get(item.fact_id) ?? []), item]);
    return {
      ...profile, variants: variants.map(mapVariant), evidenceAssets: evidenceAssets.map(mapAsset),
      facts: facts.map((row) => ({
        id: row.id, profileId: row.profile_id, variantId: row.variant_id || undefined,
        slotKey: row.slot_key, group: row.group_key, label: row.label,
        value: row.value, state: row.state, note: row.note, updatedAt: row.updated_at,
        evidence: (evidenceByFact.get(row.id) ?? []).map((item): CharacterFactEvidence => ({
          assetId: item.asset_id, ...(item.region_note ? { regionNote: item.region_note } : {}),
          ...(item.region_json ? { region: JSON.parse(item.region_json) as CharacterFactEvidence['region'] } : {}),
        })),
      })),
    };
  }

  createVariant(profileId: string, kind: CharacterVariantKind, name: string): CharacterVariant {
    if (!this.get(profileId)) throw new Error('角色档案不存在。');
    if (!['look', 'expression', 'pose', 'scene'].includes(kind)) throw new Error('无效的变体类型。');
    const trimmed = name.trim();
    if (!trimmed) throw new Error('请填写变体名称。');
    const id = randomUUID(); const now = new Date().toISOString();
    this.db.database.prepare('INSERT INTO character_variants (id, profile_id, kind, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, profileId, kind, trimmed, now, now);
    return { id, profileId, kind, name: trimmed, createdAt: now, updatedAt: now };
  }

  upsertFact(profileId: string, input: CharacterFactInput): CharacterDetail {
    if (!this.get(profileId)) throw new Error('角色档案不存在。');
    if (!input || typeof input.slotKey !== 'string' || typeof input.value !== 'string' || !Array.isArray(input.evidence))
      throw new Error('角色细项格式无效。');
    const preset = findCharacterSlot(input.slotKey);
    const group = preset?.group ?? input.group;
    const label = preset?.label ?? input.label?.trim();
    if (!preset && !/^custom:[0-9a-f-]{36}$/.test(input.slotKey)) throw new Error('无效的角色细项。');
    if (!group || !CHARACTER_GROUPS.some((item) => item.key === group) || !label) throw new Error('自定义细项需要类别和名称。');
    if (!['draft', 'confirmed', 'not_applicable'].includes(input.state)) throw new Error('无效的确认状态。');
    const groupKey = group as CharacterSlotGroup;
    const requiredKind = preset?.variantKind ?? ({ wardrobe: 'look', expression: 'expression', pose: 'pose', scene: 'scene' } as Partial<Record<CharacterSlotGroup, CharacterVariantKind>>)[groupKey];
    if (input.variantId) {
      const variant = this.db.database.prepare('SELECT * FROM character_variants WHERE id = ? AND profile_id = ?').get(input.variantId, profileId) as VariantRow | undefined;
      if (!variant || variant.kind !== requiredKind) throw new Error('细项与变体类型不匹配。');
    }
    if (input.variantId && !requiredKind) throw new Error('恒定身份细项不能放进造型或动作变体。');
    const value = input.state === 'not_applicable' ? '' : input.value.trim();
    const evidence = input.state === 'not_applicable' ? [] : input.evidence;
    if (input.state === 'confirmed' && !value && !evidence.length) throw new Error('确认细项需要描述或证据素材。');
    if (input.state === 'confirmed' && preset?.visualEvidence && !evidence.length) throw new Error('角度细项必须绑定已确认素材。');
    if (evidence.some((item) => item.region && !validRegion(item.region))) throw new Error('局部区域坐标必须位于图片范围内。');
    const eligible = this.getDetail(profileId)!.evidenceAssets;
    if (new Set(evidence.map((item) => item.assetId)).size !== evidence.length) throw new Error('同一细项不能重复引用同一素材。');
    for (const item of evidence) {
      const asset = eligible.find((candidate) => candidate.id === item.assetId);
      if (!asset) throw new Error('素材尚未归档到此角色，不能作为细项证据。');
      if ((preset?.visualEvidence || item.region) && !asset.mediaType.startsWith('image/'))
        throw new Error('角度与局部区域必须引用图片素材。');
      if (input.state === 'confirmed' && (asset.confirmation !== 'confirmed' || !['authorized', 'original'].includes(asset.rightsStatus)))
        throw new Error('素材必须已确认且具备使用授权，才能支撑已确认细项。');
    }
    this.db.database.transaction(() => {
      const variantId = input.variantId ?? '';
      const now = new Date().toISOString();
      const old = this.db.database.prepare('SELECT id FROM character_facts WHERE profile_id = ? AND variant_id = ? AND slot_key = ?').get(profileId, variantId, input.slotKey) as { id: string } | undefined;
      const factId = old?.id ?? randomUUID();
      this.db.database.prepare(`INSERT INTO character_facts (id, profile_id, variant_id, slot_key, group_key, label, value, state, note, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(profile_id, variant_id, slot_key) DO UPDATE SET group_key = excluded.group_key, label = excluded.label,
          value = excluded.value, state = excluded.state, note = excluded.note, updated_at = excluded.updated_at`)
        .run(factId, profileId, variantId, input.slotKey, group, label, value, input.state, input.note?.trim() ?? '', now, now);
      this.db.database.prepare('DELETE FROM character_fact_evidence WHERE fact_id = ?').run(factId);
      const insert = this.db.database.prepare('INSERT INTO character_fact_evidence (fact_id, asset_id, region_json, region_note) VALUES (?, ?, ?, ?)');
      for (const item of evidence) insert.run(factId, item.assetId, item.region ? JSON.stringify(item.region) : null, item.regionNote?.trim() ?? '');
      this.db.database.prepare('UPDATE character_profiles SET updated_at = ? WHERE id = ?').run(now, profileId);
      this.reconcileProfile(profileId);
    })();
    return this.getDetail(profileId)!;
  }

  update(id: string, patch: Partial<Pick<CharacterProfile, 'name' | 'group' | 'lifecycle' | 'masterAssetId' | 'card' | 'specification'>>): CharacterProfile {
    const current = this.get(id);
    if (!current) throw new Error(`角色档案不存在：${id}`);
    const nextLifecycle = patch.lifecycle ?? current.lifecycle;
    const nextMasterAssetId = patch.masterAssetId === undefined ? current.masterAssetId : patch.masterAssetId;
    if (nextMasterAssetId && (patch.masterAssetId !== undefined || nextLifecycle === 'confirmed')) {
      this.checkMasterAsset(nextMasterAssetId, current.projectId);
      if (!this.getDetail(id)!.evidenceAssets.some((asset) => asset.id === nextMasterAssetId))
        throw new Error('主参考必须先归档到此角色资产包，再绑定角色。');
    }
    if (nextLifecycle === 'confirmed') {
      const detail = this.getDetail(id)!;
      if (!nextMasterAssetId)
        throw new Error('角色尚无已确认且具备授权的主参考素材，不能锁定档案。');
      const coverage = evaluateCharacterCoverage(detail, 'portrait');
      if (coverage.status !== 'ready') throw new Error(`角色肖像仍缺 ${coverage.missingRequiredKeys.length} 个必需细项，不能锁定档案。`);
    }
    const now = new Date().toISOString();
    this.db.database.prepare(`UPDATE character_profiles SET name = ?, card_json = ?, specification_json = ?, master_asset_id = ?, character_group = ?, lifecycle = ?, updated_at = ? WHERE id = ?`)
      .run(
        patch.name?.trim() || current.name,
        JSON.stringify(patch.card ?? current.card),
        JSON.stringify(patch.specification ?? current.specification),
        patch.masterAssetId === undefined ? current.masterAssetId ?? null : patch.masterAssetId ?? null,
        patch.group ?? current.group,
        nextLifecycle,
        now,
        id,
      );
    return this.get(id)!;
  }

  /** 审片、撤下证据或改变细项后，锁定状态必须与实时肖像基线一致。 */
  reconcileProfile(id: string): void {
    const profile = this.get(id);
    if (!profile || profile.lifecycle !== 'confirmed') return;
    const detail = this.getDetail(id)!;
    const master = detail.evidenceAssets.find((asset) => asset.id === profile.masterAssetId);
    if (master?.mediaType.startsWith('image/') && master.confirmation === 'confirmed' &&
      ['original', 'authorized'].includes(master.rightsStatus) && evaluateCharacterCoverage(detail, 'portrait').status === 'ready') return;
    this.db.database.prepare("UPDATE character_profiles SET lifecycle = 'draft', updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  }

  reconcileProfilesUsingAsset(assetId: string): void {
    const profiles = this.db.database.prepare(`SELECT DISTINCT profile_id AS id FROM character_facts facts
      JOIN character_fact_evidence evidence ON evidence.fact_id = facts.id WHERE evidence.asset_id = ?
      UNION SELECT id FROM character_profiles WHERE master_asset_id = ?`).all(assetId, assetId) as { id: string }[];
    for (const { id } of profiles) this.reconcileProfile(id);
  }

  /** 人物资产包导入失败时回滚尚未对外暴露的半成品档案。 */
  remove(id: string): void {
    this.db.transaction(() => {
      this.db.database.prepare('DELETE FROM character_fact_evidence WHERE fact_id IN (SELECT id FROM character_facts WHERE profile_id = ?)').run(id);
      this.db.database.prepare('DELETE FROM character_facts WHERE profile_id = ?').run(id);
      this.db.database.prepare('DELETE FROM character_variants WHERE profile_id = ?').run(id);
      this.db.database.prepare('DELETE FROM character_profiles WHERE id = ?').run(id);
    });
  }
}

const validRegion = ({ x, y, width, height }: NonNullable<CharacterFactEvidence['region']>) =>
  [x, y, width, height].every(Number.isFinite) && x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 1 && y + height <= 1;
