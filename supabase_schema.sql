-- ============================================
-- Supabase Schema: tasks 表
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================

-- 1. 创建 tasks 表
CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  quadrant    TEXT NOT NULL CHECK (quadrant IN ('q1', 'q2', 'q3', 'q4')),
  tags        TEXT[] DEFAULT '{}',
  is_important BOOLEAN DEFAULT FALSE,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. 启用 Row Level Security
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- 3. 创建公开读写策略（Demo 用途，生产环境应改为用户级别权限）
CREATE POLICY "Allow public read"
  ON tasks FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert"
  ON tasks FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update"
  ON tasks FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete"
  ON tasks FOR DELETE
  USING (true);

-- 4. 创建索引加速查询
CREATE INDEX idx_tasks_quadrant ON tasks (quadrant);
CREATE INDEX idx_tasks_created_at ON tasks (created_at DESC);
