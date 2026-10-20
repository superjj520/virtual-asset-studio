import { randomUUID } from 'node:crypto';
import type { Asset, Project, ProjectBrief, ProjectMedium, ProjectWorkspace } from '../../../src/shared/types';
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
    const recommendedNextAction = masterAssets.length
      ? `已锁定 ${masterAssets.length} 个母版；可基于它们扩展新场景、镜头或视频。`
      : health.candidateAssetCount
        ? '请在候选资产中确认一张最能代表角色或场景的图片，并设为母版。'
        : '先建立创作卡或导入参考素材，形成第一组可比较候选。';
    return { project, health, masterAssets, recommendedNextAction };
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
