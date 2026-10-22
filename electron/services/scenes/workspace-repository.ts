import { randomUUID } from "node:crypto";
import type {
  Asset,
  GenerationSession,
  SceneKind,
  SceneLifecycle,
  SceneMediaLink,
  SceneMediaRole,
  SceneProfile,
  SceneState,
  SceneStateStatus,
  SceneVersion,
  SceneVersionSnapshot,
  SceneVersionStatus,
  SceneWorkspaceSnapshot,
} from "../../../src/shared/types";
import type { StudioDatabase } from "../../db/client";

type ProfileRow = {
  id: string; project_id: string | null; name: string; kind: SceneKind; lifecycle: SceneLifecycle;
  anchor: string; layout: string; materials: string; color_system: string; required_elements: string;
  forbidden_changes: string; master_asset_id: string | null; created_at: string; updated_at: string;
};
type VersionRow = {
  id: string; profile_id: string; version_number: number; label: string; status: SceneVersionStatus;
  change_summary: string; snapshot_json: string; created_at: string;
};
type StateRow = {
  id: string; profile_id: string; version_id: string | null; name: string; status: SceneStateStatus;
  time_of_day: string; weather: string; season: string; lighting: string; atmosphere: string;
  set_dressing: string; continuity_notes: string; created_at: string; updated_at: string;
};
type MediaRow = {
  id: string; profile_id: string; version_id: string | null; state_id: string | null; session_id: string | null;
  asset_id: string; role: SceneMediaRole; parent_asset_id: string | null; created_at: string;
};
type AssetRow = {
  id: string; type: Asset["type"]; name: string; managed_path: string; source_path: string | null;
  sha256: string; media_type: string; rights_status: Asset["rightsStatus"];
  confirmation: Asset["confirmation"]; metadata_json: string; created_at: string; updated_at: string;
};
type SessionRow = {
  id: string; project_id: string | null; character_profile_id: string | null; character_version_id: string | null;
  character_state_id: string | null; creative_task_id: string | null; title: string; mode: GenerationSession["mode"];
  status: GenerationSession["status"]; prompt: string; negative_prompt: string; provider_id: GenerationSession["providerId"] | null;
  aspect_ratio: GenerationSession["aspectRatio"]; reference_asset_ids_json: string; settings_json: string;
  created_at: string; updated_at: string; scene_profile_id: string; scene_version_id: string | null; scene_state_id: string | null;
};

const KINDS: SceneKind[] = ["interior", "exterior", "environment", "fantasy", "studio"];
const LIFECYCLES: SceneLifecycle[] = ["draft", "confirmed", "archived"];
const VERSION_STATUSES: SceneVersionStatus[] = ["draft", "locked", "superseded"];
const STATE_STATUSES: SceneStateStatus[] = ["draft", "active", "archived"];
const MEDIA_ROLES: SceneMediaRole[] = [
  "layout_reference", "lighting_reference", "material_reference", "candidate", "master", "output", "remix_source",
];

const parseJson = <T>(value: string, fallback: T): T => {
  try { return JSON.parse(value) as T; } catch { return fallback; }
};
const mapProfile = (row: ProfileRow): SceneProfile => ({
  id: row.id, projectId: row.project_id ?? undefined, name: row.name, kind: row.kind, lifecycle: row.lifecycle,
  anchor: row.anchor, layout: row.layout, materials: row.materials, colorSystem: row.color_system,
  requiredElements: row.required_elements, forbiddenChanges: row.forbidden_changes,
  masterAssetId: row.master_asset_id ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at,
});
const mapVersion = (row: VersionRow): SceneVersion => ({
  id: row.id, profileId: row.profile_id, versionNumber: row.version_number, label: row.label, status: row.status,
  changeSummary: row.change_summary, snapshot: parseJson<SceneVersionSnapshot>(row.snapshot_json, {
    name: "", kind: "environment", lifecycle: "draft", anchor: "", layout: "", materials: "", colorSystem: "",
    requiredElements: "", forbiddenChanges: "",
  }), createdAt: row.created_at,
});
const mapState = (row: StateRow): SceneState => ({
  id: row.id, profileId: row.profile_id, versionId: row.version_id ?? undefined, name: row.name, status: row.status,
  timeOfDay: row.time_of_day, weather: row.weather, season: row.season, lighting: row.lighting,
  atmosphere: row.atmosphere, setDressing: row.set_dressing, continuityNotes: row.continuity_notes,
  createdAt: row.created_at, updatedAt: row.updated_at,
});
const mapMedia = (row: MediaRow): SceneMediaLink => ({
  id: row.id, profileId: row.profile_id, versionId: row.version_id ?? undefined, stateId: row.state_id ?? undefined,
  sessionId: row.session_id ?? undefined, assetId: row.asset_id, role: row.role,
  parentAssetId: row.parent_asset_id ?? undefined, createdAt: row.created_at,
});
const mapAsset = (row: AssetRow): Asset => ({
  id: row.id, type: row.type, name: row.name, managedPath: row.managed_path, sourcePath: row.source_path ?? undefined,
  sha256: row.sha256, mediaType: row.media_type, rightsStatus: row.rights_status, confirmation: row.confirmation,
  metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}), createdAt: row.created_at, updatedAt: row.updated_at,
});
const mapSession = (row: SessionRow): GenerationSession => ({
  id: row.id, projectId: row.project_id ?? undefined, characterProfileId: row.character_profile_id ?? undefined,
  characterVersionId: row.character_version_id ?? undefined, characterStateId: row.character_state_id ?? undefined,
  sceneProfileId: row.scene_profile_id, sceneVersionId: row.scene_version_id ?? undefined,
  sceneStateId: row.scene_state_id ?? undefined, creativeTaskId: row.creative_task_id ?? undefined,
  title: row.title, mode: row.mode, status: row.status, prompt: row.prompt, negativePrompt: row.negative_prompt,
  providerId: row.provider_id ?? undefined, aspectRatio: row.aspect_ratio,
  referenceAssetIds: parseJson<string[]>(row.reference_asset_ids_json, []),
  settings: parseJson<Record<string, unknown>>(row.settings_json, {}), createdAt: row.created_at, updatedAt: row.updated_at,
});

export class SceneWorkspaceRepository {
  constructor(private readonly db: StudioDatabase) {}

  private requireProfile(profileId: string): SceneProfile {
    const profile = this.getProfile(profileId);
    if (!profile) throw new Error("场景档案不存在。");
    return profile;
  }

  private requireVersion(profileId: string, versionId?: string): SceneVersion | undefined {
    if (!versionId) return undefined;
    const version = this.getVersion(versionId);
    if (!version || version.profileId !== profileId) throw new Error("场景版本不属于当前场景。");
    return version;
  }

  private requireState(profileId: string, stateId?: string): SceneState | undefined {
    if (!stateId) return undefined;
    const state = this.getState(stateId);
    if (!state || state.profileId !== profileId) throw new Error("场景状态不属于当前场景。");
    return state;
  }

  private requireReferenceAsset(profile: Pick<SceneProfile, "projectId">, assetId: string): void {
    const asset = this.db.database.prepare(
      "SELECT media_type, confirmation, rights_status FROM assets WHERE id = ?",
    ).get(assetId) as { media_type: string; confirmation: Asset["confirmation"]; rights_status: Asset["rightsStatus"] } | undefined;
    if (!asset) throw new Error("场景媒体素材不存在。");
    if (!asset.media_type.startsWith("image/") || asset.confirmation !== "confirmed" || !["authorized", "original"].includes(asset.rights_status))
      throw new Error("场景参考必须是已确认且具备使用权的图片。");
    if (profile.projectId && !this.db.database.prepare(
      "SELECT 1 FROM project_assets WHERE project_id = ? AND asset_id = ?",
    ).get(profile.projectId, assetId)) throw new Error("场景参考素材未归档到当前项目。");
  }

  createProfile(input: {
    projectId?: string; name: string; kind: SceneKind; lifecycle?: SceneLifecycle; anchor: string; layout?: string;
    materials?: string; colorSystem?: string; requiredElements?: string; forbiddenChanges?: string; masterAssetId?: string;
  }): SceneProfile {
    const name = input.name?.trim();
    const anchor = input.anchor?.trim();
    if (!name || !anchor) throw new Error("请填写场景名称与空间锚点。");
    if (!KINDS.includes(input.kind)) throw new Error("无效的场景类型。");
    const lifecycle = input.lifecycle ?? "draft";
    if (!LIFECYCLES.includes(lifecycle)) throw new Error("无效的场景状态。");
    if (input.projectId && !this.db.database.prepare("SELECT 1 FROM projects WHERE id = ?").get(input.projectId))
      throw new Error("场景所属项目不存在。");
    if (input.masterAssetId) this.requireReferenceAsset({ projectId: input.projectId }, input.masterAssetId);
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.database.prepare(`INSERT INTO scene_profiles
      (id, project_id, name, kind, lifecycle, anchor, layout, materials, color_system, required_elements, forbidden_changes, master_asset_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, input.projectId ?? null, name, input.kind, lifecycle, anchor, input.layout?.trim() ?? "",
        input.materials?.trim() ?? "", input.colorSystem?.trim() ?? "", input.requiredElements?.trim() ?? "",
        input.forbiddenChanges?.trim() ?? "", input.masterAssetId ?? null, now, now);
    return this.getProfile(id)!;
  }

  getProfile(id: string): SceneProfile | undefined {
    const row = this.db.database.prepare("SELECT * FROM scene_profiles WHERE id = ?").get(id) as ProfileRow | undefined;
    return row ? mapProfile(row) : undefined;
  }

  listProfiles(projectId?: string): SceneProfile[] {
    const rows = projectId
      ? this.db.database.prepare("SELECT * FROM scene_profiles WHERE project_id = ? ORDER BY updated_at DESC").all(projectId)
      : this.db.database.prepare("SELECT * FROM scene_profiles ORDER BY updated_at DESC").all();
    return (rows as ProfileRow[]).map(mapProfile);
  }

  updateProfile(id: string, patch: Partial<Omit<SceneProfile, "id" | "createdAt" | "updatedAt">>): SceneProfile {
    const current = this.requireProfile(id);
    const next = { ...current, ...patch };
    if (!next.name.trim() || !next.anchor.trim()) throw new Error("请填写场景名称与空间锚点。");
    if (!KINDS.includes(next.kind) || !LIFECYCLES.includes(next.lifecycle)) throw new Error("无效的场景档案设置。");
    if (next.projectId && !this.db.database.prepare("SELECT 1 FROM projects WHERE id = ?").get(next.projectId))
      throw new Error("场景所属项目不存在。");
    if (next.masterAssetId) this.requireReferenceAsset(next, next.masterAssetId);
    const result = this.db.database.prepare(`UPDATE scene_profiles SET project_id = ?, name = ?, kind = ?, lifecycle = ?,
      anchor = ?, layout = ?, materials = ?, color_system = ?, required_elements = ?, forbidden_changes = ?, master_asset_id = ?, updated_at = ? WHERE id = ?`)
      .run(next.projectId ?? null, next.name.trim(), next.kind, next.lifecycle, next.anchor.trim(), next.layout.trim(),
        next.materials.trim(), next.colorSystem.trim(), next.requiredElements.trim(), next.forbiddenChanges.trim(),
        next.masterAssetId ?? null, new Date().toISOString(), id);
    if (result.changes !== 1) throw new Error("场景档案不存在。");
    return this.getProfile(id)!;
  }

  createVersion(profileId: string, input: { label?: string; status?: SceneVersionStatus; changeSummary?: string } = {}): SceneVersion {
    const profile = this.requireProfile(profileId);
    const status = input.status ?? "draft";
    if (!VERSION_STATUSES.includes(status) || status === "superseded") throw new Error("无效的新场景版本状态。");
    if (status === "locked" && profile.lifecycle !== "confirmed") throw new Error("场景档案尚未确认，不能锁定生产版本。");
    const row = this.db.database.prepare("SELECT COALESCE(MAX(version_number), 0) + 1 AS value FROM scene_versions WHERE profile_id = ?")
      .get(profileId) as { value: number };
    const id = randomUUID();
    const now = new Date().toISOString();
    const snapshot: SceneVersionSnapshot = {
      projectId: profile.projectId, name: profile.name, kind: profile.kind, lifecycle: profile.lifecycle,
      anchor: profile.anchor, layout: profile.layout, materials: profile.materials, colorSystem: profile.colorSystem,
      requiredElements: profile.requiredElements, forbiddenChanges: profile.forbiddenChanges, masterAssetId: profile.masterAssetId,
    };
    this.db.transaction(() => {
      if (status === "locked") this.db.database.prepare(
        "UPDATE scene_versions SET status = 'superseded' WHERE profile_id = ? AND status = 'locked'",
      ).run(profileId);
      this.db.database.prepare(`INSERT INTO scene_versions
        (id, profile_id, version_number, label, status, change_summary, snapshot_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, profileId, row.value, input.label?.trim() || `场景版本 V${row.value}`, status,
          input.changeSummary?.trim() ?? "", JSON.stringify(snapshot), now);
    });
    return this.getVersion(id)!;
  }

  getVersion(id: string): SceneVersion | undefined {
    const row = this.db.database.prepare("SELECT * FROM scene_versions WHERE id = ?").get(id) as VersionRow | undefined;
    return row ? mapVersion(row) : undefined;
  }

  listVersions(profileId: string): SceneVersion[] {
    return (this.db.database.prepare("SELECT * FROM scene_versions WHERE profile_id = ? ORDER BY version_number DESC")
      .all(profileId) as VersionRow[]).map(mapVersion);
  }

  createState(profileId: string, input: {
    versionId?: string; name: string; status?: SceneStateStatus; timeOfDay?: string; weather?: string; season?: string;
    lighting?: string; atmosphere?: string; setDressing?: string; continuityNotes?: string;
  }): SceneState {
    this.requireProfile(profileId);
    this.requireVersion(profileId, input.versionId);
    const name = input.name?.trim();
    if (!name) throw new Error("请填写场景状态名称。");
    const status = input.status ?? "draft";
    if (!STATE_STATUSES.includes(status)) throw new Error("无效的场景状态值。");
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.transaction(() => {
      if (status === "active") this.db.database.prepare(
        "UPDATE scene_states SET status = 'draft', updated_at = ? WHERE profile_id = ? AND status = 'active'",
      ).run(now, profileId);
      this.db.database.prepare(`INSERT INTO scene_states
        (id, profile_id, version_id, name, status, time_of_day, weather, season, lighting, atmosphere, set_dressing, continuity_notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, profileId, input.versionId ?? null, name, status, input.timeOfDay?.trim() ?? "",
          input.weather?.trim() ?? "", input.season?.trim() ?? "", input.lighting?.trim() ?? "",
          input.atmosphere?.trim() ?? "", input.setDressing?.trim() ?? "", input.continuityNotes?.trim() ?? "", now, now);
    });
    return this.getState(id)!;
  }

  getState(id: string): SceneState | undefined {
    const row = this.db.database.prepare("SELECT * FROM scene_states WHERE id = ?").get(id) as StateRow | undefined;
    return row ? mapState(row) : undefined;
  }

  listStates(profileId: string): SceneState[] {
    return (this.db.database.prepare("SELECT * FROM scene_states WHERE profile_id = ? ORDER BY status = 'active' DESC, updated_at DESC")
      .all(profileId) as StateRow[]).map(mapState);
  }

  updateState(id: string, patch: Partial<Pick<SceneState,
    "versionId" | "name" | "status" | "timeOfDay" | "weather" | "season" | "lighting" | "atmosphere" | "setDressing" | "continuityNotes"
  >>): SceneState {
    const current = this.getState(id);
    if (!current) throw new Error("场景状态不存在。");
    const next = { ...current, ...patch };
    this.requireVersion(current.profileId, next.versionId);
    if (!next.name.trim() || !STATE_STATUSES.includes(next.status)) throw new Error("无效的场景状态设置。");
    const now = new Date().toISOString();
    this.db.transaction(() => {
      if (next.status === "active") this.db.database.prepare(
        "UPDATE scene_states SET status = 'draft', updated_at = ? WHERE profile_id = ? AND status = 'active' AND id <> ?",
      ).run(now, current.profileId, id);
      this.db.database.prepare(`UPDATE scene_states SET version_id = ?, name = ?, status = ?, time_of_day = ?, weather = ?,
        season = ?, lighting = ?, atmosphere = ?, set_dressing = ?, continuity_notes = ?, updated_at = ? WHERE id = ?`)
        .run(next.versionId ?? null, next.name.trim(), next.status, next.timeOfDay.trim(), next.weather.trim(), next.season.trim(),
          next.lighting.trim(), next.atmosphere.trim(), next.setDressing.trim(), next.continuityNotes.trim(), now, id);
    });
    return this.getState(id)!;
  }

  attachMedia(profileId: string, input: {
    versionId?: string; stateId?: string; sessionId?: string; assetId: string; role: SceneMediaRole; parentAssetId?: string;
  }): SceneMediaLink {
    if (!MEDIA_ROLES.includes(input.role)) throw new Error("无效的场景媒体用途。");
    const profile = this.requireProfile(profileId);
    this.requireVersion(profileId, input.versionId);
    this.requireState(profileId, input.stateId);
    if (input.sessionId) {
      const context = this.db.database.prepare("SELECT profile_id FROM generation_session_scene_contexts WHERE session_id = ?")
        .get(input.sessionId) as { profile_id: string } | undefined;
      if (!context || context.profile_id !== profileId) throw new Error("生成会话不属于当前场景。");
    }
    if (["layout_reference", "lighting_reference", "material_reference", "master", "remix_source"].includes(input.role))
      this.requireReferenceAsset(profile, input.assetId);
    else if (!this.db.database.prepare("SELECT 1 FROM assets WHERE id = ?").get(input.assetId))
      throw new Error("场景媒体素材不存在。");
    if (input.parentAssetId && !this.db.database.prepare("SELECT 1 FROM assets WHERE id = ?").get(input.parentAssetId))
      throw new Error("父级素材不存在。");
    const existing = this.db.database.prepare(`SELECT * FROM scene_media_links WHERE profile_id = ? AND asset_id = ? AND role = ?
      AND version_id IS ? AND state_id IS ? AND session_id IS ?`).get(
      profileId, input.assetId, input.role, input.versionId ?? null, input.stateId ?? null, input.sessionId ?? null,
    ) as MediaRow | undefined;
    if (existing) {
      if (input.role === "master") this.db.database.prepare(
        "UPDATE scene_profiles SET master_asset_id = ?, updated_at = ? WHERE id = ?",
      ).run(input.assetId, new Date().toISOString(), profileId);
      return mapMedia(existing);
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.database.prepare(`INSERT INTO scene_media_links
        (id, profile_id, version_id, state_id, session_id, asset_id, role, parent_asset_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, profileId, input.versionId ?? null, input.stateId ?? null, input.sessionId ?? null,
          input.assetId, input.role, input.parentAssetId ?? null, now);
      if (input.role === "master") this.db.database.prepare(
        "UPDATE scene_profiles SET master_asset_id = ?, updated_at = ? WHERE id = ?",
      ).run(input.assetId, now, profileId);
    });
    return mapMedia(this.db.database.prepare("SELECT * FROM scene_media_links WHERE id = ?").get(id) as MediaRow);
  }

  getWorkspace(profileId: string): SceneWorkspaceSnapshot {
    const scene = this.requireProfile(profileId);
    const versions = this.listVersions(profileId);
    const states = this.listStates(profileId);
    const sessions = (this.db.database.prepare(`SELECT sessions.*, contexts.profile_id AS scene_profile_id,
      contexts.version_id AS scene_version_id, contexts.state_id AS scene_state_id
      FROM generation_sessions AS sessions INNER JOIN generation_session_scene_contexts AS contexts ON contexts.session_id = sessions.id
      WHERE contexts.profile_id = ? ORDER BY sessions.updated_at DESC`).all(profileId) as SessionRow[]).map(mapSession);
    const rows = this.db.database.prepare(`SELECT links.*, assets.id AS asset_join_id, assets.type, assets.name,
      assets.managed_path, assets.source_path, assets.sha256, assets.media_type, assets.rights_status,
      assets.confirmation, assets.metadata_json, assets.created_at AS asset_created_at, assets.updated_at
      FROM scene_media_links AS links INNER JOIN assets ON assets.id = links.asset_id
      WHERE links.profile_id = ? ORDER BY links.created_at DESC`).all(profileId) as Array<MediaRow & AssetRow & {
        asset_join_id: string; asset_created_at: string;
      }>;
    return {
      scene, versions, states, sessions,
      media: rows.map((row) => ({ ...mapMedia(row), asset: mapAsset({ ...row, id: row.asset_join_id, created_at: row.asset_created_at }) })),
      activeVersion: versions.find((version) => version.status === "locked") ?? versions[0],
      activeState: states.find((state) => state.status === "active"),
    };
  }
}
