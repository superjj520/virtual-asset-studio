import { randomUUID } from "node:crypto";
import type {
  Asset,
  CharacterMediaLink,
  CharacterMediaRole,
  CharacterState,
  CharacterStateKind,
  CharacterStateStatus,
  CharacterVersion,
  CharacterVersionSnapshot,
  CharacterVersionStatus,
  CharacterWorkspaceSnapshot,
  CreativeAspectRatio,
  GenerationSession,
  GenerationSessionMode,
  GenerationSessionStatus,
  ProviderId,
} from "../../../src/shared/types";
import type { StudioDatabase } from "../../db/client";
import { CharacterProfileRepository } from "./repository";

type VersionRow = {
  id: string;
  profile_id: string;
  version_number: number;
  label: string;
  status: CharacterVersionStatus;
  change_summary: string;
  snapshot_json: string;
  created_at: string;
};
type StateRow = {
  id: string;
  profile_id: string;
  version_id: string | null;
  name: string;
  kind: CharacterStateKind;
  status: CharacterStateStatus;
  wardrobe: string;
  hair: string;
  expression: string;
  pose: string;
  scene: string;
  emotion: string;
  continuity_notes: string;
  created_at: string;
  updated_at: string;
};
type SessionRow = {
  id: string;
  project_id: string | null;
  character_profile_id: string | null;
  character_version_id: string | null;
  character_state_id: string | null;
  scene_profile_id?: string | null;
  scene_version_id?: string | null;
  scene_state_id?: string | null;
  creative_task_id: string | null;
  title: string;
  mode: GenerationSessionMode;
  status: GenerationSessionStatus;
  prompt: string;
  negative_prompt: string;
  provider_id: ProviderId | null;
  aspect_ratio: CreativeAspectRatio;
  reference_asset_ids_json: string;
  settings_json: string;
  created_at: string;
  updated_at: string;
};
type MediaRow = {
  id: string;
  profile_id: string;
  version_id: string | null;
  state_id: string | null;
  session_id: string | null;
  asset_id: string;
  role: CharacterMediaRole;
  parent_asset_id: string | null;
  created_at: string;
};
type AssetRow = {
  id: string;
  type: Asset["type"];
  name: string;
  managed_path: string;
  source_path: string | null;
  sha256: string;
  media_type: string;
  rights_status: Asset["rightsStatus"];
  confirmation: Asset["confirmation"];
  metadata_json: string;
  created_at: string;
  updated_at: string;
};

const parseJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const SESSION_MODES: GenerationSessionMode[] = [
  "text_to_image", "image_edit", "text_to_video", "image_to_video", "video_extend", "talking",
];
const SESSION_STATUSES: GenerationSessionStatus[] = ["draft", "running", "review", "completed", "failed", "archived"];
const SESSION_TRANSITIONS: Record<GenerationSessionStatus, GenerationSessionStatus[]> = {
  draft: ["running", "failed", "archived"],
  running: ["review", "failed", "archived"],
  review: ["running", "completed", "failed", "archived"],
  completed: ["archived"],
  failed: ["running", "archived"],
  archived: [],
};
const CREATIVE_ASPECT_RATIOS: CreativeAspectRatio[] = ["1:1", "2:3", "3:2", "4:3", "16:9", "9:16"];
const MEDIA_ROLES: CharacterMediaRole[] = ["reference", "candidate", "master", "start_frame", "output", "voice", "remix_source"];

const mapVersion = (row: VersionRow): CharacterVersion => ({
  id: row.id,
  profileId: row.profile_id,
  versionNumber: row.version_number,
  label: row.label,
  status: row.status,
  changeSummary: row.change_summary,
  snapshot: parseJson<CharacterVersionSnapshot>(row.snapshot_json, {
    name: "",
    card: {} as CharacterVersionSnapshot["card"],
    specification: {
      identityLocks: [], wardrobeLocks: [], visualMotifs: [], forbiddenChanges: [], requiredAssetKinds: [],
    },
    facts: [], variants: [],
  }),
  createdAt: row.created_at,
});

const mapState = (row: StateRow): CharacterState => ({
  id: row.id,
  profileId: row.profile_id,
  versionId: row.version_id ?? undefined,
  name: row.name,
  kind: row.kind,
  status: row.status,
  wardrobe: row.wardrobe,
  hair: row.hair,
  expression: row.expression,
  pose: row.pose,
  scene: row.scene,
  emotion: row.emotion,
  continuityNotes: row.continuity_notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapSession = (row: SessionRow): GenerationSession => ({
  id: row.id,
  projectId: row.project_id ?? undefined,
  characterProfileId: row.character_profile_id ?? undefined,
  characterVersionId: row.character_version_id ?? undefined,
  characterStateId: row.character_state_id ?? undefined,
  sceneProfileId: row.scene_profile_id ?? undefined,
  sceneVersionId: row.scene_version_id ?? undefined,
  sceneStateId: row.scene_state_id ?? undefined,
  creativeTaskId: row.creative_task_id ?? undefined,
  title: row.title,
  mode: row.mode,
  status: row.status,
  prompt: row.prompt,
  negativePrompt: row.negative_prompt,
  providerId: row.provider_id ?? undefined,
  aspectRatio: row.aspect_ratio,
  referenceAssetIds: parseJson<string[]>(row.reference_asset_ids_json, []),
  settings: parseJson<Record<string, unknown>>(row.settings_json, {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapMedia = (row: MediaRow): CharacterMediaLink => ({
  id: row.id,
  profileId: row.profile_id,
  versionId: row.version_id ?? undefined,
  stateId: row.state_id ?? undefined,
  sessionId: row.session_id ?? undefined,
  assetId: row.asset_id,
  role: row.role,
  parentAssetId: row.parent_asset_id ?? undefined,
  createdAt: row.created_at,
});

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
  metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class CharacterWorkspaceRepository {
  constructor(
    private readonly db: StudioDatabase,
    private readonly characters = new CharacterProfileRepository(db),
  ) {}

  private requireCharacter(profileId: string) {
    const detail = this.characters.getDetail(profileId);
    if (!detail) throw new Error("角色档案不存在。");
    return detail;
  }

  private requireVersion(profileId: string, versionId?: string): CharacterVersion | undefined {
    if (!versionId) return undefined;
    const version = this.getVersion(versionId);
    if (!version || version.profileId !== profileId) throw new Error("角色版本不属于当前角色。");
    return version;
  }

  private requireState(profileId: string, stateId?: string): CharacterState | undefined {
    if (!stateId) return undefined;
    const state = this.getState(stateId);
    if (!state || state.profileId !== profileId) throw new Error("角色状态不属于当前角色。");
    return state;
  }

  createVersion(profileId: string, input: {
    label?: string;
    status?: CharacterVersionStatus;
    changeSummary?: string;
  } = {}): CharacterVersion {
    const detail = this.requireCharacter(profileId);
    const status = input.status ?? "draft";
    if (status === "locked" && detail.lifecycle !== "confirmed")
      throw new Error("角色档案尚未锁定，不能创建锁定版本。");
    const snapshot: CharacterVersionSnapshot = {
      name: detail.name,
      card: detail.card,
      specification: detail.specification,
      masterAssetId: detail.masterAssetId,
      facts: detail.facts,
      variants: detail.variants,
    };
    const next = (this.db.database.prepare(
      "SELECT COALESCE(MAX(version_number), 0) + 1 AS value FROM character_versions WHERE profile_id = ?",
    ).get(profileId) as { value: number }).value;
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.transaction(() => {
      if (status === "locked")
        this.db.database.prepare(
          "UPDATE character_versions SET status = 'superseded' WHERE profile_id = ? AND status = 'locked'",
        ).run(profileId);
      this.db.database.prepare(`INSERT INTO character_versions
        (id, profile_id, version_number, label, status, change_summary, snapshot_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          id,
          profileId,
          next,
          input.label?.trim() || `版本 V${next}`,
          status,
          input.changeSummary?.trim() ?? "",
          JSON.stringify(snapshot),
          now,
        );
    });
    return this.getVersion(id)!;
  }

  getVersion(id: string): CharacterVersion | undefined {
    const row = this.db.database.prepare("SELECT * FROM character_versions WHERE id = ?")
      .get(id) as VersionRow | undefined;
    return row ? mapVersion(row) : undefined;
  }

  listVersions(profileId: string): CharacterVersion[] {
    return (this.db.database.prepare(
      "SELECT * FROM character_versions WHERE profile_id = ? ORDER BY version_number DESC",
    ).all(profileId) as VersionRow[]).map(mapVersion);
  }

  createState(profileId: string, input: {
    versionId?: string;
    name: string;
    kind: CharacterStateKind;
    status?: CharacterStateStatus;
    wardrobe?: string;
    hair?: string;
    expression?: string;
    pose?: string;
    scene?: string;
    emotion?: string;
    continuityNotes?: string;
  }): CharacterState {
    this.requireCharacter(profileId);
    this.requireVersion(profileId, input.versionId);
    const name = input.name?.trim();
    if (!name) throw new Error("请填写角色状态名称。");
    if (!["baseline", "scene", "performance"].includes(input.kind))
      throw new Error("无效的角色状态类型。");
    const status = input.status ?? "draft";
    if (!["draft", "active", "archived"].includes(status))
      throw new Error("无效的角色状态值。");
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.transaction(() => {
      if (status === "active")
        this.db.database.prepare(
          "UPDATE character_states SET status = 'draft', updated_at = ? WHERE profile_id = ? AND status = 'active'",
        ).run(now, profileId);
      this.db.database.prepare(`INSERT INTO character_states
        (id, profile_id, version_id, name, kind, status, wardrobe, hair, expression, pose, scene, emotion, continuity_notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          id, profileId, input.versionId ?? null, name, input.kind, status,
          input.wardrobe?.trim() ?? "", input.hair?.trim() ?? "", input.expression?.trim() ?? "",
          input.pose?.trim() ?? "", input.scene?.trim() ?? "", input.emotion?.trim() ?? "",
          input.continuityNotes?.trim() ?? "", now, now,
        );
    });
    return this.getState(id)!;
  }

  getState(id: string): CharacterState | undefined {
    const row = this.db.database.prepare("SELECT * FROM character_states WHERE id = ?")
      .get(id) as StateRow | undefined;
    return row ? mapState(row) : undefined;
  }

  listStates(profileId: string): CharacterState[] {
    return (this.db.database.prepare(
      "SELECT * FROM character_states WHERE profile_id = ? ORDER BY status = 'active' DESC, updated_at DESC",
    ).all(profileId) as StateRow[]).map(mapState);
  }

  updateState(id: string, patch: Partial<Pick<CharacterState,
    "name" | "kind" | "status" | "versionId" | "wardrobe" | "hair" | "expression" |
    "pose" | "scene" | "emotion" | "continuityNotes"
  >>): CharacterState {
    const current = this.getState(id);
    if (!current) throw new Error("角色状态不存在。");
    this.requireVersion(current.profileId, patch.versionId);
    const next = { ...current, ...patch };
    if (!next.name.trim()) throw new Error("请填写角色状态名称。");
    if (!["baseline", "scene", "performance"].includes(next.kind))
      throw new Error("无效的角色状态类型。");
    if (!["draft", "active", "archived"].includes(next.status))
      throw new Error("无效的角色状态值。");
    const now = new Date().toISOString();
    this.db.transaction(() => {
      if (next.status === "active")
        this.db.database.prepare(
          "UPDATE character_states SET status = 'draft', updated_at = ? WHERE profile_id = ? AND status = 'active' AND id <> ?",
        ).run(now, current.profileId, id);
      this.db.database.prepare(`UPDATE character_states SET version_id = ?, name = ?, kind = ?, status = ?,
        wardrobe = ?, hair = ?, expression = ?, pose = ?, scene = ?, emotion = ?, continuity_notes = ?, updated_at = ? WHERE id = ?`)
        .run(
          next.versionId ?? null, next.name.trim(), next.kind, next.status, next.wardrobe.trim(), next.hair.trim(),
          next.expression.trim(), next.pose.trim(), next.scene.trim(), next.emotion.trim(), next.continuityNotes.trim(), now, id,
        );
    });
    return this.getState(id)!;
  }

  createSession(input: {
    projectId?: string;
    characterProfileId?: string;
    characterVersionId?: string;
    characterStateId?: string;
    sceneProfileId?: string;
    sceneVersionId?: string;
    sceneStateId?: string;
    creativeTaskId?: string;
    title: string;
    mode: GenerationSessionMode;
    status?: GenerationSessionStatus;
    prompt?: string;
    negativePrompt?: string;
    providerId?: ProviderId;
    aspectRatio: CreativeAspectRatio;
    referenceAssetIds?: string[];
    settings?: Record<string, unknown>;
  }): GenerationSession {
    if (!SESSION_MODES.includes(input.mode)) throw new Error("无效的生成会话模式。");
    const status = input.status ?? "draft";
    if (!SESSION_STATUSES.includes(status)) throw new Error("无效的生成会话状态。");
    if (!CREATIVE_ASPECT_RATIOS.includes(input.aspectRatio)) throw new Error("无效的生成画幅。");
    if (input.referenceAssetIds !== undefined && !Array.isArray(input.referenceAssetIds))
      throw new Error("生成会话引用的素材格式不正确。");
    if (input.settings !== undefined && (!input.settings || typeof input.settings !== "object" || Array.isArray(input.settings)))
      throw new Error("生成会话设置格式不正确。");
    const profileId = input.characterProfileId;
    let characterProjectId: string | undefined;
    if ((input.characterVersionId || input.characterStateId) && !profileId)
      throw new Error("选择角色版本或状态时必须绑定角色。");
    if (profileId) {
      const character = this.requireCharacter(profileId);
      characterProjectId = character.projectId;
      if (input.projectId && character.projectId && input.projectId !== character.projectId)
        throw new Error("角色不属于当前生成项目。");
      this.requireVersion(profileId, input.characterVersionId);
      const state = this.requireState(profileId, input.characterStateId);
      if (state?.versionId && input.characterVersionId && state.versionId !== input.characterVersionId)
        throw new Error("角色状态与所选版本不一致。");
    }
    if ((input.sceneVersionId || input.sceneStateId) && !input.sceneProfileId)
      throw new Error("选择场景版本或状态时必须绑定场景。");
    if (input.sceneProfileId) {
      const scene = this.db.database.prepare("SELECT project_id FROM scene_profiles WHERE id = ?").get(input.sceneProfileId) as { project_id: string | null } | undefined;
      if (!scene)
        throw new Error("场景档案不存在。");
      const sceneProjectId = scene.project_id ?? undefined;
      if (input.projectId && sceneProjectId && input.projectId !== sceneProjectId)
        throw new Error("场景不属于当前生成项目。");
      if (characterProjectId && sceneProjectId && characterProjectId !== sceneProjectId)
        throw new Error("角色与场景不属于同一项目。");
      if (input.sceneVersionId) {
        const version = this.db.database.prepare("SELECT profile_id FROM scene_versions WHERE id = ?").get(input.sceneVersionId) as { profile_id: string } | undefined;
        if (!version || version.profile_id !== input.sceneProfileId) throw new Error("场景版本不属于当前场景。");
      }
      if (input.sceneStateId) {
        const state = this.db.database.prepare("SELECT profile_id, version_id FROM scene_states WHERE id = ?").get(input.sceneStateId) as { profile_id: string; version_id: string | null } | undefined;
        if (!state || state.profile_id !== input.sceneProfileId) throw new Error("场景状态不属于当前场景。");
        if (state.version_id && input.sceneVersionId && state.version_id !== input.sceneVersionId)
          throw new Error("场景状态与所选版本不一致。");
      }
    }
    const references = [...new Set(input.referenceAssetIds ?? [])];
    for (const assetId of references)
      if (!this.db.database.prepare("SELECT 1 FROM assets WHERE id = ?").get(assetId))
        throw new Error("生成会话引用的素材不存在。");
    const title = input.title?.trim();
    if (!title) throw new Error("请填写生成会话名称。");
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.database.prepare(`INSERT INTO generation_sessions
        (id, project_id, character_profile_id, character_version_id, character_state_id, creative_task_id, title, mode, status,
         prompt, negative_prompt, provider_id, aspect_ratio, reference_asset_ids_json, settings_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          id, input.projectId ?? null, profileId ?? null, input.characterVersionId ?? null, input.characterStateId ?? null,
          input.creativeTaskId ?? null, title, input.mode, status, input.prompt?.trim() ?? "",
          input.negativePrompt?.trim() ?? "", input.providerId ?? null, input.aspectRatio,
          JSON.stringify(references), JSON.stringify(input.settings ?? {}), now, now,
        );
      if (profileId) {
        for (const assetId of references)
          this.attachMedia(profileId, {
            versionId: input.characterVersionId,
            stateId: input.characterStateId,
            sessionId: id,
            assetId,
            role: "reference",
          });
      }
      if (input.sceneProfileId) this.db.database.prepare(`INSERT INTO generation_session_scene_contexts
        (session_id, profile_id, version_id, state_id) VALUES (?, ?, ?, ?)`)
        .run(id, input.sceneProfileId, input.sceneVersionId ?? null, input.sceneStateId ?? null);
    });
    return this.getSession(id)!;
  }

  getSession(id: string): GenerationSession | undefined {
    const row = this.db.database.prepare(`SELECT sessions.*, contexts.profile_id AS scene_profile_id,
      contexts.version_id AS scene_version_id, contexts.state_id AS scene_state_id
      FROM generation_sessions AS sessions LEFT JOIN generation_session_scene_contexts AS contexts ON contexts.session_id = sessions.id
      WHERE sessions.id = ?`)
      .get(id) as SessionRow | undefined;
    return row ? mapSession(row) : undefined;
  }

  listSessions(profileId: string): GenerationSession[] {
    return (this.db.database.prepare(`SELECT sessions.*, contexts.profile_id AS scene_profile_id,
      contexts.version_id AS scene_version_id, contexts.state_id AS scene_state_id
      FROM generation_sessions AS sessions LEFT JOIN generation_session_scene_contexts AS contexts ON contexts.session_id = sessions.id
      WHERE sessions.character_profile_id = ? ORDER BY sessions.updated_at DESC`)
      .all(profileId) as SessionRow[]).map(mapSession);
  }

  updateSessionStatus(id: string, status: GenerationSessionStatus): GenerationSession {
    if (!SESSION_STATUSES.includes(status)) throw new Error("无效的生成会话状态。");
    const current = this.getSession(id);
    if (!current) throw new Error("生成会话不存在。");
    if (current.status !== status && !SESSION_TRANSITIONS[current.status].includes(status))
      throw new Error(`生成会话不能从“${current.status}”直接切换为“${status}”。`);
    const result = this.db.database.prepare(
      "UPDATE generation_sessions SET status = ?, updated_at = ? WHERE id = ?",
    ).run(status, new Date().toISOString(), id);
    if (result.changes !== 1) throw new Error("生成会话不存在。");
    return this.getSession(id)!;
  }

  attachMedia(profileId: string, input: {
    versionId?: string;
    stateId?: string;
    sessionId?: string;
    assetId: string;
    role: CharacterMediaRole;
    parentAssetId?: string;
  }): CharacterMediaLink {
    if (!MEDIA_ROLES.includes(input.role)) throw new Error("无效的角色媒体用途。");
    this.requireCharacter(profileId);
    this.requireVersion(profileId, input.versionId);
    this.requireState(profileId, input.stateId);
    if (input.sessionId) {
      const session = this.getSession(input.sessionId);
      if (!session || session.characterProfileId !== profileId)
        throw new Error("生成会话不属于当前角色。");
    }
    if (!this.db.database.prepare("SELECT 1 FROM assets WHERE id = ?").get(input.assetId))
      throw new Error("角色媒体素材不存在。");
    if (input.parentAssetId && !this.db.database.prepare("SELECT 1 FROM assets WHERE id = ?").get(input.parentAssetId))
      throw new Error("父级素材不存在。");
    const existing = input.sessionId
      ? this.db.database.prepare(
        "SELECT * FROM character_media_links WHERE session_id = ? AND asset_id = ? AND role = ?",
      ).get(input.sessionId, input.assetId, input.role) as MediaRow | undefined
      : this.db.database.prepare(`SELECT * FROM character_media_links
        WHERE profile_id = ? AND session_id IS NULL AND asset_id = ? AND role = ?
          AND version_id IS ? AND state_id IS ?`)
        .get(profileId, input.assetId, input.role, input.versionId ?? null, input.stateId ?? null) as MediaRow | undefined;
    if (existing) return mapMedia(existing);
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.database.prepare(`INSERT INTO character_media_links
      (id, profile_id, version_id, state_id, session_id, asset_id, role, parent_asset_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        id, profileId, input.versionId ?? null, input.stateId ?? null, input.sessionId ?? null,
        input.assetId, input.role, input.parentAssetId ?? null, now,
      );
    return mapMedia(this.db.database.prepare("SELECT * FROM character_media_links WHERE id = ?").get(id) as MediaRow);
  }

  getWorkspace(profileId: string): CharacterWorkspaceSnapshot {
    const character = this.requireCharacter(profileId);
    const versions = this.listVersions(profileId);
    const states = this.listStates(profileId);
    const sessions = this.listSessions(profileId);
    const rows = this.db.database.prepare(`SELECT links.*, assets.id AS asset_join_id, assets.type, assets.name,
      assets.managed_path, assets.source_path, assets.sha256, assets.media_type, assets.rights_status,
      assets.confirmation, assets.metadata_json, assets.created_at AS asset_created_at, assets.updated_at
      FROM character_media_links AS links INNER JOIN assets ON assets.id = links.asset_id
      WHERE links.profile_id = ? ORDER BY links.created_at DESC`).all(profileId) as Array<MediaRow & AssetRow & {
        asset_join_id: string;
        asset_created_at: string;
      }>;
    const media = rows.map((row) => ({
      ...mapMedia(row),
      asset: mapAsset({ ...row, id: row.asset_join_id, created_at: row.asset_created_at }),
    }));
    return {
      character,
      versions,
      states,
      sessions,
      media,
      activeVersion: versions.find((version) => version.status === "locked") ?? versions[0],
      activeState: states.find((state) => state.status === "active"),
    };
  }
}
