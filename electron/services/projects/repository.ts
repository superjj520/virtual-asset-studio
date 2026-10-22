import { randomUUID } from 'node:crypto';
import type {
  Asset,
  Project,
  ProjectBlocker,
  ProjectBrief,
  ProjectMedium,
  ProjectPipelineStage,
  ProjectWorkspace,
} from '../../../src/shared/types';
import { StudioDatabase } from '../../db/client';
import { AssetRepository } from '../assets/repository';

export class ProjectRepository {
  constructor(private readonly db: StudioDatabase) {}

  create(name: string, medium: ProjectMedium): Project {
    const now = new Date().toISOString();
    const project: Project = { id: randomUUID(), name, medium, createdAt: now, updatedAt: now };
    this.db.database.prepare('INSERT INTO projects (id, name, medium, brief_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(project.id, project.name, project.medium, '{}', project.createdAt, project.updatedAt);
    return project;
  }

  getOrCreateLibraryProject(): Project {
    const id = 'asset-library';
    const row = this.db.database.prepare('SELECT * FROM projects WHERE id = ?').get(id) as { id: string; name: string; medium: ProjectMedium; created_at: string; updated_at: string } | undefined;
    if (row) return this.map(row);
    const now = new Date().toISOString();
    this.db.database.prepare('INSERT INTO projects (id, name, medium, brief_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, '未归档资产', 'freeform', '{}', now, now);
    return { id, name: '未归档资产', medium: 'freeform', createdAt: now, updatedAt: now };
  }

  list(): Project[] {
    return this.db.database.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all().map((row: any) => this.map(row)) as Project[];
  }

  updateBrief(id: string, brief: ProjectBrief): Project {
    const result = this.db.database.prepare('UPDATE projects SET brief_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(brief), new Date().toISOString(), id);
    if (result.changes !== 1) throw new Error(`项目不存在：${id}`);
    return this.get(id)!;
  }

  getWorkspace(id: string): ProjectWorkspace {
    const project = this.get(id);
    if (!project) throw new Error(`项目不存在：${id}`);
    const count = (sql: string, ...params: unknown[]) =>
      (this.db.database.prepare(sql).get(...params) as { count: number }).count;
    const assets = this.listAssets(id);
    const usable = (asset: Asset) => asset.confirmation === 'confirmed' && ['authorized', 'original'].includes(asset.rightsStatus);
    const projectMasterIds = new Set((this.db.database.prepare('SELECT asset_id FROM project_masters WHERE project_id = ?').all(id) as Array<{ asset_id: string }>).map((row) => row.asset_id));
    const masterAssets = assets.filter((asset) => usable(asset) && projectMasterIds.has(asset.id));
    const generationCount = this.db.database.prepare('SELECT COUNT(*) AS count FROM jobs WHERE project_id = ? AND kind IN (?, ?)')
      .get(id, 'image_generation', 'image_to_video') as { count: number };
    const health = {
      assetCount: assets.length,
      confirmedAssetCount: assets.filter(usable).length,
      candidateAssetCount: assets.filter((asset) => asset.confirmation === 'draft').length,
      masterAssetCount: masterAssets.length,
      generationCount: generationCount.count,
    };
    const briefCompleted = Object.values(project.brief ?? {}).filter((value) => value.trim()).length;
    const taskCount = count('SELECT COUNT(*) AS count FROM creative_tasks WHERE project_id = ?', id);
    const completedTaskCount = count("SELECT COUNT(*) AS count FROM creative_tasks WHERE project_id = ? AND status = 'completed'", id);
    const characterCount = count('SELECT COUNT(*) AS count FROM character_profiles WHERE project_id = ?', id);
    const confirmedCharacterCount = count("SELECT COUNT(*) AS count FROM character_profiles WHERE project_id = ? AND lifecycle = 'confirmed'", id);
    const sceneCount = count('SELECT COUNT(*) AS count FROM scene_profiles WHERE project_id = ?', id);
    const confirmedSceneCount = count("SELECT COUNT(*) AS count FROM scene_profiles WHERE project_id = ? AND lifecycle = 'confirmed'", id);
    const shotCount = count('SELECT COUNT(*) AS count FROM shot_plans WHERE project_id = ?', id);
    const problemJobCount = count("SELECT COUNT(*) AS count FROM jobs WHERE project_id = ? AND status IN ('failed', 'unknown')", id);
    const recipeCount = count('SELECT COUNT(*) AS count FROM creative_recipes WHERE project_id = ?', id);
    const validatedRecipeCount = count("SELECT COUNT(*) AS count FROM creative_recipes WHERE project_id = ? AND status = 'validated'", id);
    const draftRecipeCount = count("SELECT COUNT(*) AS count FROM creative_recipes WHERE project_id = ? AND status = 'draft'", id);
    const rightsIssueCount = count(`SELECT COUNT(*) AS count FROM project_assets AS links
      INNER JOIN assets ON assets.id = links.asset_id
      WHERE links.project_id = ? AND assets.rights_status NOT IN ('authorized', 'original')`, id);
    const latestReviews = this.db.database.prepare(`SELECT decision, COUNT(*) AS count FROM (
      SELECT decision, ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY created_at DESC, id DESC) AS position
      FROM image_review_records WHERE project_id = ?
    ) WHERE position = 1 GROUP BY decision`).all(id) as Array<{ decision: string; count: number }>;
    const reviewCounts = Object.fromEntries(latestReviews.map((row) => [row.decision, row.count])) as Record<string, number>;
    const approvedReviewCount = reviewCounts.approved ?? 0;

    const pipeline: ProjectPipelineStage[] = [
      {
        key: 'creation',
        label: '创作',
        status: completedTaskCount > 0 ? 'complete' : taskCount > 0 || briefCompleted === 5 ? 'ready' : briefCompleted > 0 ? 'needs_attention' : 'not_started',
        summary: `${briefCompleted}/5 简报 · ${taskCount} 个任务`,
        nextAction: taskCount > 0 ? '继续当前创作' : briefCompleted === 5 ? '建立第一条任务' : '补齐项目简报',
        target: taskCount > 0 ? 'creation' : briefCompleted === 5 ? 'start' : 'workspace',
        primaryCount: taskCount,
      },
      {
        key: 'assets',
        label: '资产',
        status: masterAssets.length > 0 ? 'complete' : health.confirmedAssetCount > 0 || confirmedCharacterCount + confirmedSceneCount > 0 ? 'ready' : health.assetCount + characterCount + sceneCount > 0 ? 'needs_attention' : 'not_started',
        summary: `${characterCount} 角色 · ${sceneCount} 场景 · ${health.confirmedAssetCount} 可用素材`,
        nextAction: masterAssets.length > 0 ? '管理资产基线' : characterCount + sceneCount > 0 ? '补齐可用素材' : '建立角色或场景',
        target: characterCount + sceneCount > 0 ? 'assets' : 'characters',
        primaryCount: characterCount + sceneCount,
      },
      {
        key: 'production',
        label: '生产',
        status: approvedReviewCount > 0 || masterAssets.length > 0 ? 'complete' : problemJobCount > 0 || health.candidateAssetCount > 0 ? 'needs_attention' : shotCount + health.generationCount > 0 ? 'ready' : 'not_started',
        summary: `${shotCount} 个镜头 · ${health.generationCount} 次生成 · ${approvedReviewCount} 张通过`,
        nextAction: problemJobCount > 0 ? '处理异常任务' : health.candidateAssetCount > 0 ? '审片并锁定母版' : '建立镜头或候选',
        target: problemJobCount > 0 ? 'jobs' : health.candidateAssetCount > 0 ? 'review' : 'shot',
        primaryCount: health.generationCount,
      },
      {
        key: 'templates',
        label: '模板',
        status: validatedRecipeCount > 0 ? 'complete' : recipeCount > 0 ? 'ready' : 'not_started',
        summary: `${recipeCount} 个配方 · ${validatedRecipeCount} 个已验证`,
        nextAction: validatedRecipeCount > 0 ? '复用已验证配方' : recipeCount > 0 ? '用成图验证配方' : '沉淀第一条配方',
        target: 'recipes',
        primaryCount: recipeCount,
      },
    ];

    const blockers: ProjectBlocker[] = [];
    if (briefCompleted < 5) blockers.push({ code: 'brief', label: '简报待补齐', detail: `还缺 ${5 - briefCompleted} 项`, count: 5 - briefCompleted, target: 'workspace' });
    if (rightsIssueCount > 0) blockers.push({ code: 'rights', label: '使用权待复核', detail: `${rightsIssueCount} 个素材尚不可进入正式生产`, count: rightsIssueCount, target: 'assets' });
    if (health.candidateAssetCount > 0) blockers.push({ code: 'review', label: '候选待审片', detail: `${health.candidateAssetCount} 张候选等待判断`, count: health.candidateAssetCount, target: 'review' });
    if (problemJobCount > 0) blockers.push({ code: 'job', label: '生成任务异常', detail: `${problemJobCount} 个任务需要恢复或重试`, count: problemJobCount, target: 'jobs' });
    if (draftRecipeCount > 0) blockers.push({ code: 'recipe', label: '配方待验证', detail: `${draftRecipeCount} 个配方还没有成图证据`, count: draftRecipeCount, target: 'recipes' });

    const firstBlocker = blockers[0];
    const recommendedNextAction = firstBlocker
      ? `${firstBlocker.label}：${firstBlocker.detail}`
      : masterAssets.length
        ? `项目基线已建立；继续沿用 ${masterAssets.length} 个母版，只改变一个变量。`
        : '建立第一条创作任务，生成并比较一组候选。';
    return { project, health, masterAssets, pipeline, blockers, recommendedNextAction };
  }

  attachAsset(projectId: string, assetId: string): void {
    this.db.database.prepare('INSERT OR IGNORE INTO project_assets (project_id, asset_id, created_at) VALUES (?, ?, ?)')
      .run(projectId, assetId, new Date().toISOString());
  }

  listAssets(projectId: string): Asset[] {
    return new AssetRepository(this.db).list({ projectId });
  }

  private get(id: string): Project | undefined {
    const row = this.db.database.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    return row ? this.map(row) : undefined;
  }

  private map(row: { id: string; name: string; medium: ProjectMedium; brief_json?: string; created_at: string; updated_at: string }): Project {
    const parsed = row.brief_json ? JSON.parse(row.brief_json) as Partial<ProjectBrief> : {};
    const hasBrief = Object.values(parsed).some(Boolean);
    return { id: row.id, name: row.name, medium: row.medium, brief: hasBrief ? parsed as ProjectBrief : undefined, createdAt: row.created_at, updatedAt: row.updated_at };
  }
}
