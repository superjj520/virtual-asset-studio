import { randomUUID } from 'node:crypto';
import type { AssetRelationship, AssetRelationshipKind } from '../../../src/shared/types';
import { StudioDatabase } from '../../db/client';

export class RelationshipRepository {
  constructor(private readonly db: StudioDatabase) {}

  create(fromAssetId: string, toAssetId: string, kind: AssetRelationshipKind): AssetRelationship {
    const existing = this.db.database.prepare('SELECT * FROM asset_relationships WHERE from_asset_id = ? AND to_asset_id = ? AND kind = ?')
      .get(fromAssetId, toAssetId, kind) as any;
    if (existing) return this.map(existing);
    const relationship: AssetRelationship = { id: randomUUID(), fromAssetId, toAssetId, kind, createdAt: new Date().toISOString() };
    this.db.database.prepare('INSERT INTO asset_relationships (id, from_asset_id, to_asset_id, kind, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(relationship.id, relationship.fromAssetId, relationship.toAssetId, relationship.kind, relationship.createdAt);
    return relationship;
  }

  listForAsset(assetId: string): AssetRelationship[] {
    return (this.db.database.prepare('SELECT * FROM asset_relationships WHERE from_asset_id = ? OR to_asset_id = ? ORDER BY created_at').all(assetId, assetId) as any[])
      .map((row) => this.map(row));
  }

  private map(row: any): AssetRelationship {
    return { id: row.id, fromAssetId: row.from_asset_id, toAssetId: row.to_asset_id, kind: row.kind, createdAt: row.created_at };
  }
}
