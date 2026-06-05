import { Plus, Check, Star, ChevronDown, Circle, Calendar, ListPlus, ArrowRightLeft, CalendarDays, MoreVertical } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function App() {
  const [expandedCompleted, setExpandedCompleted] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<{colId: string, taskId: string, view: 'main' | 'move'} | null>(null);
  const [activeView, setActiveView] = useState<'all' | 'starred'>('all');

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (activeDropdown && !(e.target as Element).closest('.more-options-container')) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeDropdown]);

  const lists = [
    { name: '학업', count: 3, active: true },
    { name: '독서', count: 7, active: true },
    { name: '쇼핑', count: 13, active: true },
    { name: '2023', count: null, active: false },
    { name: '일본 여행', count: 8, active: false },
    { name: '2024', count: null, active: false },
    { name: '할 일', count: null, active: false },
    { name: '군대 준비', count: null, active: false },
    { name: 'Bx', count: null, active: false },
    { name: '2026', count: null, active: false },
    { name: '26-중간고사', count: null, active: false },
  ];

  const [taskColumns, setTaskColumns] = useState([
    {
      id: 'academics',
      title: '학업',
      tasks: [
        { id: '1', text: '전공 상담', completed: false, dueDate: null, subtasks: [], starred: false },
        { id: '2', text: '오픈소스 프로젝트 팀원들에게 공부하라고 전하기', completed: false, dueDate: null, subtasks: [], starred: true },
        { id: '3', text: '운영체제 강의 듣고 과제하기', completed: false, dueDate: null, subtasks: [], starred: false },
      ],
      completedCount: 153,
    },
    {
      id: 'books',
      title: '독서',
      tasks: [
        { id: '4', text: '원씽', completed: false, dueDate: null, subtasks: [], starred: false },
        { id: '5', text: '인플레이션의 역사', completed: false, dueDate: null, subtasks: [], starred: false },
        { id: '6', text: '영화를 빨리 감기로 보는 사람들', completed: false, dueDate: null, subtasks: [], starred: false },
      ],
      completedCount: 0,
    },
    {
      id: 'shopping',
      title: '쇼핑',
      tasks: [
        { id: '7', text: 'NCS 책 구매', completed: false, dueDate: null, subtasks: [], starred: false },
        { id: '8', text: '키보드 부품 구매', completed: false, dueDate: null, subtasks: [], starred: false },
      ],
      completedCount: 0,
    },
  ]);

  const updateTask = (columnId: string, taskId: string, updates: any) => {
    setTaskColumns(prev => prev.map(col => {
      if (col.id !== columnId) return col;
      return {
        ...col,
        tasks: col.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t)
      };
    }));
  };

  const toggleStar = (columnId: string, taskId: string) => {
    setTaskColumns(prev => prev.map(col => {
      if (col.id !== columnId) return col;
      return {
        ...col,
        tasks: col.tasks.map(t => t.id === taskId ? { ...t, starred: !t.starred } : t)
      };
    }));
  };

  const displayedColumns = activeView === 'starred'
    ? taskColumns.map(col => ({
        ...col,
        tasks: col.tasks.filter(t => t.starred)
      })).filter(col => col.tasks.length > 0)
    : taskColumns;

  const addSubtask = (columnId: string, taskId: string) => {
    setTaskColumns(prev => prev.map(col => {
      if (col.id !== columnId) return col;
      return {
        ...col,
        tasks: col.tasks.map(t => {
          if (t.id === taskId) {
            const newSubtasks = [...(t.subtasks || []), { id: Date.now().toString(), text: '', completed: false }];
            return { ...t, subtasks: newSubtasks };
          }
          return t;
        })
      };
    }));
  };

  const removeSubtask = (columnId: string, taskId: string, subtaskId: string) => {
    setTaskColumns(prev => prev.map(col => {
      if (col.id !== columnId) return col;
      return {
        ...col,
        tasks: col.tasks.map(t => {
          if (t.id === taskId) {
            return {
              ...t,
              subtasks: (t.subtasks || []).filter(st => st.id !== subtaskId)
            };
          }
          return t;
        })
      };
    }));
  };

  const handleSubtaskBlur = (columnId: string, taskId: string, subtaskId: string, text: string) => {
    if (text.trim() === '') {
      removeSubtask(columnId, taskId, subtaskId);
    }
  };

  const updateSubtaskText = (columnId: string, taskId: string, subtaskId: string, text: string) => {
    setTaskColumns(prev => prev.map(col => {
      if (col.id !== columnId) return col;
      return {
        ...col,
        tasks: col.tasks.map(t => {
          if (t.id === taskId) {
            return {
              ...t,
              subtasks: (t.subtasks || []).map(st => st.id === subtaskId ? { ...st, text } : st)
            };
          }
          return t;
        })
      };
    }));
  };

  const moveTask = (fromColId: string, toColId: string, taskId: string) => {
    setTaskColumns(prev => {
      const fromCol = prev.find(c => c.id === fromColId);
      const task = fromCol?.tasks.find(t => t.id === taskId);
      if (!task) return prev;

      return prev.map(col => {
        if (col.id === fromColId) {
          return { ...col, tasks: col.tasks.filter(t => t.id !== taskId) };
        }
        if (col.id === toColId) {
          return { ...col, tasks: [...col.tasks, task] };
        }
        return col;
      });
    });
  };

  return (
    <div className="size-full flex flex-col" style={{ backgroundColor: '#F8F9FA' }}>
      {/* Mac Window Header */}
      <div className="flex items-center justify-between px-4 h-12 bg-white border-b" style={{ borderColor: '#E8EAED' }}>
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#FF5F57' }}></div>
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#FEBC2E' }}></div>
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#28C840' }}></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full overflow-hidden" style={{ backgroundColor: '#E8EAED' }}>
            <div className="w-full h-full flex items-center justify-center" style={{ color: '#5F6368' }}>
              U
            </div>
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-[280px] bg-white border-r flex-shrink-0 flex flex-col" style={{ borderColor: '#E8EAED' }}>
          {/* Logo */}
          <div className="px-6 py-6 flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: '#1A73E8' }}>
              <Check className="w-4 h-4 text-white" strokeWidth={3} />
            </div>
            <h1 className="text-xl" style={{ color: '#202124' }}>할 일</h1>
          </div>

          {/* Create Button */}
          <div className="px-6 mb-4">
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg shadow-md hover:shadow-lg transition-shadow" style={{ backgroundColor: '#1A73E8' }}>
              <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
              <span className="text-white">만들기</span>
            </button>
          </div>

          {/* Navigation */}
          <div className="px-3 mb-6">
            <div 
              className={`px-3 py-2 rounded-full flex items-center gap-3 cursor-pointer ${activeView === 'all' ? 'bg-[#E8F0FE]' : 'hover:bg-gray-50'}`}
              onClick={() => setActiveView('all')}
            >
              <Check className="w-5 h-5" style={{ color: activeView === 'all' ? '#1A73E8' : '#5F6368' }} strokeWidth={2} />
              <span style={{ color: activeView === 'all' ? '#1A73E8' : '#5F6368' }}>모든 할 일</span>
            </div>
            <div 
              className={`px-3 py-2 rounded-full flex items-center gap-3 mt-1 cursor-pointer ${activeView === 'starred' ? 'bg-[#E8F0FE]' : 'hover:bg-gray-50'}`}
              onClick={() => setActiveView('starred')}
            >
              <Star className="w-5 h-5" style={{ color: activeView === 'starred' ? '#1A73E8' : '#5F6368' }} strokeWidth={2} />
              <span style={{ color: activeView === 'starred' ? '#1A73E8' : '#5F6368' }}>중요 표시됨</span>
            </div>
          </div>

          {/* Lists Section */}
          <div className="px-3 flex-1 overflow-y-auto">
            <div className="px-3 py-2 mb-2" style={{ color: '#5F6368', fontSize: '11px', fontWeight: 500, letterSpacing: '0.8px' }}>
              목록
            </div>
            {lists.map((list, index) => (
              <div
                key={index}
                className="px-3 py-2 rounded flex items-center justify-between hover:bg-gray-50 cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <input type="checkbox" className="w-4 h-4 rounded border" style={{ borderColor: '#DADCE0' }} />
                  <span style={{ color: '#202124', fontSize: '14px' }}>{list.name}</span>
                </div>
                {list.count !== null && (
                  <span className="text-xs" style={{ color: '#5F6368' }}>{list.count}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-x-auto overflow-y-auto">
          <div className="p-6 flex gap-4 min-w-max">
            {displayedColumns.map((column) => (
              <div
                key={column.id}
                className="bg-white rounded-lg shadow-sm p-4 w-[320px] flex-shrink-0"
                style={{ border: '1px solid #E8EAED' }}
              >
                {/* Column Header */}
                <h3 className="mb-4 px-1" style={{ color: '#202124' }}>{column.title}</h3>

                {/* Add Task Button */}
                <button className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-50 mb-3 text-left">
                  <Plus className="w-5 h-5" style={{ color: '#1A73E8' }} strokeWidth={2} />
                  <span style={{ color: '#5F6368', fontSize: '14px' }}>할 일 추가</span>
                </button>

                {/* Task List */}
                <div className="space-y-2">
                  {column.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="group flex flex-col px-3 py-2 rounded hover:bg-gray-50 border border-transparent transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3 w-full cursor-pointer">
                        <div className="flex items-start gap-3 flex-1">
                          <Circle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#5F6368' }} strokeWidth={2} />
                          <div className="flex flex-col flex-1">
                            <span style={{ color: '#202124', fontSize: '14px' }}>{task.text}</span>
                            {task.dueDate && (
                              <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: '#1A73E8' }}>
                                <CalendarDays className="w-3 h-3" />
                                <span>{task.dueDate}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Action Buttons (visible on hover) */}
                        <div className="flex items-center gap-1">
                          {/* Star Button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleStar(column.id, task.id); }}
                            className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${task.starred ? 'opacity-100 text-[#1A73E8]' : 'opacity-0 group-hover:opacity-100 text-gray-400'}`}
                            title={task.starred ? "중요 표시 해제" : "중요 표시"}
                          >
                            <Star className="w-4 h-4" fill={task.starred ? "currentColor" : "none"} strokeWidth={task.starred ? 0 : 2} />
                          </button>

                          {/* 3-Dots Menu */}
                          <div className="more-options-container relative">
                            <button
                              className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-gray-200 text-gray-500 transition-colors"
                              title="옵션"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setActiveDropdown(activeDropdown?.taskId === task.id ? null : { colId: column.id, taskId: task.id, view: 'main' }); 
                              }}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            
                            {/* Dropdown Menu */}
                            {activeDropdown?.taskId === task.id && (
                              <div className="absolute right-0 top-full mt-1 w-48 bg-white border shadow-lg rounded-md z-50 py-1" style={{ borderColor: '#E8EAED' }}>
                                {activeDropdown.view === 'main' ? (
                                  <>
                                    <div className="relative px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-gray-700 transition-colors">
                                      <Calendar className="w-4 h-4" />
                                      마감일 설정
                                      <input 
                                        type="date" 
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                        value={task.dueDate || ''}
                                        onChange={(e) => { updateTask(column.id, task.id, { dueDate: e.target.value }); setActiveDropdown(null); }}
                                      />
                                    </div>
                                    <div 
                                      className="px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-gray-700 transition-colors"
                                      onClick={(e) => { e.stopPropagation(); addSubtask(column.id, task.id); setActiveDropdown(null); }}
                                    >
                                      <ListPlus className="w-4 h-4" />
                                      하위 할 일 추가
                                    </div>
                                    <div 
                                      className="px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-gray-700 transition-colors"
                                      onClick={(e) => { e.stopPropagation(); setActiveDropdown({ colId: column.id, taskId: task.id, view: 'move' }); }}
                                    >
                                      <ArrowRightLeft className="w-4 h-4" />
                                      다른 목록으로 이동
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="px-3 py-1.5 text-xs text-gray-500 font-medium border-b mb-1" style={{ borderColor: '#E8EAED' }}>이동할 목록...</div>
                                    {taskColumns.filter(c => c.id !== column.id).map(c => (
                                      <button 
                                        key={c.id} 
                                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors text-gray-700"
                                        onClick={(e) => { 
                                          e.stopPropagation(); 
                                          moveTask(column.id, c.id, task.id); 
                                          setActiveDropdown(null); 
                                        }}
                                      >
                                        {c.title}
                                      </button>
                                    ))}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Subtasks List */}
                      {task.subtasks && task.subtasks.length > 0 && (
                        <div className="ml-8 mt-2 space-y-1.5">
                          {task.subtasks.map(subtask => (
                            <div key={subtask.id} className="flex items-start gap-2">
                              <div className="w-4 h-4 mt-0.5 rounded-sm border flex-shrink-0" style={{ borderColor: '#DADCE0' }} />
                              <input 
                                type="text" 
                                value={subtask.text}
                                placeholder="하위 할 일..."
                                autoFocus={subtask.text === ''}
                                onChange={(e) => updateSubtaskText(column.id, task.id, subtask.id, e.target.value)}
                                onBlur={(e) => handleSubtaskBlur(column.id, task.id, subtask.id, e.target.value)}
                                className="text-sm bg-transparent outline-none flex-1 border-b border-transparent focus:border-blue-500 transition-colors pb-0.5"
                                style={{ color: '#5F6368' }}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Completed Section */}
                {column.completedCount > 0 && (
                  <div className="mt-4 pt-4" style={{ borderTop: '1px solid #E8EAED' }}>
                    <button
                      className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-gray-50 text-left"
                      onClick={() => setExpandedCompleted(expandedCompleted === column.id ? null : column.id)}
                    >
                      <span style={{ color: '#5F6368', fontSize: '14px' }}>
                        완료됨 ({column.completedCount})
                      </span>
                      <ChevronDown
                        className="w-4 h-4"
                        style={{
                          color: '#5F6368',
                          transform: expandedCompleted === column.id ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                        }}
                      />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}