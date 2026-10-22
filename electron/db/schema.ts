import type Database from "better-sqlite3";

export const applySchema = (database: Database.Database) => {
  database.exec('PRAGMA foreign_keys = ON;');
  database.transaction(() => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      managed_path TEXT NOT NULL,
      source_path TEXT,
      sha256 TEXT NOT NULL UNIQUE,
      media_type TEXT NOT NULL,
      rights_status TEXT NOT NULL,
      confirmation TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS asset_versions (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
      parent_version_id TEXT REFERENCES asset_versions(id) ON DELETE RESTRICT,
      managed_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS asset_relationships (
      id TEXT PRIMARY KEY,
      from_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
      to_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(from_asset_id, to_asset_id, kind)
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      medium TEXT NOT NULL,
      brief_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_assets (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL,
      PRIMARY KEY(project_id, asset_id)
    );
    CREATE INDEX IF NOT EXISTS project_assets_asset_idx ON project_assets(asset_id);
    CREATE TABLE IF NOT EXISTS project_masters (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL,
      PRIMARY KEY(project_id, asset_id)
    );
    CREATE INDEX IF NOT EXISTS project_masters_asset_idx ON project_masters(asset_id);
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      kind TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      status TEXT NOT NULL,
      request_json TEXT NOT NULL,
      result_json TEXT,
      error TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shot_plans (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      shot_json TEXT NOT NULL,
      compiled_prompt TEXT NOT NULL,
      reference_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS character_profiles (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      card_json TEXT NOT NULL,
      specification_json TEXT NOT NULL DEFAULT '{}',
      master_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
      character_group TEXT NOT NULL DEFAULT 'lead',
      lifecycle TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS character_variants (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES character_profiles(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('look', 'expression', 'pose', 'scene')),
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(profile_id, kind, name)
    );
    CREATE TABLE IF NOT EXISTS character_facts (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES character_profiles(id) ON DELETE CASCADE,
      variant_id TEXT NOT NULL DEFAULT '',
      slot_key TEXT NOT NULL,
      group_key TEXT NOT NULL,
      label TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL CHECK(state IN ('draft', 'confirmed', 'not_applicable')),
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(profile_id, variant_id, slot_key)
    );
    CREATE TABLE IF NOT EXISTS character_fact_evidence (
      fact_id TEXT NOT NULL REFERENCES character_facts(id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
      region_json TEXT,
      region_note TEXT NOT NULL DEFAULT '',
      PRIMARY KEY(fact_id, asset_id)
    );
    CREATE INDEX IF NOT EXISTS character_facts_profile_idx ON character_facts(profile_id);
    CREATE INDEX IF NOT EXISTS character_fact_evidence_asset_idx ON character_fact_evidence(asset_id);
    CREATE TRIGGER IF NOT EXISTS character_fact_variant_guard_insert BEFORE INSERT ON character_facts
      WHEN NEW.variant_id <> '' AND NOT EXISTS (SELECT 1 FROM character_variants WHERE id = NEW.variant_id AND profile_id = NEW.profile_id)
      BEGIN SELECT RAISE(ABORT, '角色变体归属不一致'); END;
    CREATE TRIGGER IF NOT EXISTS character_fact_variant_guard_update BEFORE UPDATE OF variant_id, profile_id ON character_facts
      WHEN NEW.variant_id <> '' AND NOT EXISTS (SELECT 1 FROM character_variants WHERE id = NEW.variant_id AND profile_id = NEW.profile_id)
      BEGIN SELECT RAISE(ABORT, '角色变体归属不一致'); END;
    CREATE TRIGGER IF NOT EXISTS character_variant_delete_facts BEFORE DELETE ON character_variants
      BEGIN DELETE FROM character_facts WHERE variant_id = OLD.id; END;
    CREATE TABLE IF NOT EXISTS job_assets (
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
      role TEXT NOT NULL,
      PRIMARY KEY(job_id, asset_id, role)
    );
    CREATE TABLE IF NOT EXISTS learning_patterns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      scope_json TEXT NOT NULL,
      module TEXT NOT NULL,
      raw_input TEXT NOT NULL DEFAULT '',
      evidence_json TEXT NOT NULL,
      contraindications_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS learning_evaluations (
      id TEXT PRIMARY KEY,
      pattern_id TEXT NOT NULL REFERENCES learning_patterns(id) ON DELETE RESTRICT,
      job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
      result TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS prompt_sources (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      repository TEXT NOT NULL,
      title TEXT NOT NULL,
      license TEXT,
      summary TEXT NOT NULL,
      source_type TEXT NOT NULL,
      status TEXT NOT NULL,
      imported_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS prompt_entries (
      id TEXT PRIMARY KEY,
      source_repository TEXT NOT NULL,
      source_path TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      prompt_text TEXT NOT NULL,
      usage TEXT,
      license TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(source_repository, source_path, title)
    );
    CREATE TABLE IF NOT EXISTS visual_paradigms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      description TEXT NOT NULL,
      prompt_module TEXT NOT NULL,
      compatible_roles_json TEXT NOT NULL,
      conflicts_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS generation_batches (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      creative_task_id TEXT REFERENCES creative_tasks(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      aspect_ratio TEXT NOT NULL,
      reference_asset_ids_json TEXT NOT NULL DEFAULT '[]',
      estimated_cost_usd REAL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS generation_variants (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL REFERENCES generation_batches(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL,
      job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
      asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS creative_recipes (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      creative_task_id TEXT REFERENCES creative_tasks(id) ON DELETE SET NULL,
      provider_id TEXT,
      name TEXT NOT NULL,
      purpose TEXT NOT NULL,
      card_json TEXT NOT NULL,
      prompt TEXT NOT NULL,
      negative TEXT NOT NULL,
      source_asset_ids_json TEXT NOT NULL,
      status TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS creative_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      character_profile_id TEXT REFERENCES character_profiles(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      objective TEXT NOT NULL,
      status TEXT NOT NULL,
      collection_ids_json TEXT NOT NULL DEFAULT '[]',
      card_json TEXT NOT NULL,
      result_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS character_versions (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES character_profiles(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('draft', 'locked', 'superseded')),
      change_summary TEXT NOT NULL DEFAULT '',
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(profile_id, version_number)
    );
    CREATE TABLE IF NOT EXISTS character_states (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES character_profiles(id) ON DELETE CASCADE,
      version_id TEXT REFERENCES character_versions(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('baseline', 'scene', 'performance')),
      status TEXT NOT NULL CHECK(status IN ('draft', 'active', 'archived')),
      wardrobe TEXT NOT NULL DEFAULT '',
      hair TEXT NOT NULL DEFAULT '',
      expression TEXT NOT NULL DEFAULT '',
      pose TEXT NOT NULL DEFAULT '',
      scene TEXT NOT NULL DEFAULT '',
      emotion TEXT NOT NULL DEFAULT '',
      continuity_notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS character_active_state_unique
      ON character_states(profile_id) WHERE status = 'active';
    CREATE TABLE IF NOT EXISTS generation_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      character_profile_id TEXT REFERENCES character_profiles(id) ON DELETE SET NULL,
      character_version_id TEXT REFERENCES character_versions(id) ON DELETE SET NULL,
      character_state_id TEXT REFERENCES character_states(id) ON DELETE SET NULL,
      creative_task_id TEXT REFERENCES creative_tasks(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('text_to_image', 'image_edit', 'text_to_video', 'image_to_video', 'video_extend', 'talking')),
      status TEXT NOT NULL CHECK(status IN ('draft', 'running', 'review', 'completed', 'failed', 'archived')),
      prompt TEXT NOT NULL DEFAULT '',
      negative_prompt TEXT NOT NULL DEFAULT '',
      provider_id TEXT,
      aspect_ratio TEXT NOT NULL,
      reference_asset_ids_json TEXT NOT NULL DEFAULT '[]',
      settings_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scene_profiles (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('interior', 'exterior', 'environment', 'fantasy', 'studio')),
      lifecycle TEXT NOT NULL CHECK(lifecycle IN ('draft', 'confirmed', 'archived')),
      anchor TEXT NOT NULL DEFAULT '',
      layout TEXT NOT NULL DEFAULT '',
      materials TEXT NOT NULL DEFAULT '',
      color_system TEXT NOT NULL DEFAULT '',
      required_elements TEXT NOT NULL DEFAULT '',
      forbidden_changes TEXT NOT NULL DEFAULT '',
      master_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scene_versions (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES scene_profiles(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('draft', 'locked', 'superseded')),
      change_summary TEXT NOT NULL DEFAULT '',
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(profile_id, version_number)
    );
    CREATE TABLE IF NOT EXISTS scene_states (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES scene_profiles(id) ON DELETE CASCADE,
      version_id TEXT REFERENCES scene_versions(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('draft', 'active', 'archived')),
      time_of_day TEXT NOT NULL DEFAULT '',
      weather TEXT NOT NULL DEFAULT '',
      season TEXT NOT NULL DEFAULT '',
      lighting TEXT NOT NULL DEFAULT '',
      atmosphere TEXT NOT NULL DEFAULT '',
      set_dressing TEXT NOT NULL DEFAULT '',
      continuity_notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS scene_active_state_unique
      ON scene_states(profile_id) WHERE status = 'active';
    CREATE TABLE IF NOT EXISTS generation_session_scene_contexts (
      session_id TEXT PRIMARY KEY REFERENCES generation_sessions(id) ON DELETE CASCADE,
      profile_id TEXT NOT NULL REFERENCES scene_profiles(id) ON DELETE CASCADE,
      version_id TEXT REFERENCES scene_versions(id) ON DELETE SET NULL,
      state_id TEXT REFERENCES scene_states(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS scene_media_links (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES scene_profiles(id) ON DELETE CASCADE,
      version_id TEXT REFERENCES scene_versions(id) ON DELETE SET NULL,
      state_id TEXT REFERENCES scene_states(id) ON DELETE SET NULL,
      session_id TEXT REFERENCES generation_sessions(id) ON DELETE SET NULL,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
      role TEXT NOT NULL CHECK(role IN ('layout_reference', 'lighting_reference', 'material_reference', 'candidate', 'master', 'output', 'remix_source')),
      parent_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      UNIQUE(session_id, asset_id, role)
    );
    CREATE TABLE IF NOT EXISTS shot_plan_contexts (
      shot_plan_id TEXT PRIMARY KEY REFERENCES shot_plans(id) ON DELETE CASCADE,
      creative_task_id TEXT REFERENCES creative_tasks(id) ON DELETE SET NULL,
      character_profile_id TEXT REFERENCES character_profiles(id) ON DELETE SET NULL,
      character_version_id TEXT REFERENCES character_versions(id) ON DELETE SET NULL,
      character_state_id TEXT REFERENCES character_states(id) ON DELETE SET NULL,
      scene_profile_id TEXT REFERENCES scene_profiles(id) ON DELETE SET NULL,
      scene_version_id TEXT REFERENCES scene_versions(id) ON DELETE SET NULL,
      scene_state_id TEXT REFERENCES scene_states(id) ON DELETE SET NULL,
      purpose TEXT NOT NULL CHECK(purpose IN ('image', 'video')),
      status TEXT NOT NULL CHECK(status IN ('draft', 'ready', 'review', 'approved', 'blocked')),
      continuity_notes TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS character_media_links (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES character_profiles(id) ON DELETE CASCADE,
      version_id TEXT REFERENCES character_versions(id) ON DELETE SET NULL,
      state_id TEXT REFERENCES character_states(id) ON DELETE SET NULL,
      session_id TEXT REFERENCES generation_sessions(id) ON DELETE SET NULL,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
      role TEXT NOT NULL CHECK(role IN ('reference', 'candidate', 'master', 'start_frame', 'output', 'voice', 'remix_source')),
      parent_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      UNIQUE(session_id, asset_id, role)
    );
    CREATE INDEX IF NOT EXISTS character_versions_profile_idx ON character_versions(profile_id, version_number DESC);
    CREATE INDEX IF NOT EXISTS character_states_profile_idx ON character_states(profile_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS generation_sessions_character_idx ON generation_sessions(character_profile_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS character_media_profile_idx ON character_media_links(profile_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS scene_profiles_project_idx ON scene_profiles(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS scene_versions_profile_idx ON scene_versions(profile_id, version_number DESC);
    CREATE INDEX IF NOT EXISTS scene_states_profile_idx ON scene_states(profile_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS scene_media_profile_idx ON scene_media_links(profile_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS shot_plan_context_character_idx ON shot_plan_contexts(character_profile_id);
    CREATE INDEX IF NOT EXISTS shot_plan_context_scene_idx ON shot_plan_contexts(scene_profile_id);
    CREATE TABLE IF NOT EXISTS asset_collections (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      character_profile_id TEXT REFERENCES character_profiles(id) ON DELETE SET NULL,
      parent_id TEXT REFERENCES asset_collections(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS asset_collection_members (
      collection_id TEXT NOT NULL REFERENCES asset_collections(id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
      membership_role TEXT NOT NULL DEFAULT '素材',
      module_key TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      PRIMARY KEY(collection_id, asset_id)
    );
    CREATE INDEX IF NOT EXISTS asset_collections_character_kind_idx ON asset_collections(character_profile_id, kind);
    CREATE INDEX IF NOT EXISTS character_profiles_project_updated_idx ON character_profiles(project_id, updated_at);
  `);
  const patternColumns = database
    .prepare("PRAGMA table_info(learning_patterns)")
    .all() as Array<{ name: string }>;
  if (!patternColumns.some((column) => column.name === "raw_input")) {
    database.exec(
      "ALTER TABLE learning_patterns ADD COLUMN raw_input TEXT NOT NULL DEFAULT ''",
    );
  }
  const profileColumns = database
    .prepare("PRAGMA table_info(character_profiles)")
    .all() as Array<{ name: string }>;
  if (!profileColumns.some((column) => column.name === "specification_json"))
    database.exec(
      "ALTER TABLE character_profiles ADD COLUMN specification_json TEXT NOT NULL DEFAULT '{}'",
    );
  if (!profileColumns.some((column) => column.name === "master_asset_id"))
    database.exec(
      "ALTER TABLE character_profiles ADD COLUMN master_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL",
    );
  if (!profileColumns.some((column) => column.name === "character_group"))
    database.exec(
      "ALTER TABLE character_profiles ADD COLUMN character_group TEXT NOT NULL DEFAULT 'lead'",
    );
  if (!profileColumns.some((column) => column.name === "lifecycle"))
    database.exec(
      "ALTER TABLE character_profiles ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'draft'",
    );
  const projectColumns = database
    .prepare("PRAGMA table_info(projects)")
    .all() as Array<{ name: string }>;
  if (!projectColumns.some((column) => column.name === "brief_json"))
    database.exec(
      "ALTER TABLE projects ADD COLUMN brief_json TEXT NOT NULL DEFAULT '{}'",
    );
  const taskColumns = database
    .prepare("PRAGMA table_info(creative_tasks)")
    .all() as Array<{ name: string }>;
  if (!taskColumns.some((column) => column.name === "collection_ids_json"))
    database.exec(
      "ALTER TABLE creative_tasks ADD COLUMN collection_ids_json TEXT NOT NULL DEFAULT '[]'",
    );
  const batchColumns = database
    .prepare("PRAGMA table_info(generation_batches)")
    .all() as Array<{ name: string }>;
  if (!batchColumns.some((column) => column.name === "creative_task_id"))
    database.exec(
      "ALTER TABLE generation_batches ADD COLUMN creative_task_id TEXT REFERENCES creative_tasks(id) ON DELETE SET NULL",
    );
  if (!batchColumns.some((column) => column.name === "reference_asset_ids_json"))
    database.exec("ALTER TABLE generation_batches ADD COLUMN reference_asset_ids_json TEXT NOT NULL DEFAULT '[]'");
  const recipeColumns = database
    .prepare("PRAGMA table_info(creative_recipes)")
    .all() as Array<{ name: string }>;
  if (!recipeColumns.some((column) => column.name === "creative_task_id"))
    database.exec(
      "ALTER TABLE creative_recipes ADD COLUMN creative_task_id TEXT REFERENCES creative_tasks(id) ON DELETE SET NULL",
    );
  if (!recipeColumns.some((column) => column.name === "provider_id"))
    database.exec("ALTER TABLE creative_recipes ADD COLUMN provider_id TEXT");
  database.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (1, ?)").run(new Date().toISOString());
  if (!database.prepare("SELECT version FROM schema_migrations WHERE version = 2").get()) {
    const now = new Date().toISOString();
    const legacyRights = database.prepare(`
      SELECT id, rights_status, metadata_json FROM assets
      WHERE rights_status IN ('authorized', 'original')
    `).all() as Array<{ id: string; rights_status: string; metadata_json: string }>;
    const downgrade = database.prepare(`
      UPDATE assets SET rights_status = 'unknown', metadata_json = ?, updated_at = ? WHERE id = ?
    `);
    for (const asset of legacyRights) {
      let metadata: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(asset.metadata_json);
        metadata = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
      } catch {
        metadata = {};
      }
      if (metadata.rightsReview === 'approved' && typeof metadata.rightsReviewNote === 'string' && metadata.rightsReviewNote.trim()) continue;
      downgrade.run(JSON.stringify({ ...metadata, previousRightsStatus: asset.rights_status, rightsReview: 'pending', rightsReviewNote: '', rightsReviewedAt: now }), now, asset.id);
    }
    database.exec(`
      INSERT OR IGNORE INTO project_assets (project_id, asset_id, created_at)
        SELECT collections.project_id, members.asset_id, members.created_at
        FROM asset_collection_members AS members
        INNER JOIN asset_collections AS collections ON collections.id = members.collection_id
        WHERE collections.project_id IS NOT NULL;
      INSERT OR IGNORE INTO project_assets (project_id, asset_id, created_at)
        SELECT project_id, master_asset_id, created_at
        FROM character_profiles WHERE project_id IS NOT NULL AND master_asset_id IS NOT NULL;
    `);
    database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)").run(now);
  }
  if (!database.prepare("SELECT version FROM schema_migrations WHERE version = 3").get()) {
    database.exec(`
      UPDATE character_profiles SET lifecycle = 'draft', updated_at = CURRENT_TIMESTAMP
        WHERE lifecycle = 'confirmed' AND (
          master_asset_id IS NULL OR
          NOT EXISTS (
            SELECT 1 FROM assets AS master
            WHERE master.id = character_profiles.master_asset_id
              AND master.media_type LIKE 'image/%' AND master.confirmation = 'confirmed'
              AND master.rights_status IN ('authorized', 'original')
          ) OR
          NOT EXISTS (
            SELECT 1 FROM asset_collection_members AS member
            INNER JOIN asset_collections AS collection ON collection.id = member.collection_id
            WHERE member.asset_id = character_profiles.master_asset_id
              AND collection.character_profile_id = character_profiles.id AND collection.kind = 'character'
              AND collection.project_id IS character_profiles.project_id
          ) OR
          EXISTS (
            SELECT 1 FROM character_facts AS fact
            INNER JOIN character_fact_evidence AS evidence ON evidence.fact_id = fact.id
            INNER JOIN assets AS source ON source.id = evidence.asset_id
            WHERE fact.profile_id = character_profiles.id AND fact.state = 'confirmed'
              AND (source.confirmation <> 'confirmed' OR source.rights_status NOT IN ('authorized', 'original'))
          )
        );
      UPDATE asset_collections SET status = 'draft', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'active' AND id IN (
          SELECT member.collection_id FROM asset_collection_members AS member
          INNER JOIN assets AS source ON source.id = member.asset_id
          WHERE source.rights_status NOT IN ('authorized', 'original') OR source.confirmation <> 'confirmed'
        );
    `);
    database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (3, ?)").run(new Date().toISOString());
  }
  if (!database.prepare("SELECT version FROM schema_migrations WHERE version = 4").get()) {
    const now = new Date().toISOString();
    const generated = database.prepare("SELECT id, source_path, rights_status, metadata_json FROM assets WHERE source_path LIKE 'generated://%' OR metadata_json LIKE '%generatedFromJobId%'")
      .all() as Array<{ id: string; source_path: string | null; rights_status: string; metadata_json: string }>;
    const update = database.prepare('UPDATE assets SET rights_status = ?, metadata_json = ?, updated_at = ? WHERE id = ?');
    for (const asset of generated) {
      let metadata: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(asset.metadata_json);
        metadata = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
      } catch {
        metadata = {};
      }
      if (!asset.source_path?.startsWith('generated://') && !metadata.generatedFromJobId) continue;
      const wasOriginal = asset.rights_status === 'original';
      update.run(wasOriginal ? 'unknown' : asset.rights_status, JSON.stringify({
        ...metadata,
        provenance: 'ai_generated',
        ...(wasOriginal ? { previousRightsStatus: 'original', rightsReview: 'pending', rightsReviewNote: '' } : {}),
      }), now, asset.id);
    }
    database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (4, ?)").run(now);
  }
  const memberColumns = database.prepare("PRAGMA table_info(asset_collection_members)").all() as Array<{ name: string }>;
  if (!memberColumns.some((column) => column.name === "module_key")) database.exec("ALTER TABLE asset_collection_members ADD COLUMN module_key TEXT NOT NULL DEFAULT ''");
  if (!memberColumns.some((column) => column.name === "notes")) database.exec("ALTER TABLE asset_collection_members ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
  if (!memberColumns.some((column) => column.name === "sort_order")) database.exec("ALTER TABLE asset_collection_members ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
  })();
};
