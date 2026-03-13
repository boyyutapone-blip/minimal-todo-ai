import React, { useState } from 'react';
import { Mail, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AuthView() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        // 登录逻辑
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      } else {
        // 注册逻辑
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
        if (!isLogin) {
          setError('注册成功！请检查邮箱确认邮件或直接尝试登录。');
        }
      }
    } catch (err: any) {
      console.error('认证错误:', err.message);
      setError(err.message || '操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full flex-col justify-center items-center bg-[#f8f8fc] dark:bg-slate-900 font-sans text-slate-900 p-4 transition-colors">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-2xl border border-slate-100 dark:border-slate-800 transition-colors">
        <div className="mb-8 text-center">
          <div className="w-16 h-16 bg-[#6464f2] rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-[#6464f2]/30">
            <span className="text-white text-3xl font-bold italic">A</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2 dark:text-white">
            {isLogin ? '极简待办' : '加入极客行列'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isLogin ? '输入您的账号开启高效一天' : '创建一个云端同步的专属空间'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className={`p-3 rounded-xl flex items-center gap-2 text-sm ${error.includes('成功') ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">邮箱地址</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Mail size={18} className="text-slate-400" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-[#6464f2]/30 dark:focus:border-[#6464f2]/50 rounded-2xl focus:outline-none transition-all dark:text-white placeholder:text-slate-300"
                placeholder="geek@example.com"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">进入密码</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Lock size={18} className="text-slate-400" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-[#6464f2]/30 dark:focus:border-[#6464f2]/50 rounded-2xl focus:outline-none transition-all dark:text-white placeholder:text-slate-300"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full bg-[#6464f2] hover:bg-[#5a5add] text-white font-bold py-4 rounded-2xl shadow-xl shadow-[#6464f2]/20 disabled:opacity-50 disabled:shadow-none transition-all active:scale-[0.98] mt-6 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : (isLogin ? '安全登录' : '创建账号')}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            className="text-sm font-semibold text-slate-400 hover:text-[#6464f2] transition-colors"
          >
            {isLogin ? '还没有账号？极速注册' : '已有账号？返回登录'}
          </button>
        </div>
      </div>
      
      <p className="mt-8 text-xs text-slate-400 dark:text-slate-600 font-mono tracking-tighter">
        VITE_APP_TODO // MULTI_TENANT_SECURE_CHANNEL
      </p>
    </div>
  );
}
