import { randomUUID } from 'node:crypto';
import type { Asset, ShotContract, ShotPlan } from '../../../src/shared/types';
import { StudioDatabase } from '../../db/client';

type ShotRow = {
  id: string; project_id: string; name: string; shot_json: string; compiled_prompt: string;
  reference_asset_id: string | null; created_at: string; updated_at: string;
  creative_task_id: string | null; character_profile_id: string | null; character_version_id: string | null;
  character_state_id: string | null; scene_profile_id: string | null; scene_version_id: string | null;
  scene_state_id: string | null; purpose: ShotPlan["purpose"] | null; status: ShotPlan["status"] | null;
  continuity_notes: string | null;
};

const mapShot = (row: ShotRow): ShotPlan => ({
  id: row.id, projectId: row.project_id, name: row.name, shot: JSON.parse(row.shot_json) as ShotContract,
  compiledPrompt: row.compiled_prompt, referenceAssetId: row.reference_asset_id ?? undefined,
  purpose: row.purpose ?? "video", status: row.status ?? "draft", creativeTaskId: row.creative_task_id ?? undefined,
  characterProfileId: row.character_profile_id ?? undefined, characterVersionId: row.character_version_id ?? undefined,
  characterStateId: row.character_state_id ?? undefined, sceneProfileId: row.scene_profile_id ?? undefined,
  sceneVersionId: row.scene_version_id ?? undefined, sceneStateId: row.scene_state_id ?? undefined,
  continuityNotes: row.continuity_notes ?? "", createdAt: row.created_at, updatedAt: row.updated_at
});

export type CreateShotPlanInput = {
  projectId: string; name: string; shot: ShotContract; compiledPrompt: string; referenceAssetId?: string;
  purpose?: ShotPlan["purpose"]; status?: ShotPlan["status"]; creativeTaskId?: string;
  characterProfileId?: string; characterVersionId?: string; characterStateId?: string;
  sceneProfileId?: string; sceneVersionId?: string; sceneStateId?: string; continuityNotes?: string;
};

export class ShotPlanRepository {
  constructor(private readonly db: StudioDatabase) {}

  private requireProjectAsset(projectId: string, assetId: string): void {
    const asset = this.db.database.prepare("SELECT media_type, confirmation, rights_status FROM assets WHERE id = ?")
      .get(assetId) as { media_type: string; confirmation: Asset["confirmation"]; rights_status: Asset["rightsStatus"] } | undefined;
    if (!asset || !asset.media_type.startsWith("image/") || asset.confirmation !== "confirmed" || !["authorized", "original"].includes(asset.rights_status))
      throw new Error("镜头参考必须是已确认且具备使用权的图片。");
    if (!this.db.database.prepare("SELECT 1 FROM project_assets WHERE project_id = ? AND asset_id = ?").get(projectId, assetId))
      throw new Error("镜头参考素材未归档到当前项目。");
  }

  private requireContext(input: CreateShotPlanInput): void {
    if (!this.db.database.prepare("SELECT 1 FROM projects WHERE id = ?").get(input.projectId)) throw new Error("镜头所属项目不存在。");
    if ((input.characterVersionId || input.characterStateId) && !input.characterProfileId) throw new Error("角色版本或状态必须绑定角色。");
    if (input.characterProfileId) {
      const profile = this.db.database.prepare("SELECT project_id FROM character_profiles WHERE id = ?").get(input.characterProfileId) as { project_id: string | null } | undefined;
      if (!profile || (profile.project_id && profile.project_id !== input.projectId)) throw new Error("角色不属于当前镜头项目。");
      if (input.characterVersionId && !this.db.database.prepare("SELECT 1 FROM character_versions WHERE id = ? AND profile_id = ?").get(input.characterVersionId, input.characterProfileId))
        throw new Error("角色版本不属于当前角色。");
      if (input.characterStateId) {
        const state = this.db.database.prepare("SELECT version_id FROM character_states WHERE id = ? AND profile_id = ?").get(input.characterStateId, input.characterProfileId) as { version_id: string | null } | undefined;
        if (!state) throw new Error("角色状态不属于当前角色。");
        if (state.version_id && input.characterVersionId && state.version_id !== input.characterVersionId) throw new Error("角色状态与所选版本不一致。");
      }
    }
    if ((input.sceneVersionId || input.sceneStateId) && !input.sceneProfileId) throw new Error("场景版本或状态必须绑定场景。");
    if (input.sceneProfileId) {
      const profile = this.db.database.prepare("SELECT project_id FROM scene_profiles WHERE id = ?").get(input.sceneProfileId) as { project_id: string | null } | undefined;
      if (!profile || (profile.project_id && profile.project_id !== input.projectId)) throw new Error("场景不属于当前镜头项目。");
      if (input.sceneVersionId && !this.db.database.prepare("SELECT 1 FROM scene_versions WHERE id = ? AND profile_id = ?").get(input.sceneVersionId, input.sceneProfileId))
        throw new Error("场景版本不属于当前场景。");
      if (input.sceneStateId) {
        const state = this.db.database.prepare("SELECT version_id FROM scene_states WHERE id = ? AND profile_id = ?").get(input.sceneStateId, input.sceneProfileId) as { version_id: string | null } | undefined;
        if (!state) throw new Error("场景状态不属于当前场景。");
        if (state.version_id && input.sceneVersionId && state.version_id !== input.sceneVersionId) throw new Error("场景状态与所选版本不一致。");
      }
    }
    if (input.creativeTaskId && !this.db.database.prepare("SELECT 1 FROM creative_tasks WHERE id = ? AND project_id = ?").get(input.creativeTaskId, input.projectId))
      throw new Error("创作任务不属于当前镜头项目。");
    const referenceIds = [...new Set([input.referenceAssetId, ...input.shot.referenceAssetIds].filter((value): value is string => Boolean(value)))];
    referenceIds.forEach((assetId) => this.requireProjectAsset(input.projectId, assetId));
  }

  create(input: CreateShotPlanInput): ShotPlan {
    this.requireContext(input);
    if (!input.name.trim()) throw new Error("请为镜头填写名称。");
    if (!input.compiledPrompt.trim()) throw new Error("请先生成镜头合同。");
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db.transaction(() => {
      this.db.database.prepare(`INSERT INTO shot_plans (id, project_id, name, shot_json, compiled_prompt, reference_asset_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.projectId, input.name.trim(), JSON.stringify(input.shot), input.compiledPrompt, input.referenceAssetId ?? null, now, now);
      this.db.database.prepare(`INSERT INTO shot_plan_contexts
        (shot_plan_id, creative_task_id, character_profile_id, character_version_id, character_state_id, scene_profile_id,
         scene_version_id, scene_state_id, purpose, status, continuity_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.creativeTaskId ?? null, input.characterProfileId ?? null, input.characterVersionId ?? null,
          input.characterStateId ?? null, input.sceneProfileId ?? null, input.sceneVersionId ?? null, input.sceneStateId ?? null,
          input.purpose ?? "image", input.status ?? "ready", input.continuityNotes?.trim() ?? "");
    });
    return this.get(id)!;
  }

  get(id: string): ShotPlan | undefined {
    const row = this.db.database.prepare(`SELECT plans.*, contexts.creative_task_id, contexts.character_profile_id,
      contexts.character_version_id, contexts.character_state_id, contexts.scene_profile_id, contexts.scene_version_id,
      contexts.scene_state_id, contexts.purpose, contexts.status, contexts.continuity_notes
      FROM shot_plans AS plans LEFT JOIN shot_plan_contexts AS contexts ON contexts.shot_plan_id = plans.id WHERE plans.id = ?`).get(id) as ShotRow | undefined;
    return row ? mapShot(row) : undefined;
  }

  list(projectId: string): ShotPlan[] {
    return (this.db.database.prepare(`SELECT plans.*, contexts.creative_task_id, contexts.character_profile_id,
      contexts.character_version_id, contexts.character_state_id, contexts.scene_profile_id, contexts.scene_version_id,
      contexts.scene_state_id, contexts.purpose, contexts.status, contexts.continuity_notes
      FROM shot_plans AS plans LEFT JOIN shot_plan_contexts AS contexts ON contexts.shot_plan_id = plans.id
      WHERE plans.project_id = ? ORDER BY plans.created_at ASC`).all(projectId) as ShotRow[]).map(mapShot);
  }
}
