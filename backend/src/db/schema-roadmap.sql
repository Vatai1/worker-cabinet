-- Roadmap items for projects
CREATE TABLE IF NOT EXISTS project_roadmap (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES company_projects(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  due_date DATE,
  order_index INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_roadmap_project ON project_roadmap(project_id);
CREATE INDEX IF NOT EXISTS idx_project_roadmap_order ON project_roadmap(project_id, order_index);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_project_roadmap_updated_at ON project_roadmap;
CREATE TRIGGER update_project_roadmap_updated_at BEFORE UPDATE ON project_roadmap
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
