import { StudioDatabase } from '../../db/client';

export class SettingsRepository {
  constructor(private readonly db: StudioDatabase) {}

  get(key: string): string | undefined {
    return (this.db.database.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value?: string } | undefined)?.value;
  }

  set(key: string, value: string): void {
    this.db.database.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
      .run(key, value, new Date().toISOString());
  }
}
