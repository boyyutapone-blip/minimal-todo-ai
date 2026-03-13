-- ============================================
-- 多租户隔离升级计划 (RLS)
-- ============================================

-- 1. 为 tasks 表添加 user_id 字段
-- 关联到 Supabase Auth 的 users 表，并默认填充当前登录用户的 UID
ALTER TABLE IF EXISTS public.tasks 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid();

-- 2. 开启行级安全策略 (RLS)
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- 3. 创建访问策略 (Policies)

-- 允许用户查看自己的任务
DROP POLICY IF EXISTS "Users can view their own tasks" ON public.tasks;
CREATE POLICY "Users can view their own tasks" ON public.tasks 
FOR SELECT USING (auth.uid() = user_id);

-- 允许用户插入自己的任务
DROP POLICY IF EXISTS "Users can insert their own tasks" ON public.tasks;
CREATE POLICY "Users can insert their own tasks" ON public.tasks 
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 允许用户更新自己的任务
DROP POLICY IF EXISTS "Users can update their own tasks" ON public.tasks;
CREATE POLICY "Users can update their own tasks" ON public.tasks 
FOR UPDATE USING (auth.uid() = user_id);

-- 允许用户删除自己的任务
DROP POLICY IF EXISTS "Users can delete their own tasks" ON public.tasks;
CREATE POLICY "Users can delete their own tasks" ON public.tasks 
FOR DELETE USING (auth.uid() = user_id);

-- 注意：开启 RLS 后，匿名访问（Anon Key）将无法看到任何数据，必须通过带有有效 Session 的 Auth Token 访问。
