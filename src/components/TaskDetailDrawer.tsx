import React, { useState, useEffect } from 'react';
import { X, Sparkles, Clock, Flag, Hash } from 'lucide-react';

import { supabase } from '../lib/supabase';

export default function TaskDetailDrawer({ task, onClose, onUpdateTask }: { task: any, onClose: () => void, onUpdateTask?: (task: any) => void }) {
  const [localTitle, setLocalTitle] = useState('');
  const [localNote, setLocalNote] = useState('');

  useEffect(() => {
    if (task) {
      setLocalTitle(task.title || '');
      setLocalNote(task.reflection_note || '');
    }
  }, [task]);

  const handleBlur = async () => {
    if (!task) return;
    
    // 如果标题为空，回退为原标题，防止幽灵任务
    const saveTitle = localTitle.trim() === '' ? task.title : localTitle;
    if (saveTitle !== localTitle) {
      setLocalTitle(saveTitle);
    }

    // 检查是否有实质性改变
    if (saveTitle === task.title && localNote === (task.reflection_note || '')) {
      return; 
    }

    try {
      const { data, error } = await supabase
        .from('tasks')
        .update({ title: saveTitle, reflection_note: localNote })
        .eq('id', task.id)
        .select()
        .single();

      if (error) throw error;
      
      // 成功后，同步将最新状态给上层
      if (data && onUpdateTask) {
        onUpdateTask(data);
      }
    } catch (err) {
      console.error('保存任务详情失败:', err);
    }
  };

  if (!task) return null;

  // 极简风格象限颜色映射
  const quadConfig: Record<string, { text: string; color: string }> = {
    q1: { text: '重要且紧急', color: 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30 border-red-200 dark:border-red-800' },
    q2: { text: '重要不紧急', color: 'text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800' },
    q3: { text: '不重要紧急', color: 'text-blue-700 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800' },
    q4: { text: '不重要不紧急', color: 'text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800' },
  };

  const quad = quadConfig[task.quadrant] || quadConfig['q1'];

  const formatDue = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end font-sans">
      {/* 半透明遮罩层 (点击关闭) */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300" 
        onClick={onClose} 
      />
      
      {/* 侧滑抽屉主体 */}
      <div className="relative w-[85vw] max-w-md h-full bg-white dark:bg-slate-900 shadow-[-10px_0_40px_rgba(0,0,0,0.15)] dark:shadow-[-10px_0_40px_rgba(0,0,0,0.5)] flex flex-col animate-in slide-in-from-right duration-300">
        
        {/* 顶部导航 */}
        <div className="flex items-center justify-between px-5 pt-6 pb-2 shrink-0">
          <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
            <span className="text-xs font-bold uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">收集箱</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-32 flex flex-col gap-5">
          {/* 元信息区：紧凑横向排列 */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {task.dueDate && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-red-500 bg-red-50/50 dark:bg-red-900/10 border border-red-100/50 dark:border-red-900/30">
                <Clock size={12} />
                {formatDue(task.dueDate)}
              </div>
            )}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${quad.color}`}>
              {quad.text}
            </div>
            {task.isFlagged && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-orange-500 bg-orange-50/50 dark:bg-orange-900/10 border border-orange-100/50 dark:border-orange-900/30">
                <Flag size={12} className="fill-orange-500" />
                重要
              </div>
            )}
            {task.tags?.map((tag: string) => (
              <div key={tag} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-[#6464f2] bg-[#6464f2]/10 border border-[#6464f2]/20">
                <Hash size={12} />
                {tag}
              </div>
            ))}
          </div>

          {/* 标题沉浸式编辑区 */}
          <div className="mt-2">
            <textarea
              value={localTitle}
              onChange={e => setLocalTitle(e.target.value)}
              onBlur={handleBlur}
              className="w-full bg-transparent border-none text-[22px] leading-snug font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-0 resize-none p-0 overflow-hidden min-h-[4rem]"
              placeholder="任务描述..."
            />
          </div>

          {/* 核心笔记区 */}
          <div className="flex-1 flex flex-col mt-2">
            <textarea
              value={localNote}
              onChange={e => setLocalNote(e.target.value)}
              onBlur={handleBlur}
              className="w-full flex-1 bg-transparent border-none text-slate-600 dark:text-slate-300 text-[15px] leading-relaxed focus:outline-none focus:ring-0 resize-none p-0"
              placeholder="在这里记录任务灵感或手动复盘..."
            />
          </div>
        </div>

        {/* AI 魔法悬浮按钮 */}
        <button 
          onClick={() => console.log('唤起 AI')}
          className="absolute bottom-8 right-6 z-10 flex items-center gap-2.5 px-5 py-3.5 rounded-2xl bg-gradient-to-tr from-[#6464f2] to-purple-500 text-white font-bold shadow-xl shadow-purple-500/30 hover:scale-[1.02] hover:shadow-purple-500/50 active:scale-95 transition-all group"
        >
          <Sparkles size={18} className="group-hover:animate-pulse" />
          AI 辅助复盘
        </button>
      </div>
    </div>
  );
}
