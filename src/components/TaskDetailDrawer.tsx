import React, { useState, useEffect } from 'react';
import { X, Sparkles, Clock, Flag, Hash, Loader2, Save, ChevronDown, ChevronUp } from 'lucide-react';

import { supabase } from '../lib/supabase';

type Quadrant = 'q1' | 'q2' | 'q3' | 'q4';

export default function TaskDetailDrawer({ task, onClose, onUpdateTask }: { task: any, onClose: () => void, onUpdateTask?: (task: any) => void }) {
  const [localTitle, setLocalTitle] = useState('');
  const [localNote, setLocalNote] = useState('');
  const [localQuadrant, setLocalQuadrant] = useState<Quadrant>('q1');
  const [localTags, setLocalTags] = useState('');
  const [localIsFlagged, setLocalIsFlagged] = useState(false);
  const [localDueDate, setLocalDueDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isAILoading, setIsAILoading] = useState(false);
  const [isEditExpanded, setIsEditExpanded] = useState(false);

  useEffect(() => {
    if (task) {
      setLocalTitle(task.title || '');
      setLocalNote(task.reflection_note || '');
      setLocalQuadrant(task.quadrant || 'q1');
      setLocalTags(task.tags?.join(', ') || '');
      setLocalIsFlagged(task.isFlagged || false);
      // Convert ISO string to datetime-local format
      if (task.dueDate) {
        const d = new Date(task.dueDate);
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        const hours = d.getHours().toString().padStart(2, '0');
        const minutes = d.getMinutes().toString().padStart(2, '0');
        setLocalDueDate(`${year}-${month}-${day}T${hours}:${minutes}`);
      } else {
        setLocalDueDate('');
      }
      setIsEditExpanded(false);
    }
  }, [task]);

  const handleSave = async () => {
    if (!task || isSaving) return;
    
    // 如果标题为空，回退为原标题，防止幽灵任务
    const saveTitle = localTitle.trim() === '' ? task.title : localTitle;
    if (saveTitle !== localTitle) {
      setLocalTitle(saveTitle);
    }

    const parsedTags = localTags.split(',').map(t => t.trim()).filter(t => t);

    setIsSaving(true);

    const { data, error } = await supabase
      .from('tasks')
      .update({
        title: saveTitle,
        reflection_note: localNote,
        quadrant: localQuadrant,
        tags: parsedTags,
        is_important: localIsFlagged,
        due_date: localDueDate ? new Date(localDueDate).toISOString() : null,
      })
      .eq('id', task.id)
      .select()
      .single();

    if (error) {
      console.error("保存失败", error);
      setIsSaving(false);
      return;
    }

    if (data && onUpdateTask) {
      onUpdateTask(data); 
    }
    
    setIsSaving(false);
  };

  const handleAICoach = async () => {
    if (!task || isAILoading || isSaving) return;

    try {
      setIsAILoading(true);
      const res = await fetch('/api/generate-reflection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: task.title,
          quadrant: task.quadrant,
          tags: task.tags || []
        }),
      });

      if (!res.ok) {
        throw new Error(`后端接口报错: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();

      if (data && data.questions) {
        const newNote = localNote ? localNote + '\n\n' + data.questions : data.questions;
        setLocalNote(newNote);
        
        const saveTitle = localTitle.trim() === '' ? task.title : localTitle;
        const parsedTags = localTags.split(',').map(t => t.trim()).filter(t => t);
        const { data: updatedData, error } = await supabase
          .from('tasks')
          .update({
            title: saveTitle,
            reflection_note: newNote,
            quadrant: localQuadrant,
            tags: parsedTags,
            is_important: localIsFlagged,
            due_date: localDueDate ? new Date(localDueDate).toISOString() : null,
          })
          .eq('id', task.id)
          .select()
          .single();

        if (error) {
          console.error("AI 内容自动保存失败", error);
        } else if (updatedData && onUpdateTask) {
          onUpdateTask(updatedData);
        }
      }

    } catch (err: any) {
      console.error('AI 唤醒失败:', err);
      alert(`AI 辅助复盘生成失败: ${err.message || '未知网络错误'}`);
    } finally {
      setIsAILoading(false);
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

  const quad = quadConfig[localQuadrant] || quadConfig['q1'];

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
          {/* 元信息区：可点击展开编辑 */}
          <div className="mt-2">
            {/* 只读展示标签 */}
            <div className="flex flex-wrap items-center gap-2">
              {localDueDate && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-red-500 bg-red-50/50 dark:bg-red-900/10 border border-red-100/50 dark:border-red-900/30">
                  <Clock size={12} />
                  {formatDue(localDueDate)}
                </div>
              )}
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${quad.color}`}>
                {quad.text}
              </div>
              {localIsFlagged && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-orange-500 bg-orange-50/50 dark:bg-orange-900/10 border border-orange-100/50 dark:border-orange-900/30">
                  <Flag size={12} className="fill-orange-500" />
                  重要
                </div>
              )}
              {localTags.split(',').map(t => t.trim()).filter(t => t).map((tag: string) => (
                <div key={tag} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-[#6464f2] bg-[#6464f2]/10 border border-[#6464f2]/20">
                  <Hash size={12} />
                  {tag}
                </div>
              ))}
              
              {/* 展开/收起编辑按钮 */}
              <button 
                onClick={() => setIsEditExpanded(!isEditExpanded)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                {isEditExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {isEditExpanded ? '收起' : '编辑属性'}
              </button>
            </div>

            {/* 可展开的编辑区域 */}
            {isEditExpanded && (
              <div className="mt-3 space-y-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 animate-in slide-in-from-top-2 duration-200">
                {/* 象限选择 */}
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">所属象限</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['q1', 'q2', 'q3', 'q4'] as Quadrant[]).map(q => {
                      const qConf = quadConfig[q];
                      const isSelected = localQuadrant === q;
                      return (
                        <button
                          key={q}
                          onClick={() => setLocalQuadrant(q)}
                          className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${isSelected ? qConf.color + ' ring-2 ring-offset-1 ring-current dark:ring-offset-slate-900' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                        >
                          {qConf.text}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 标签编辑 */}
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">标签 (逗号分隔)</label>
                  <input
                    type="text"
                    value={localTags}
                    onChange={(e) => setLocalTags(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6464f2]/50 focus:border-[#6464f2] transition-colors"
                    placeholder="工作, 学习"
                  />
                </div>

                {/* 重点标记 */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setLocalIsFlagged(!localIsFlagged)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${localIsFlagged ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
                  >
                    <Flag size={14} className={localIsFlagged ? "fill-orange-500" : ""} />
                    <span className="text-xs">标记为重点</span>
                  </button>
                </div>

                {/* 开始时间编辑 */}
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">开始时间</label>
                  <input
                    type="datetime-local"
                    value={localDueDate}
                    onChange={(e) => setLocalDueDate(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6464f2]/50 focus:border-[#6464f2] transition-colors"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 标题沉浸式编辑区 */}
          <div className="mt-2">
            <textarea
              value={localTitle}
              onChange={e => setLocalTitle(e.target.value)}
              className="w-full bg-transparent border-none text-[22px] leading-snug font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-0 resize-none p-0 overflow-hidden min-h-[4rem]"
              placeholder="任务描述..."
            />
          </div>

          {/* 核心笔记区 */}
          <div className="flex-1 flex flex-col mt-2">
            <textarea
              value={localNote || ''}
              onChange={e => setLocalNote(e.target.value)}
              className="w-full flex-1 bg-transparent border-none text-slate-600 dark:text-slate-300 text-[15px] leading-relaxed focus:outline-none focus:ring-0 resize-none p-0"
              placeholder="在这里记录任务灵感或手动复盘..."
            />
          </div>
        </div>

        {/* 底部悬浮操作区 */}
        <div className="absolute bottom-8 left-6 right-6 flex items-center justify-between pointer-events-none">
          {/* 保存按钮 */}
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="pointer-events-auto flex items-center gap-2 px-5 py-3.5 rounded-xl border-2 border-[#6464f2]/30 text-[#6464f2] dark:text-[#8080ff] bg-white/80 dark:bg-slate-800/80 backdrop-blur-md font-bold shadow-sm hover:bg-[#6464f2]/10 dark:hover:bg-[#6464f2]/20 active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all shadow-[#6464f2]/10"
          >
            {isSaving ? (
              <><Loader2 size={18} className="animate-spin" /> 保存中</>
            ) : (
              <><Save size={18} /> 保存内容</>
            )}
          </button>
          
          {/* AI 魔法悬浮按钮 */}
          <button 
            onClick={handleAICoach}
            disabled={isAILoading || isSaving}
            className="pointer-events-auto flex items-center gap-2.5 px-5 py-3.5 rounded-xl bg-gradient-to-tr from-[#6464f2] to-purple-500 text-white font-bold shadow-xl shadow-purple-500/30 hover:scale-[1.02] hover:shadow-purple-500/50 active:scale-95 transition-all group disabled:opacity-75 disabled:active:scale-100 disabled:hover:scale-100"
          >
            {isAILoading ? (
              <><Loader2 size={18} className="animate-spin" /> 生成追问中</>
            ) : (
              <><Sparkles size={18} className="group-hover:animate-pulse" /> AI 复盘</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
