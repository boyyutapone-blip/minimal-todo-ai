import { createClient } from '@supabase/supabase-js'

// 强制使用 Vite 的专有语法读取环境变量
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 增加防呆检测：如果没读到，直接在控制台标红报警，而不是默默用假地址
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("🚨 致命错误：未能读取到 Supabase 环境变量！请检查 .env.local 是否在项目根目录，以及变量名是否正确。");
}

export const supabase = createClient(
  supabaseUrl || 'https://fallback.supabase.co',
  supabaseAnonKey || 'fallback-key'
);