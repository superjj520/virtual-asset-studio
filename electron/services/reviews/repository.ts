import { randomUUID } from "node:crypto";
import type {
  Asset,
  ImageReviewDecision,
  ImageReviewProvenance,
  ImageReviewRecord,
  ImageReviewScores,
  MasterPromotion,
  MasterPromotionTarget,
  ReviewWorkspaceSnapshot,
} from "../../../src/shared/types";
import type { StudioDatabase } from "../../db/client";
import { AssetRepository } from "../assets/repository";
import { AssetCollectionRepository } from "../collections/repository";
import { CharacterProfileRepository } from "../characters/repository";
import { CharacterWorkspaceRepository } from "../characters/workspace-repository";
import { SceneWorkspaceRepository } from "../scenes/workspace-repository";

type ReviewRow = {
  id: string;
  project_id: string;
  asset_id: string;
  creative_task_id: string | null;
  generation_session_id: string | null;
  decision: ImageReviewDecision;
  scores_json: string;
  note: string;
  next_action: string;
  provenance_json: string;
  created_at: string;
};

type PromotionRow = {
  id: string;
  review_id: string;
  project_id: string;
  asset_id: string;
  target_type: MasterPromotionTarget;
  target_id: string;
  version_id: string | null;
  state_id: string | null;
  created_at: string;
};

type SessionRow = {
  id: string;
  project_id: string | null;
  creative_task_id: string | null;
  character_profile_id: string | null;
  character_version_id: string | null;
  character_state_id: string | null;
  scene_profile_id: string | null;
  scene_version_id: string | null;
  scene_state_id: string | null;
  prompt: string;
  negative_prompt: string;
  provider_id: string | null;
  aspect_ratio: ImageReviewProvenance["aspectRatio"];
  reference_asset_ids_json: string;
};

const mapReview = (row: ReviewRow): ImageReviewRecord => ({
  id: row.id,
  projectId: row.project_id,
  assetId: row.asset_id,
  creativeTaskId: row.creative_task_id ?? undefined,
  generationSessionId: row.generation_session_id ?? undefined,
  decision: row.decision,
  scores: JSON.parse(row.scores_json) as ImageReviewScores,
  note: row.note,
  nextAction: row.next_action,
  provenance: JSON.parse(row.provenance_json) as ImageReviewProvenance,
  createdAt: row.created_at,
});

const mapPromotion = (row: PromotionRow): MasterPromotion => ({
  id: row.id,
  reviewId: row.review_id,
  projectId: row.project_id,
  assetId: row.asset_id,
  targetType: row.target_type,
  targetId: row.target_id,
  versionId: row.version_id ?? undefined,
  stateId: row.state_id ?? undefined,
  createdAt: row.created_at,
});

const parseStringArray = (raw: string): string[] => {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

export type CreateImageReviewInput = {
  projectId: string;
  assetId: string;
  decision: ImageReviewDecision;
  scores: ImageReviewScores;
  note?: string;
  nextAction?: string;
  creativeTaskId?: string;
  generationSessionId?: string;
};

export class ImageReviewRepository {
  private readonly assets: AssetRepository;
  private readonly characters: CharacterProfileRepository;
  private readonly characterWorkspace: CharacterWorkspaceRepository;
  private readonly sceneWorkspace: SceneWorkspaceRepository;
  private readonly collections: AssetCollectionRepository;

  constructor(private readonly db: StudioDatabase) {
    this.assets = new AssetRepository(db);
    this.characters = new CharacterProfileRepository(db);
    this.characterWorkspace = new CharacterWorkspaceRepository(db, this.characters);
    this.sceneWorkspace = new SceneWorkspaceRepository(db);
    this.collections = new AssetCollectionRepository(db);
  }

  create(input: CreateImageReviewInput): ImageReviewRecord {
    const asset = this.requireCandidate(input.projectId, input.assetId);
    if (!(["pending", "approved", "rejected"] as ImageReviewDecision[]).includes(input.decision))
      throw new Error("无效的审片结论。");
    const values = [input.scores.identity, input.scores.scene, input.scores.realism, input.scores.composition, input.scores.technical];
    if (values.length !== 5 || values.some((value) => !Number.isInteger(value) || value < 1 || value > 5))
      throw new Error("每项图片评分须为 1 到 5 分。");
    if (input.decision === "rejected" && !input.nextAction?.trim())
      throw new Error("淘汰候选时请写明下一轮调整方向。");

    const session = this.resolveSession(asset.id, input.generationSessionId);
    if (session?.project_id && session.project_id !== input.projectId)
      throw new Error("生成会话与审片项目不一致。");
    const creativeTaskId = input.creativeTaskId ?? session?.creative_task_id ?? this.resolveTask(asset.id, input.projectId);
    if (creativeTaskId && !this.db.database.prepare("SELECT 1 FROM creative_tasks WHERE id = ? AND project_id = ?").get(creativeTaskId, input.projectId))
      throw new Error("创作任务与审片项目不一致。");
    const provenance = this.provenanceFor(asset, session);
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.database.prepare(`INSERT INTO image_review_records
        (id, project_id, asset_id, creative_task_id, generation_session_id, decision, scores_json, note, next_action, provenance_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          id,
          input.projectId,
          input.assetId,
          creativeTaskId ?? null,
          session?.id ?? null,
          input.decision,
          JSON.stringify(input.scores),
          input.note?.trim() ?? "",
          input.nextAction?.trim() ?? "",
          JSON.stringify(provenance),
          now,
        );
      if (input.decision !== "pending") this.assets.updateConfirmation(input.assetId, input.decision === "approved" ? "confirmed" : "rejected");
      if (creativeTaskId) this.db.database.prepare("UPDATE creative_tasks SET status = ?, result_asset_id = ?, updated_at = ? WHERE id = ?")
        .run(input.decision === "approved" ? "review" : "producing", input.decision === "approved" ? input.assetId : null, now, creativeTaskId);
    });
    return this.get(id)!;
  }

  get(id: string): ImageReviewRecord | undefined {
    const row = this.db.database.prepare("SELECT * FROM image_review_records WHERE id = ?").get(id) as ReviewRow | undefined;
    return row ? mapReview(row) : undefined;
  }

  list(projectId: string): ImageReviewRecord[] {
    return (this.db.database.prepare("SELECT * FROM image_review_records WHERE project_id = ? ORDER BY created_at DESC, rowid DESC").all(projectId) as ReviewRow[])
      .map(mapReview);
  }

  workspace(projectId: string): ReviewWorkspaceSnapshot {
    if (!this.db.database.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId)) throw new Error("项目不存在。");
    const reviews = this.list(projectId);
    const latestByAsset = new Map<string, ImageReviewRecord>();
    for (const review of reviews) if (!latestByAsset.has(review.assetId)) latestByAsset.set(review.assetId, review);
    const masterIds = new Set((this.db.database.prepare("SELECT asset_id FROM project_masters WHERE project_id = ?").all(projectId) as Array<{ asset_id: string }>).map((row) => row.asset_id));
    const assets = this.assets.list({ projectId }).filter((asset) => asset.mediaType.startsWith("image/"));
    const counts = new Map<string, number>();
    for (const review of reviews) counts.set(review.assetId, (counts.get(review.assetId) ?? 0) + 1);
    const promotions = (this.db.database.prepare("SELECT * FROM master_promotions WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as PromotionRow[]).map(mapPromotion);
    return {
      projectId,
      candidates: assets.map((asset) => ({
        asset,
        latestReview: latestByAsset.get(asset.id),
        reviewCount: counts.get(asset.id) ?? 0,
        projectMaster: masterIds.has(asset.id),
      })),
      reviews,
      promotions,
    };
  }

  promote(input: {
    reviewId: string;
    targetType: MasterPromotionTarget;
    targetId?: string;
    versionId?: string;
    stateId?: string;
  }): MasterPromotion {
    if (!(["project", "character", "scene"] as MasterPromotionTarget[]).includes(input.targetType))
      throw new Error("无效的母版归属类型。");
    const review = this.get(input.reviewId);
    if (!review) throw new Error("审片记录不存在。");
    if (review.decision !== "approved") throw new Error("只有审片通过的图片才能晋级母版。");
    const asset = this.requireCandidate(review.projectId, review.assetId);
    if (asset.confirmation !== "confirmed" || !["authorized", "original"].includes(asset.rightsStatus))
      throw new Error("母版必须已通过审片并完成使用权复核。");
    const targetId = input.targetType === "project" ? review.projectId : input.targetId?.trim();
    if (!targetId) throw new Error("请选择母版归属对象。");
    const existing = this.db.database.prepare("SELECT * FROM master_promotions WHERE review_id = ? AND target_type = ? AND target_id = ?")
      .get(review.id, input.targetType, targetId) as PromotionRow | undefined;
    if (existing) return mapPromotion(existing);
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.assets.setProjectMaster(review.projectId, asset.id, true);
      if (input.targetType === "character") {
        const character = this.characters.get(targetId);
        if (!character || character.projectId !== review.projectId) throw new Error("角色与审片项目不一致。");
        let collection = this.collections.list(review.projectId).find((item) => item.kind === "character" && item.characterProfileId === character.id);
        if (!collection) collection = this.collections.create({
          projectId: review.projectId,
          characterProfileId: character.id,
          kind: "character",
          name: `${character.name} · 角色资产包`,
          description: "由审片母版晋级建立。",
        });
        this.collections.attachAsset(collection.id, asset.id, "主参考", "identity", "由审片记录晋级为角色主参考。");
        this.characters.update(character.id, { masterAssetId: asset.id });
        this.characterWorkspace.attachMedia(character.id, {
          versionId: input.versionId,
          stateId: input.stateId,
          assetId: asset.id,
          role: "master",
        });
      } else if (input.targetType === "scene") {
        const scene = this.sceneWorkspace.getWorkspace(targetId).scene;
        if (scene.projectId !== review.projectId) throw new Error("场景与审片项目不一致。");
        this.sceneWorkspace.attachMedia(scene.id, {
          versionId: input.versionId,
          stateId: input.stateId,
          assetId: asset.id,
          role: "master",
        });
      }
      this.db.database.prepare(`INSERT INTO master_promotions
        (id, review_id, project_id, asset_id, target_type, target_id, version_id, state_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, review.id, review.projectId, asset.id, input.targetType, targetId, input.versionId ?? null, input.stateId ?? null, now);
      if (review.creativeTaskId) this.db.database.prepare("UPDATE creative_tasks SET status = 'completed', result_asset_id = ?, updated_at = ? WHERE id = ?")
        .run(asset.id, now, review.creativeTaskId);
      if (review.generationSessionId) this.db.database.prepare("UPDATE generation_sessions SET status = 'completed', updated_at = ? WHERE id = ? AND status = 'review'")
        .run(now, review.generationSessionId);
    });
    return mapPromotion(this.db.database.prepare("SELECT * FROM master_promotions WHERE id = ?").get(id) as PromotionRow);
  }

  private requireCandidate(projectId: string, assetId: string): Asset {
    const asset = this.assets.findById(assetId);
    if (!asset || !asset.mediaType.startsWith("image/")) throw new Error("审片对象必须是图片素材。");
    if (!this.db.database.prepare("SELECT 1 FROM project_assets WHERE project_id = ? AND asset_id = ?").get(projectId, assetId))
      throw new Error("图片尚未归档到当前项目。");
    return asset;
  }

  private resolveSession(assetId: string, requestedId?: string): SessionRow | undefined {
    if (requestedId && !this.db.database.prepare(`SELECT 1 FROM (
      SELECT session_id FROM character_media_links WHERE asset_id = ?
      UNION ALL SELECT session_id FROM scene_media_links WHERE asset_id = ?
    ) WHERE session_id = ?`).get(assetId, assetId, requestedId))
      throw new Error("生成会话没有产出当前审片图片。");
    const linkedId = requestedId ?? (this.db.database.prepare(`SELECT session_id FROM (
      SELECT session_id, created_at FROM character_media_links WHERE asset_id = ? AND session_id IS NOT NULL
      UNION ALL SELECT session_id, created_at FROM scene_media_links WHERE asset_id = ? AND session_id IS NOT NULL
    ) ORDER BY created_at DESC LIMIT 1`).get(assetId, assetId) as { session_id: string } | undefined)?.session_id;
    if (!linkedId) return undefined;
    return this.db.database.prepare(`SELECT sessions.*, contexts.profile_id AS scene_profile_id,
      contexts.version_id AS scene_version_id, contexts.state_id AS scene_state_id
      FROM generation_sessions AS sessions LEFT JOIN generation_session_scene_contexts AS contexts ON contexts.session_id = sessions.id
      WHERE sessions.id = ?`).get(linkedId) as SessionRow | undefined;
  }

  private resolveTask(assetId: string, projectId: string): string | undefined {
    const row = this.db.database.prepare("SELECT id FROM creative_tasks WHERE project_id = ? AND result_asset_id = ? ORDER BY updated_at DESC LIMIT 1")
      .get(projectId, assetId) as { id: string } | undefined;
    return row?.id;
  }

  private provenanceFor(asset: Asset, session?: SessionRow): ImageReviewProvenance {
    let providerId = session?.provider_id ?? undefined;
    let prompt = session?.prompt || undefined;
    let negativePrompt = session?.negative_prompt || undefined;
    let aspectRatio = session?.aspect_ratio ?? undefined;
    let referenceAssetIds = session ? parseStringArray(session.reference_asset_ids_json) : [];
    const jobId = typeof asset.metadata.generatedFromJobId === "string" ? asset.metadata.generatedFromJobId : undefined;
    if (jobId) {
      const job = this.db.database.prepare("SELECT provider_id, request_json FROM jobs WHERE id = ?").get(jobId) as { provider_id: string; request_json: string } | undefined;
      if (job) {
        let request: Record<string, unknown> = {};
        try { request = JSON.parse(job.request_json) as Record<string, unknown>; } catch { /* 损坏的旧任务记录不应阻断人工审片。 */ }
        providerId ||= job.provider_id;
        prompt ||= typeof request.prompt === "string" ? request.prompt : undefined;
        negativePrompt ||= typeof request.negative === "string" ? request.negative : undefined;
        aspectRatio ||= typeof request.requestedAspectRatio === "string" ? request.requestedAspectRatio as ImageReviewProvenance["aspectRatio"] : undefined;
        if (!referenceAssetIds.length && Array.isArray(request.referenceAssetIds))
          referenceAssetIds = request.referenceAssetIds.filter((item): item is string => typeof item === "string");
      }
    }
    return {
      providerId: providerId as ImageReviewProvenance["providerId"],
      prompt,
      negativePrompt,
      aspectRatio,
      referenceAssetIds,
      characterProfileId: session?.character_profile_id ?? undefined,
      characterVersionId: session?.character_version_id ?? undefined,
      characterStateId: session?.character_state_id ?? undefined,
      sceneProfileId: session?.scene_profile_id ?? undefined,
      sceneVersionId: session?.scene_version_id ?? undefined,
      sceneStateId: session?.scene_state_id ?? undefined,
    };
  }
}
