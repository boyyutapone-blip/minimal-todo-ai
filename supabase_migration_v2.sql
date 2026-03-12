-- ============================================
-- 数据库升级：为 tasks 表添加 due_date 字段
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================

ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ DEFAULT NULL;

-- 为 due_date 创建索引，方便按截止日期排序/筛选
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks (due_date);
