import Database from 'better-sqlite3';
import { applySchema } from './schema';
import { CharacterProfileRepository } from '../services/characters/repository';

export class StudioDatabase {
  readonly database: Database.Database;

  constructor(filename: string) {
    this.database = new Database(filename);
    this.database.pragma('journal_mode = WAL');
    applySchema(this.database);
    if (!this.database.prepare('SELECT version FROM schema_migrations WHERE version = 5').get()) {
      this.transaction(() => {
        const repository = new CharacterProfileRepository(this);
        const confirmed = this.database.prepare("SELECT id FROM character_profiles WHERE lifecycle = 'confirmed'").all() as Array<{ id: string }>;
        for (const { id } of confirmed) repository.reconcileProfile(id);
        this.database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (5, ?)').run(new Date().toISOString());
      });
    }
    if (!this.database.prepare('SELECT version FROM schema_migrations WHERE version = 6').get()) {
      this.transaction(() => {
        this.database.prepare(`INSERT OR IGNORE INTO project_masters (project_id, asset_id, created_at)
          SELECT project_assets.project_id, project_assets.asset_id, assets.updated_at
          FROM project_assets INNER JOIN assets ON assets.id = project_assets.asset_id
          WHERE json_extract(assets.metadata_json, '$.role') = 'master'
            AND (SELECT COUNT(*) FROM project_assets AS candidates WHERE candidates.asset_id = assets.id) = 1`).run();
        this.database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (6, ?)').run(new Date().toISOString());
      });
    }
  }

  transaction<T>(operation: () => T): T {
    return this.database.transaction(operation)();
  }

  close(): void {
    this.database.close();
  }
}
