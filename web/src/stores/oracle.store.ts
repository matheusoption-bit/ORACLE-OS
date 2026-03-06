import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Subtask, ChatMessage, TaskMetrics } from '@/types/oracle.types';

// ─── Tipos do Store ────────────────────────────────────────────────────────

export type TaskStatus =
  | 'idle'
  | 'planning'
  | 'running'
  | 'reviewing'
  | 'completed'
  | 'error';

export type WsStatus = 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'disconnected';

export interface FileEntry {
  path: string;
  content: string;
  language?: string;
  updatedAt: string;
}

export interface RecentTaskEntry {
  id: string;
  prompt: string;
  status: TaskStatus;
  createdAt: string;
}

// ─── Interface do Store ────────────────────────────────────────────────────

interface OracleStore {
  // ── Task state ──
  taskId: string | null;
  taskStatus: TaskStatus;
  taskPrompt: string;
  taskStartedAt: string | null;
  messages: ChatMessage[];
  subtasks: Subtask[];
  currentSubtask: number;
  files: Record<string, FileEntry>;
  activeFile: string | null;
  logs: string[];
  metrics: TaskMetrics | null;
  error: string | null;

  // ── UI state ──
  wsStatus: WsStatus;
  selectedModel: string;
  activeTab: 'files' | 'logs' | 'preview';
  isPlanExpanded: boolean;

  // ── History (persisted) ──
  taskHistory: RecentTaskEntry[];

  // ── Actions: Task lifecycle ──
  initTask: (taskId: string, task: string) => void;
  setPlan: (subtasks: Subtask[]) => void;
  startSubtask: (index: number, title: string) => void;
  completeSubtask: (index: number, output: string) => void;
  setStatus: (status: TaskStatus) => void;
  setError: (message: string) => void;
  completeTask: (metrics: TaskMetrics) => void;
  resetWorkspace: () => void;

  // ── Actions: Messages ──
  appendMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'> & Partial<Pick<ChatMessage, 'id' | 'timestamp'>>) => void;
  appendToken: (token: string) => void;
  finalizeStreaming: () => void;

  // ── Actions: Files ──
  upsertFile: (path: string, content: string, language?: string) => void;
  setActiveFile: (path: string) => void;

  // ── Actions: UI ──
  setWsStatus: (status: WsStatus) => void;
  setActiveTab: (tab: OracleStore['activeTab']) => void;
  togglePlan: () => void;
  setSelectedModel: (model: string) => void;

  // ── Actions: Logs ──
  appendLog: (log: string) => void;
}

// ─── Implementação ─────────────────────────────────────────────────────────

export const useOracleStore = create<OracleStore>()(
  persist(
    (set, get) => ({
      // Estado inicial
      taskId: null,
      taskStatus: 'idle',
      taskPrompt: '',
      taskStartedAt: null,
      messages: [],
      subtasks: [],
      currentSubtask: 0,
      files: {},
      activeFile: null,
      logs: [],
      metrics: null,
      error: null,
      wsStatus: 'disconnected',
      selectedModel: 'claude-3-5-sonnet',
      activeTab: 'files',
      isPlanExpanded: true,
      taskHistory: [],

      // ── Task lifecycle ──────────────────────────────────────────────────

      initTask: (taskId, task) => {
        set({
          taskId,
          taskPrompt: task,
          taskStatus: 'planning',
          taskStartedAt: new Date().toISOString(),
          messages: [],
          subtasks: [],
          currentSubtask: 0,
          files: {},
          activeFile: null,
          logs: [],
          metrics: null,
          error: null,
        });
        get().appendMessage({ role: 'system', content: `🔮 Iniciando: ${task}` });
      },

      setPlan: (subtasks) => {
        set({ subtasks, taskStatus: 'running', isPlanExpanded: true });
        get().appendMessage({
          role: 'planner',
          content: `Plano criado com **${subtasks.length} subtasks**:\n${subtasks.map((s, i) => `${i + 1}. ${s.title}`).join('\n')}`,
        });
      },

      startSubtask: (index, title) => {
        set({ currentSubtask: index, taskStatus: 'running' });
        get().appendLog(`[Executor] Iniciando: ${title}`);
      },

      completeSubtask: (index, output) => {
        set({ currentSubtask: index + 1 });
        // Finaliza qualquer streaming ativo antes de adicionar a mensagem completa
        get().finalizeStreaming();
        if (output) {
          get().appendMessage({ role: 'executor', content: output });
        }
      },

      setStatus: (status) => set({ taskStatus: status }),

      setError: (message) => {
        set({ taskStatus: 'error', error: message });
        get().appendMessage({ role: 'error', content: message });
      },

      completeTask: (metrics) => {
        const { taskId, taskPrompt, taskHistory } = get();
        set({
          taskStatus: 'completed',
          metrics,
          taskHistory: [
            { id: taskId!, prompt: taskPrompt, status: 'completed', createdAt: new Date().toISOString() },
            ...taskHistory.slice(0, 19), // máximo 20 entradas
          ],
        });
        get().appendMessage({
          role: 'system',
          content: `✅ Tarefa concluída em ${metrics.durationMs ? ((metrics.durationMs / 1000).toFixed(1) + 's') : 'N/A'}`,
        });
      },

      resetWorkspace: () =>
        set({
          taskId: null,
          taskStatus: 'idle',
          taskPrompt: '',
          taskStartedAt: null,
          messages: [],
          subtasks: [],
          currentSubtask: 0,
          files: {},
          activeFile: null,
          logs: [],
          metrics: null,
          error: null,
        }),

      // ── Messages ─────────────────────────────────────────────────────────

      appendMessage: (msg) =>
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id: msg.id ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              timestamp: msg.timestamp ?? new Date().toISOString(),
              streaming: false,
              ...msg,
            } as ChatMessage,
          ],
        })),

      appendToken: (token) =>
        set((state) => {
          const messages = [...state.messages];
          const last = messages[messages.length - 1];
          if (last?.streaming) {
            // Muta de forma imutável
            messages[messages.length - 1] = { ...last, content: last.content + token };
          } else {
            messages.push({
              id: `stream-${Date.now()}`,
              role: 'executor',
              content: token,
              timestamp: new Date().toISOString(),
              streaming: true,
            });
          }
          return { messages };
        }),

      finalizeStreaming: () =>
        set((state) => {
          const messages = state.messages.map((m) =>
            m.streaming ? { ...m, streaming: false } : m
          );
          return { messages };
        }),

      // ── Files ─────────────────────────────────────────────────────────────

      upsertFile: (path, content, language) =>
        set((state) => ({
          files: {
            ...state.files,
            [path]: { path, content, language, updatedAt: new Date().toISOString() },
          },
          activeFile: state.activeFile ?? path,
        })),

      setActiveFile: (path) => set({ activeFile: path }),

      // ── UI ──────────────────────────────────────────────────────────────────

      setWsStatus: (status) => set({ wsStatus: status }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      togglePlan: () => set((s) => ({ isPlanExpanded: !s.isPlanExpanded })),
      setSelectedModel: (model) => set({ selectedModel: model }),

      // ── Logs ───────────────────────────────────────────────────────────────

      appendLog: (log) =>
        set((state) => ({
          logs: [...state.logs.slice(-199), `[${new Date().toLocaleTimeString()}] ${log}`],
        })),
    }),
    {
      name: 'oracle-os-storage',
      // Persiste apenas o histórico de tasks — sem dados sensíveis
      partialize: (state) => ({ taskHistory: state.taskHistory, selectedModel: state.selectedModel }),
    }
  )
);
