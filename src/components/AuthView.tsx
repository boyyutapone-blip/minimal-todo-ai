import React, { useState } from 'react';
import { Mail, Lock, AlertCircle } from 'lucide-react';

export default function AuthView({ onLogin }: { onLogin: (user: any) => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Mock login delay
    setTimeout(() => {
      setLoading(false);
      onLogin({ 
        email, 
        displayName: email.split('@')[0],
        uid: 'mock-user-123'
      });
    }, 800);
  };

  return (
    <div className="flex h-screen w-full flex-col max-w-md mx-auto bg-white shadow-xl overflow-hidden font-sans text-slate-900 dark:bg-slate-900 dark:text-white">
      <div className="flex-1 flex flex-col justify-center px-8">
        <div className="mb-10 text-center">
          <div className="w-16 h-16 bg-[#6464f2] rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-[#6464f2]/30">
            <span className="text-white text-3xl font-bold">T</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">
            {isLogin ? '欢迎回来' : '创建新账号'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            {isLogin ? '登录以继续管理您的任务' : '注册以开始您的高效之旅'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-xl flex items-center gap-2 text-sm">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">邮箱</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail size={18} className="text-slate-400" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6464f2] focus:border-transparent transition-all dark:text-white"
                placeholder="your@email.com"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">密码</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={18} className="text-slate-400" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6464f2] focus:border-transparent transition-all dark:text-white"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full bg-[#6464f2] text-white font-bold py-3.5 rounded-xl shadow-lg shadow-[#6464f2]/25 disabled:opacity-50 disabled:shadow-none transition-all active:scale-[0.98] mt-6"
          >
            {loading ? '请稍候...' : (isLogin ? '登录' : '注册')}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            className="text-sm text-slate-500 dark:text-slate-400 hover:text-[#6464f2] dark:hover:text-[#6464f2] transition-colors"
          >
            {isLogin ? '没有账号？点击注册' : '已有账号？点击登录'}
          </button>
        </div>
      </div>
    </div>
  );
}
