import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Menu, Search, MoreHorizontal, CheckSquare, LayoutGrid, Timer, Settings,
  Plus, Calendar, Flag, User, AlertCircle, Trash2, Coffee, Wind, Edit3, BarChart2, Check, UserPlus, X, Mic,
  ChevronRight, ChevronLeft, Bell, Moon, Globe, Shield, HelpCircle, LogOut, Camera, Loader2, Clock
} from 'lucide-react';
import AuthView from './components/AuthView';
import { supabase } from './lib/supabase';

type Tab = 'list' | 'grid' | 'calendar' | 'timer' | 'settings';
type Quadrant = 'q1' | 'q2' | 'q3' | 'q4';

interface Task {
  id: string;
  title: string;
  completed: boolean;
  quadrant: Quadrant;
  tags?: string[];
  isFlagged?: boolean;
  dueDate?: string | null;
}

// DB row type returned from Supabase
interface TaskRow {
  id: string;
  title: string;
  is_completed: boolean;
  quadrant: Quadrant;
  tags: string[];
  is_important: boolean;
  due_date: string | null;
  created_at: string;
}

// AI 解析返回的单个任务
interface ParsedTask {
  title: string;
  quadrant: string;
  tags: string[];
  is_important: boolean;
  due_date: string | null;
}

// Map Supabase row → frontend Task
const mapRowToTask = (row: TaskRow): Task => ({
  id: row.id,
  title: row.title,
  completed: row.is_completed,
  quadrant: row.quadrant,
  tags: row.tags || [],
  isFlagged: row.is_important,
  dueDate: row.due_date,
});

// ── 格式化 due_date 显示 ──
const formatDueDate = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const hhmm = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
  const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (isToday) return `今天 ${hhmm}`;
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.getFullYear() === tomorrow.getFullYear() && d.getMonth() === tomorrow.getMonth() && d.getDate() === tomorrow.getDate();
  if (isTomorrow) return `明天 ${hhmm}`;
  return `${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${hhmm}`;
};

// ============================================
// Toast 组件
// ============================================
const Toast = ({ message, onClose }: { message: string; onClose: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] max-w-sm w-full px-4 animate-in slide-in-from-top-2 duration-200">
      <div className="bg-red-500 text-white px-5 py-3 rounded-xl shadow-xl shadow-red-500/25 flex items-center gap-3 text-sm font-medium">
        <AlertCircle size={18} className="shrink-0" />
        <span className="flex-1">{message}</span>
        <button onClick={onClose} className="shrink-0 opacity-70 hover:opacity-100"><X size={16} /></button>
      </div>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('list');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);

  const [user, setUser] = useState<any | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // ── 监听 Auth 状态变化 ──
  useEffect(() => {
    // 获取初始 Session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsAuthReady(true);
    });

    // 订阅状态变更
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session) {
        fetchTasks();
      } else {
        setTasks([]); // 登出清空数据
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Timer State
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [timerMode, setTimerMode] = useState<'focus' | 'shortBreak' | 'longBreak'>('focus');
  const [pomodoroCount, setPomodoroCount] = useState(0);

  // Date Filtering State for List View
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);

  // ── 从 Supabase 加载任务 ──
  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('加载任务失败:', error.message);
    } else {
      setTasks((data as TaskRow[]).map(mapRowToTask));
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((time) => time - 1);
      }, 1000);
    } else if (timeLeft === 0 && isTimerActive) {
      setIsTimerActive(false);
      if (timerMode === 'focus') {
        setPomodoroCount(prev => prev + 1);
      }
    }
    return () => clearInterval(interval);
  }, [isTimerActive, timeLeft, timerMode]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // ── 切换任务完成状态（同步 Supabase） ──
  const toggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const newCompleted = !task.completed;

    // 乐观更新 UI
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: newCompleted } : t));

    const { error } = await supabase
      .from('tasks')
      .update({ is_completed: newCompleted })
      .eq('id', id);

    if (error) {
      console.error('更新任务状态失败:', error.message);
      // 回滚
      setTasks(tasks.map(t => t.id === id ? { ...t, completed: !newCompleted } : t));
    }
  };

  // ── 新增单个任务（手动新建用） ──
  const addTask = async (newTask: Omit<Task, 'id' | 'completed'>) => {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: newTask.title,
        quadrant: newTask.quadrant,
        tags: newTask.tags || [],
        is_important: newTask.isFlagged || false,
        is_completed: false,
        due_date: newTask.dueDate || null,
      })
      .select()
      .single();

    if (error) {
      console.error('创建任务失败:', error.message);
      return;
    }

    setTasks(prev => [mapRowToTask(data as TaskRow), ...prev]);
    setIsTaskModalOpen(false);
    setIsVoiceModalOpen(false);
  };

  // ── 批量插入任务（AI 语音分拣用） ──
  const addTasks = async (parsedTasks: ParsedTask[]) => {
    const rows = parsedTasks.map(t => ({
      title: t.title,
      quadrant: t.quadrant,
      tags: t.tags || [],
      is_important: t.is_important || false,
      is_completed: false,
      due_date: t.due_date || null,
    }));

    const { data, error } = await supabase
      .from('tasks')
      .insert(rows)
      .select();

    if (error) {
      console.error('批量创建任务失败:', error.message);
      setToastMessage('任务写入数据库失败: ' + error.message);
      return;
    }

    const newTasks = (data as TaskRow[]).map(mapRowToTask);
    setTasks(prev => [...newTasks, ...prev]);
    setIsVoiceModalOpen(false);
  };

  // ── 删除任务 ──
  const deleteTask = async (id: string) => {
    if (!window.confirm('确定要彻底删除该任务吗？')) return;
    setTasks(prev => prev.filter(t => t.id !== id));
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) {
      console.error('删除任务失败:', error.message);
      fetchTasks(); // rollback by re-fetching
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    pressTimer.current = setTimeout(() => {
      setIsVoiceModalOpen(true);
      pressTimer.current = null;
    }, 500);
  };

  const handlePointerUp = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
      setIsTaskModalOpen(true);
    }
  };

  const handlePointerLeave = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const toggleTimer = () => setIsTimerActive(!isTimerActive);

  const handleSetTimerMode = (newMode: 'focus' | 'shortBreak' | 'longBreak') => {
    setTimerMode(newMode);
    setIsTimerActive(false);
    if (newMode === 'focus') setTimeLeft(25 * 60);
    if (newMode === 'shortBreak') setTimeLeft(5 * 60);
    if (newMode === 'longBreak') setTimeLeft(15 * 60);
  };

  if (!isAuthReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8f8fc] dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[#6464f2] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 text-sm font-medium animate-pulse">建立安全连接...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  return (
    <div className="relative flex h-screen w-full flex-col max-w-md mx-auto bg-[#f8f8fc] dark:bg-slate-900 shadow-xl overflow-hidden font-sans text-slate-900 dark:text-white transition-colors">
      {/* Toast */}
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

      {activeTab === 'list' && (
        <TodayTasks
          tasks={tasks}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          toggleTask={toggleTask}
          deleteTask={deleteTask}
        />
      )}
      {activeTab === 'grid' && <QuadrantView tasks={tasks} toggleTask={toggleTask} deleteTask={deleteTask} />}
      {activeTab === 'calendar' && <CalendarView tasks={tasks} toggleTask={toggleTask} deleteTask={deleteTask} />}
      {activeTab === 'timer' && (
        <TimerView
          timeLeft={timeLeft}
          isActive={isTimerActive}
          mode={timerMode}
          toggleTimer={toggleTimer}
          setTimerMode={handleSetTimerMode}
          pomodoroCount={pomodoroCount}
        />
      )}
      {activeTab === 'settings' && <SettingsView user={user} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} onLogout={() => supabase.auth.signOut()} />}

      {/* FAB */}
      {activeTab !== 'settings' && activeTab !== 'timer' && (
        <button
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          className="absolute bottom-24 right-6 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-[#6464f2] text-white shadow-lg shadow-[#6464f2]/40 hover:scale-105 active:scale-95 transition-transform select-none touch-none"
        >
          <Plus size={28} />
        </button>
      )}

      {/* Task Modal */}
      {isTaskModalOpen && (
        <TaskModal
          onClose={() => setIsTaskModalOpen(false)}
          onSave={addTask}
        />
      )}

      {/* Voice Modal */}
      {isVoiceModalOpen && (
        <VoiceModal
          onClose={() => setIsVoiceModalOpen(false)}
          onBulkSave={addTasks}
          onToast={setToastMessage}
        />
      )}

      {/* Bottom Nav */}
      <nav className="absolute bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-2 pb-6 pt-3 transition-colors">
        <NavItem icon={<CheckSquare size={24} />} active={activeTab === 'list'} onClick={() => setActiveTab('list')} />
        <NavItem icon={<LayoutGrid size={24} />} active={activeTab === 'grid'} onClick={() => setActiveTab('grid')} />
        <NavItem icon={<Calendar size={24} />} active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} />
        <NavItem icon={<Timer size={24} />} active={activeTab === 'timer'} onClick={() => setActiveTab('timer')} />
        <NavItem icon={<Settings size={24} />} active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
      </nav>
    </div>
  );
}

const NavItem = ({ icon, active, onClick }: { icon: React.ReactNode, active: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`flex flex-1 items-center justify-center h-12 transition-colors ${active ? 'text-[#6464f2]' : 'text-slate-400 hover:text-[#6464f2]/70'}`}
  >
    {icon}
  </button>
);

const TodayTasks = ({ tasks, selectedDate, setSelectedDate, toggleTask, deleteTask }: {
  tasks: Task[],
  selectedDate: string,
  setSelectedDate: (d: string) => void,
  toggleTask: (id: string) => void,
  deleteTask: (id: string) => void
}) => {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (!t.dueDate) return false;
      return t.dueDate.startsWith(selectedDate);
    });
  }, [tasks, selectedDate]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden transition-colors">
      <header className="flex items-center justify-between bg-[#f8f8fc]/80 dark:bg-slate-900/80 backdrop-blur-md px-4 py-3 shrink-0 transition-colors">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Menu
              className="text-slate-600 dark:text-slate-300 cursor-pointer hover:text-[#6464f2] transition-colors"
              size={24}
              onClick={() => dateInputRef.current?.showPicker()}
            />
            <input
              ref={dateInputRef}
              type="date"
              className="absolute opacity-0 pointer-events-none w-0 h-0"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <h1 className="text-xl font-bold tracking-tight dark:text-white">
            {isToday ? '今天' : selectedDate.slice(5)}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <Search className="text-slate-600 dark:text-slate-300 cursor-pointer" size={24} />
          <MoreHorizontal className="text-slate-600 dark:text-slate-300 cursor-pointer" size={24} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-32">
        <div className="flex items-center gap-2 py-4">
          <Calendar className="text-[#6464f2]" size={16} />
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {isToday ? '今日任务' : `${selectedDate} 任务`}
          </h2>
        </div>

        <div className="space-y-3">
          {filteredTasks.length === 0 ? (
            <div className="py-12 flex flex-col items-center opacity-40">
              <CheckSquare size={48} className="mb-2" />
              <p className="text-sm">该日暂无待办</p>
            </div>
          ) : (
            <>
              {filteredTasks.filter(t => !t.completed).map(task => (
                <TaskItem key={task.id} task={task} toggleTask={toggleTask} deleteTask={deleteTask} />
              ))}
              {filteredTasks.filter(t => t.completed).map(task => (
                <TaskItem key={task.id} task={task} toggleTask={toggleTask} deleteTask={deleteTask} />
              ))}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

const TaskItem = ({ task, toggleTask, deleteTask }: { task: Task, toggleTask: (id: string) => void, deleteTask: (id: string) => void }) => {
  const longPressRef = useRef<NodeJS.Timeout | null>(null);

  const handlePointerDown = () => {
    longPressRef.current = setTimeout(() => {
      deleteTask(task.id);
      longPressRef.current = null;
    }, 500);
  };
  const handlePointerUp = () => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      className={`flex items-center gap-4 p-4 rounded-xl shadow-sm border transition-colors select-none touch-none ${task.completed ? 'bg-transparent opacity-60 border-transparent' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700'}`}
    >
      <div className="relative flex items-center shrink-0">
        <div
          onClick={() => toggleTask(task.id)}
          className={`h-6 w-6 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all ${task.completed ? 'bg-[#6464f2] border-[#6464f2]' : 'border-slate-300 dark:border-slate-600 bg-transparent'}`}
        >
          {task.completed && <Check size={14} strokeWidth={3} className="text-white" />}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-base font-medium truncate transition-colors ${task.completed ? 'text-slate-500 dark:text-slate-500 line-through' : 'text-slate-800 dark:text-slate-200'}`}>
          {task.title}
        </p>
        {task.dueDate && (
          <p className="flex items-center gap-1 mt-1 text-xs text-slate-400 dark:text-slate-500">
            <Clock size={11} />
            {formatDueDate(task.dueDate)}
          </p>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {task.isFlagged && <Flag size={14} className="text-orange-400 fill-orange-400" />}
        {task.tags?.map(tag => (
          <span key={tag} className="text-xs font-medium text-[#6464f2] dark:text-indigo-300 bg-[#6464f2]/10 dark:bg-[#6464f2]/20 px-2 py-1 rounded transition-colors">
            {tag}
          </span>
        ))}
        {task.completed && (
          <span className="text-xs font-medium text-slate-400 dark:text-slate-500 px-2 py-1">已完成</span>
        )}
      </div>
    </div>
  );
};

const QuadrantView = ({ tasks, toggleTask, deleteTask }: { tasks: Task[], toggleTask: (id: string) => void, deleteTask: (id: string) => void }) => {
  const systemToday = new Date().toISOString().split('T')[0];

  const todayTasks = useMemo(() => {
    return tasks.filter(t => t.dueDate?.startsWith(systemToday));
  }, [tasks, systemToday]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden transition-colors">
      <header className="flex items-center bg-white dark:bg-slate-900 px-4 py-3 border-b border-slate-200 dark:border-slate-800 justify-between shrink-0 transition-colors">
        <div className="text-slate-700 dark:text-slate-300 flex size-10 shrink-0 items-center justify-center">
          <Menu size={24} className="cursor-pointer" />
        </div>
        <h2 className="text-slate-900 dark:text-white text-lg font-bold leading-tight tracking-tight flex-1 text-center">今日工作台</h2>
        <div className="flex w-10 items-center justify-end">
          <button className="flex items-center justify-center rounded-lg h-10 w-10 bg-transparent text-slate-700 dark:text-slate-300">
            <User size={24} />
          </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-2 grid-rows-2 gap-2 p-3 overflow-hidden pb-24">
        <QuadrantCard
          title="重要且紧急"
          icon={<AlertCircle size={12} className="text-white" />}
          colorClass="bg-red-50/50 dark:bg-red-950/20 border-red-100 dark:border-red-900/30"
          headerClass="bg-red-500 dark:bg-red-600/80"
          tasks={todayTasks.filter(t => t.quadrant === 'q1')}
          toggleTask={toggleTask}
        />
        <QuadrantCard
          title="重要不紧急"
          icon={<Calendar size={12} className="text-white" />}
          colorClass="bg-amber-50/50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30"
          headerClass="bg-amber-500 dark:bg-amber-600/80"
          tasks={todayTasks.filter(t => t.quadrant === 'q2')}
          toggleTask={toggleTask}
        />
        <QuadrantCard
          title="不重要但紧急"
          icon={<UserPlus size={12} className="text-white" />}
          colorClass="bg-blue-50/50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/30"
          headerClass="bg-blue-500 dark:bg-blue-600/80"
          tasks={todayTasks.filter(t => t.quadrant === 'q3')}
          toggleTask={toggleTask}
        />
        <QuadrantCard
          title="不重要不紧急"
          icon={<Trash2 size={12} className="text-white" />}
          colorClass="bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30"
          headerClass="bg-emerald-500 dark:bg-emerald-600/80"
          tasks={todayTasks.filter(t => t.quadrant === 'q4')}
          toggleTask={toggleTask}
        />
      </main>
    </div>
  );
};

const QuadrantCard = ({ title, icon, colorClass, headerClass, tasks, toggleTask }: any) => {
  return (
    <section className={`flex flex-col rounded-xl border overflow-hidden transition-colors ${colorClass}`}>
      <div className={`${headerClass} px-2.5 py-1.5 flex items-center gap-1.5 shrink-0 transition-colors`}>
        {icon}
        <h3 className="text-white text-[10px] font-bold uppercase tracking-wider">{title}</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
        {tasks.map((task: Task) => (
          <div key={task.id} className="bg-white/80 dark:bg-slate-800/80 p-1.5 px-2 rounded-md shadow-sm border border-slate-100 dark:border-slate-700/50 flex items-start gap-1.5 transition-colors backdrop-blur-sm">
            <div
              onClick={() => toggleTask(task.id)}
              className={`mt-[2px] shrink-0 h-3.5 w-3.5 rounded-[3px] border flex items-center justify-center cursor-pointer transition-colors ${task.completed ? headerClass + ' border-transparent' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'}`}
            >
              {task.completed && <Check size={8} strokeWidth={3} className="text-white" />}
            </div>
            <p className={`text-[11px] font-medium leading-snug transition-colors line-clamp-2 ${task.completed ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'}`}>{task.title}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

// ============================================
// 日历视图（紫色极简极客风）
// ============================================
const CalendarView = ({ tasks, toggleTask, deleteTask }: { tasks: Task[], toggleTask: (id: string) => void, deleteTask: (id: string) => void }) => {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(today.getDate());

  // 当月天数 & 第一天星期几
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();

  // 哪些日期有任务（基于 due_date）
  const taskDateSet = useMemo(() => {
    const set = new Set<number>();
    tasks.forEach(t => {
      if (t.dueDate) {
        const d = new Date(t.dueDate);
        if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
          set.add(d.getDate());
        }
      }
    });
    return set;
  }, [tasks, viewYear, viewMonth]);

  // 选中日期的任务列表
  const selectedTasks = useMemo(() => {
    return tasks.filter(t => {
      if (!t.dueDate) return false;
      const d = new Date(t.dueDate);
      return d.getFullYear() === viewYear && d.getMonth() === viewMonth && d.getDate() === selectedDate;
    });
  }, [tasks, viewYear, viewMonth, selectedDate]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
    setSelectedDate(1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
    setSelectedDate(1);
  };

  const isToday = (day: number) => viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate();
  const isSelected = (day: number) => day === selectedDate;
  const weekLabels = ['日', '一', '二', '三', '四', '五', '六'];
  const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden transition-colors">
      {/* 月历头部 */}
      <header className="flex items-center justify-between bg-white dark:bg-slate-900 px-5 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
          {viewYear}年{monthNames[viewMonth]}
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors">
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); setSelectedDate(today.getDate()); }}
            className="px-3 py-1 text-xs font-semibold text-[#6464f2] bg-[#6464f2]/10 rounded-lg hover:bg-[#6464f2]/20 transition-colors"
          >今天</button>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors">
            <ChevronRight size={20} />
          </button>
        </div>
      </header>

      {/* 月历网格 */}
      <div className="bg-white dark:bg-slate-900 px-3 pt-2 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
        {/* 星期标签 */}
        <div className="grid grid-cols-7 mb-1">
          {weekLabels.map(w => (
            <div key={w} className="text-center text-[10px] font-semibold text-slate-400 dark:text-slate-500 py-1 uppercase">{w}</div>
          ))}
        </div>
        {/* 日期格子 */}
        <div className="grid grid-cols-7">
          {/* 空白占位 */}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`e-${i}`} className="h-10" />
          ))}
          {/* 天数 */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const sel = isSelected(day);
            const tod = isToday(day);
            const hasTasks = taskDateSet.has(day);
            return (
              <button
                key={day}
                onClick={() => setSelectedDate(day)}
                className={`relative flex flex-col items-center justify-center h-10 rounded-xl text-sm font-medium transition-all
                  ${sel ? 'bg-[#6464f2] text-white shadow-md shadow-[#6464f2]/30' : tod ? 'text-[#6464f2] font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}
                `}
              >
                {day}
                {hasTasks && (
                  <span className={`absolute bottom-0.5 w-1 h-1 rounded-full ${sel ? 'bg-white' : 'bg-[#6464f2]'}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 选中日期的任务列表 */}
      <div className="flex-1 overflow-y-auto px-4 pb-32 bg-[#f8f8fc] dark:bg-slate-900">
        <div className="flex items-center gap-2 py-3">
          <Calendar className="text-[#6464f2]" size={14} />
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            {isToday(selectedDate) ? '今天' : `${viewMonth + 1}月${selectedDate}日`}
            <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">({selectedTasks.length} 项)</span>
          </h3>
        </div>

        {selectedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-600">
            <Calendar size={32} className="mb-2 opacity-40" />
            <p className="text-sm">该日暂无任务</p>
          </div>
        ) : (
          <div className="space-y-3">
            {selectedTasks.filter(t => !t.completed).map(task => (
              <TaskItem key={task.id} task={task} toggleTask={toggleTask} deleteTask={deleteTask} />
            ))}
            {selectedTasks.some(t => t.completed) && (
              <div className="flex items-center gap-2 pt-2 pb-1">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                <span className="text-xs font-medium text-slate-400 dark:text-slate-500">已完成</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              </div>
            )}
            {selectedTasks.filter(t => t.completed).map(task => (
              <TaskItem key={task.id} task={task} toggleTask={toggleTask} deleteTask={deleteTask} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const TimerView = ({
  timeLeft,
  isActive,
  mode,
  toggleTimer,
  setTimerMode,
  pomodoroCount
}: {
  timeLeft: number,
  isActive: boolean,
  mode: 'focus' | 'shortBreak' | 'longBreak',
  toggleTimer: () => void,
  setTimerMode: (m: 'focus' | 'shortBreak' | 'longBreak') => void,
  pomodoroCount: number
}) => {
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const totalTime = mode === 'focus' ? 25 * 60 : mode === 'shortBreak' ? 5 * 60 : 15 * 60;
  const progress = ((totalTime - timeLeft) / totalTime) * 100;
  const radius = 130;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-slate-900 transition-colors">
      <header className="flex items-center justify-between px-6 pt-8 pb-4 shrink-0">
        <button className="text-slate-600 dark:text-slate-400">
          <Settings size={24} />
        </button>
        <div className="flex flex-col items-center">
          <h1 className="text-lg font-bold tracking-tight dark:text-white">专注计时</h1>
          <span className="text-xs font-medium text-[#6464f2] bg-[#6464f2]/10 px-2 py-0.5 rounded-full mt-1">
            今日完成: {pomodoroCount} 个番茄钟
          </span>
        </div>
        <button className="text-slate-600 dark:text-slate-400">
          <BarChart2 size={24} />
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-24">
        <div className="relative flex items-center justify-center w-72 h-72">
          <svg className="absolute w-full h-full -rotate-90">
            <circle
              cx="144" cy="144" r={radius}
              fill="transparent" strokeWidth="8"
              className="text-[#6464f2]/10 stroke-current"
            />
            <circle
              cx="144" cy="144" r={radius}
              fill="transparent" strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="text-[#6464f2] stroke-current transition-all duration-300 ease-linear"
            />
          </svg>
          <div className="flex flex-col items-center">
            <span className="text-6xl font-bold tracking-tighter text-slate-900 dark:text-white">{formatTime(timeLeft)}</span>
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-2 tracking-widest">
              {mode === 'focus' ? '专注中' : mode === 'shortBreak' ? '短休中' : '长休中'}
            </span>
          </div>
        </div>

        <section className="w-full mt-12 flex flex-col items-center gap-4">
          <button
            onClick={toggleTimer}
            className="w-full bg-[#6464f2] hover:bg-[#6464f2]/90 text-white h-14 rounded-xl text-lg font-bold shadow-lg shadow-[#6464f2]/25 flex items-center justify-center transition-all active:scale-[0.98]"
          >
            <span>{isActive ? '暂停' : mode === 'focus' ? '开始专注' : '开始休息'}</span>
          </button>

          <div className="flex gap-4 w-full">
            <button
              onClick={() => setTimerMode('focus')}
              className={`flex-1 flex flex-col items-center justify-center py-3 rounded-xl transition-colors ${mode === 'focus' ? 'bg-[#6464f2]/10 border-[#6464f2]/20 border' : 'bg-slate-100 dark:bg-slate-800'}`}
            >
              <Timer size={20} className="text-slate-600 dark:text-slate-300 mb-1" />
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">专注</span>
            </button>
            <button
              onClick={() => setTimerMode('shortBreak')}
              className={`flex-1 flex flex-col items-center justify-center py-3 rounded-xl transition-colors ${mode === 'shortBreak' ? 'bg-[#6464f2]/10 border-[#6464f2]/20 border' : 'bg-slate-100 dark:bg-slate-800'}`}
            >
              <Coffee size={20} className="text-slate-600 dark:text-slate-300 mb-1" />
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">短休</span>
            </button>
            <button
              onClick={() => setTimerMode('longBreak')}
              className={`flex-1 flex flex-col items-center justify-center py-3 rounded-xl transition-colors ${mode === 'longBreak' ? 'bg-[#6464f2]/10 border-[#6464f2]/20 border' : 'bg-slate-100 dark:bg-slate-800'}`}
            >
              <Wind size={20} className="text-slate-600 dark:text-slate-300 mb-1" />
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">长休</span>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

const TaskModal = ({ onClose, onSave }: { onClose: () => void, onSave: (task: Omit<Task, 'id' | 'completed'>) => void }) => {
  const [title, setTitle] = useState('');
  const [quadrant, setQuadrant] = useState<Quadrant>('q1');
  const [tags, setTags] = useState<string>('');
  const [isFlagged, setIsFlagged] = useState(false);
  const [dueDate, setDueDate] = useState('');

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      quadrant,
      tags: tags.split(',').map(t => t.trim()).filter(t => t),
      isFlagged,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
    });
  };

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200 transition-colors">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">新建任务</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X size={24} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">任务名称</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#6464f2]/50 focus:border-[#6464f2] transition-colors"
              placeholder="准备下周的演示文稿..."
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">所属象限</label>
            <div className="grid grid-cols-2 gap-2">
              <QuadrantOption selected={quadrant === 'q1'} onClick={() => setQuadrant('q1')} label="重要且紧急" color="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" />
              <QuadrantOption selected={quadrant === 'q2'} onClick={() => setQuadrant('q2')} label="重要不紧急" color="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800" />
              <QuadrantOption selected={quadrant === 'q3'} onClick={() => setQuadrant('q3')} label="不重要但紧急" color="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800" />
              <QuadrantOption selected={quadrant === 'q4'} onClick={() => setQuadrant('q4')} label="不重要不紧急" color="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">标签 (用逗号分隔)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#6464f2]/50 focus:border-[#6464f2] transition-colors"
              placeholder="工作, 今天"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={() => setIsFlagged(!isFlagged)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${isFlagged ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
            >
              <Flag size={16} className={isFlagged ? "fill-orange-500" : ""} />
              <span className="text-sm font-medium">标记为重点</span>
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">截止时间</label>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#6464f2]/50 focus:border-[#6464f2] transition-colors"
            />
          </div>
        </div>

        <div className="mt-8">
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="w-full bg-[#6464f2] text-white font-bold py-3 rounded-xl shadow-lg shadow-[#6464f2]/25 disabled:opacity-50 disabled:shadow-none transition-all active:scale-[0.98]"
          >
            保存任务
          </button>
        </div>
      </div>
    </div>
  );
};

const QuadrantOption = ({ selected, onClick, label, color }: any) => (
  <button
    onClick={onClick}
    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${selected ? color + ' ring-2 ring-offset-1 ring-current dark:ring-offset-slate-900' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
  >
    {label}
  </button>
);

const VoiceModal = ({ onClose, onBulkSave, onToast }: {
  onClose: () => void;
  onBulkSave: (tasks: ParsedTask[]) => Promise<void>;
  onToast: (msg: string) => void;
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const recognitionRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 初始化 Web Speech API
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = true;

    // 使用 ref 记录已确定的最终文字，避免 setTranscript 闭包导致重复拼接
    let finalTranscriptBuffer = '';

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let currentFinal = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptChunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          currentFinal += transcriptChunk;
        } else {
          interimTranscript += transcriptChunk;
        }
      }

      finalTranscriptBuffer += currentFinal;
      // 最终展示 = 累积的 Final + 当前正在识别的 Interim
      setTranscript(finalTranscriptBuffer + interimTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error('语音识别错误:', event.error);
      if (event.error === 'not-allowed') {
        onToast('麦克风权限被拒绝');
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        try { recognitionRef.current.stop(); } catch { }
        recognitionRef.current = null;
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [onToast]);

  const toggleRecording = () => {
    if (!recognitionRef.current) return;
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      setTranscript('');
      setParseError('');
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  // 15 秒超时的 fetch wrapper
  const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs = 15000): Promise<Response> => {
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error('AI 解析超时（超过 15 秒未响应），请重试');
      }
      throw err;
    }
  };

  // 调用 /api/parse-task → 获取任务数组 → 批量写入
  const handleSave = async () => {
    if (!transcript.trim()) return;
    setIsParsing(true);
    setParseError('');

    try {
      const res = await fetchWithTimeout('/api/parse-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcript.trim() }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `请求失败 (${res.status})`);
      }

      const parsed: ParsedTask[] = await res.json();

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('AI 未返回有效的任务数据');
      }

      // 批量写入 Supabase
      await onBulkSave(parsed);
    } catch (err: any) {
      console.error('AI 解析失败:', err);
      const msg = err.message || 'AI 解析失败，请重试';
      setParseError(msg);
      onToast(msg);
    } finally {
      setIsParsing(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200 transition-colors">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">语音输入</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-col items-center justify-center py-8">
          <div className={`relative flex items-center justify-center w-24 h-24 rounded-full mb-6 transition-all ${isRecording ? 'bg-[#6464f2]/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
            {isRecording && (
              <>
                <div className="absolute inset-0 rounded-full border-2 border-[#6464f2] animate-ping opacity-20"></div>
                <div className="absolute inset-2 rounded-full border-2 border-[#6464f2] animate-ping opacity-40" style={{ animationDelay: '0.2s' }}></div>
              </>
            )}
            <button
              onClick={toggleRecording}
              className={`relative z-10 flex items-center justify-center w-16 h-16 rounded-full text-white shadow-lg transition-colors ${isRecording ? 'bg-[#6464f2]' : 'bg-slate-400 dark:bg-slate-600'}`}
            >
              <Mic size={32} />
            </button>
          </div>

          {/* 文本输入（支持手动输入 + 语音识别结果） */}
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={recognitionRef.current ? '点击麦克风开始说话，或直接输入文本...' : '请输入任务描述文本...'}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-3 min-h-[5rem] resize-none focus:outline-none focus:ring-2 focus:ring-[#6464f2]/50 focus:border-[#6464f2] transition-colors text-sm"
          />

          {parseError && (
            <p className="text-red-500 text-sm mt-2 text-center">{parseError}</p>
          )}
        </div>

        <div className="mt-4">
          <button
            onClick={handleSave}
            disabled={!transcript.trim() || isRecording || isParsing}
            className="w-full bg-[#6464f2] text-white font-bold py-3 rounded-xl shadow-lg shadow-[#6464f2]/25 disabled:opacity-50 disabled:shadow-none transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {isParsing ? (
              <><Loader2 size={20} className="animate-spin" /> AI 解析中...</>
            ) : (
              '转换为任务'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const SettingsView = ({ user, isDarkMode, setIsDarkMode, onLogout }: { user: any, isDarkMode: boolean, setIsDarkMode: (v: boolean) => void, onLogout: () => void }) => {
  const handleLogout = () => {
    onLogout();
  };

  return (
    <div className="flex-1 overflow-y-auto pb-24 bg-[#f8f8fc] dark:bg-slate-900 transition-colors">
      <header className="px-6 pt-12 pb-6 bg-white dark:bg-slate-900 sticky top-0 z-10 shadow-sm dark:shadow-slate-800 transition-colors">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">设置</h1>
      </header>

      <div className="px-4 py-6 space-y-6">
        {/* Profile Section */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm flex items-center gap-4 transition-colors">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#6464f2] to-purple-400 flex items-center justify-center text-white text-xl font-bold shadow-md">
              {user.email ? user.email[0].toUpperCase() : 'U'}
            </div>
            <button className="absolute bottom-0 right-0 bg-white dark:bg-slate-700 p-1.5 rounded-full shadow border border-slate-100 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:text-[#6464f2] dark:hover:text-[#6464f2]">
              <Camera size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white truncate">
              {user.displayName || '我的账号'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
          </div>
        </div>

        {/* General Settings */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden transition-colors">
          <SettingItem icon={<Bell size={20} className="text-blue-500" />} title="消息通知" />
          <SettingItem
            icon={<Moon size={20} className="text-indigo-500" />}
            title="深色模式"
            value={isDarkMode ? '开启' : '关闭'}
            onClick={() => setIsDarkMode(!isDarkMode)}
          />
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm text-red-500 font-medium flex items-center justify-center gap-2 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <LogOut size={20} />
          <span>退出登录</span>
        </button>
      </div>
    </div>
  );
};

const SettingItem = ({ icon, title, value, onClick }: { icon: React.ReactNode, title: string, value?: string, onClick?: () => void }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center justify-between p-4 border-b border-slate-50 dark:border-slate-700/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
  >
    <div className="flex items-center gap-3">
      <div className="p-2 bg-slate-50 dark:bg-slate-700 rounded-lg">
        {icon}
      </div>
      <span className="font-medium text-slate-700 dark:text-slate-200">{title}</span>
    </div>
    <div className="flex items-center gap-2 text-slate-400">
      {value && <span className="text-sm">{value}</span>}
      <ChevronRight size={18} />
    </div>
  </button>
);
