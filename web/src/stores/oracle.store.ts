import { create } from 'zustand';
import { Subtask, ChatMessage, TaskMetrics } from '../types/oracle';

interface OracleStore {
  // Task state
  taskId: string | null;
  taskStatus: 'idle' | 'running' | 'completed' | 'error';
  messages: ChatMessage[];
  
  // Plan/Subtasks
  subtasks: Subtask[];
  currentSubtask: number;
  
  // Workspace / Files
  files: Record<string, string>;
  activeFile: string | null;
  logs: string[];
  
  // Metrics
  metrics: TaskMetrics | null;
  
  // Actions
  setTaskStatus: (status: OracleStore['taskStatus']) => void;
  setTaskId: (id: string | null) => void;
  appendMessage: (msg: ChatMessage) => void;
  appendTokenToLastMessage: (token: string) => void;
  setSubtasks: (tasks: Subtask[]) => void;
  setCurrentSubtask: (index: number) => void;
  updateFile: (path: string, content: string) => void;
  setActiveFile: (path: string) => void;
  appendLog: (log: string) => void;
  resetWorkspace: () => void;
}

export const useOracleStore = create<OracleStore>((set) => ({
  taskId: null,
  taskStatus: 'idle',
  messages: [{
    id: 'welcome',
    role: 'system',
    content: 'Pronto para iniciar.',
    timestamp: new Date().toISOString()
  }],
  subtasks: [],
  currentSubtask: 0,
  files: {},
  activeFile: null,
  logs: [],
  metrics: null,

  setTaskStatus: (status) => set({ taskStatus: status }),
  setTaskId: (id) => set({ taskId: id }),
  appendMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  
  appendTokenToLastMessage: (token) => set((state) => {
    const messages = [...state.messages];
    if (messages.length === 0) return { messages };
    const last = messages[messages.length - 1];
    
    // Se a última é streaming, anexa nela.
    if (last.streaming) {
      last.content += token;
    } else {
      // Cria uma nova de executor por padrão com streaming se não existir
      messages.push({
        id: Math.random().toString(),
        role: 'executor',
        content: token,
        timestamp: new Date().toISOString(),
        streaming: true
      });
    }
    return { messages };
  }),

  setSubtasks: (tasks) => set({ subtasks: tasks }),
  setCurrentSubtask: (index) => set({ currentSubtask: index }),
  
  updateFile: (path, content) => set((state) => {
    const updated = { ...state.files, [path]: content };
    return { files: updated, activeFile: state.activeFile || path };
  }),
  
  setActiveFile: (path) => set({ activeFile: path }),
  appendLog: (log) => set((state) => ({ logs: [...state.logs, log] })),
  
  resetWorkspace: () => set({
    taskStatus: 'idle',
    taskId: null,
    subtasks: [],
    currentSubtask: 0,
    files: {},
    activeFile: null,
    logs: [],
    metrics: null,
    messages: []
  })
}));
