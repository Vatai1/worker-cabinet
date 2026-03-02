import { query } from '../config/database.js'

export async function migrateAddRoadmapV2() {
  try {
    // Rows (swim lanes) for the roadmap
    await query(`
      CREATE TABLE IF NOT EXISTS roadmap_rows (
        id          SERIAL PRIMARY KEY,
        project_id  INTEGER NOT NULL REFERENCES company_projects(id) ON DELETE CASCADE,
        title       VARCHAR(255) NOT NULL,
        color       VARCHAR(20) DEFAULT '#6366f1',
        order_index INTEGER DEFAULT 0,
        created_by  INTEGER REFERENCES users(id),
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await query(`
      CREATE INDEX IF NOT EXISTS idx_roadmap_rows_project ON roadmap_rows(project_id)
    `)

    // Tasks placed in rows with month-based positioning
    await query(`
      CREATE TABLE IF NOT EXISTS roadmap_tasks (
        id          SERIAL PRIMARY KEY,
        project_id  INTEGER NOT NULL REFERENCES company_projects(id) ON DELETE CASCADE,
        row_id      INTEGER NOT NULL REFERENCES roadmap_rows(id) ON DELETE CASCADE,
        title       VARCHAR(500) NOT NULL,
        description TEXT,
        start_month VARCHAR(7) NOT NULL,
        end_month   VARCHAR(7) NOT NULL,
        status      VARCHAR(20) DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_progress', 'completed')),
        color       VARCHAR(20),
        created_by  INTEGER REFERENCES users(id),
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await query(`
      CREATE INDEX IF NOT EXISTS idx_roadmap_tasks_project ON roadmap_tasks(project_id)
    `)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_roadmap_tasks_row ON roadmap_tasks(row_id)
    `)

    await query(`
      CREATE OR REPLACE FUNCTION update_roadmap_tasks_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `)

    await query(`
      DROP TRIGGER IF EXISTS trg_roadmap_tasks_updated_at ON roadmap_tasks
    `)
    await query(`
      CREATE TRIGGER trg_roadmap_tasks_updated_at
        BEFORE UPDATE ON roadmap_tasks
        FOR EACH ROW EXECUTE FUNCTION update_roadmap_tasks_updated_at()
    `)

    console.log('✅ roadmap_rows and roadmap_tasks tables created')
  } catch (err) {
    console.error('Migration roadmap-v2 error:', err)
    throw err
  }
}
