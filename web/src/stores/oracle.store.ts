import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Subtask, ChatMessage, TaskMetrics, AgentCostData } from '@/types/oracle.types';

// ─── Tipos do Store ────────────────────────────────────────────────────────

export type TaskStatus =
  | 'idle'
  | 'planning'
  | 'running'
  | 'reviewing'
  | 'completed'
  | 'error';

export type WsStatus = 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'disconnected';

export type WorkbenchTab = 'files' | 'logs' | 'preview' | 'code' | 'terminal' | 'graph' | 'metrics';

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

/** Métricas parciais em tempo real (Sprint 10) */
export interface LiveMetrics {
  totalCostUSD: number;
  tokensPlanner: number;
  tokensExecutor: number;
  tokensReviewer: number;
  totalTokens: number;
  lastUpdated: string;
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
  iterationCount: number;
  files: Record<string, FileEntry>;
  activeFile: string | null;
  logs: string[];
  metrics: TaskMetrics | null;
  liveMetrics: LiveMetrics | null;
  error: string | null;

  // ── UI state ──
  wsStatus: WsStatus;
  selectedModel: string;
  activeTab: WorkbenchTab;
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
  setIterationCount: (count: number) => void;

  // ── Actions: Messages ──
  appendMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'> & Partial<Pick<ChatMessage, 'id' | 'timestamp'>>) => void;
  appendToken: (token: string) => void;
  finalizeStreaming: () => void;

  // ── Actions: Files ──
  upsertFile: (path: string, content: string, language?: string) => void;
  setActiveFile: (path: string) => void;

  // ── Actions: UI ──
  setWsStatus: (status: WsStatus) => void;
  setActiveTab: (tab: WorkbenchTab) => void;
  togglePlan: () => void;
  setSelectedModel: (model: string) => void;

  // ── Actions: Logs ──
  appendLog: (log: string) => void;

  // ── Actions: Live Metrics (Sprint 10) ──
  updateLiveMetrics: (data: AgentCostData) => void;
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
      iterationCount: 0,
      files: {},
      activeFile: null,
      logs: [],
      metrics: null,
      liveMetrics: null,
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
          iterationCount: 0,
          files: {},
          activeFile: null,
          logs: [],
          metrics: null,
          liveMetrics: null,
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
        get().finalizeStreaming();
        if (output) {
          get().appendMessage({ role: 'executor', content: output });
        }
      },

      setStatus: (status) => set({ taskStatus: status }),

      setIterationCount: (count) => set({ iterationCount: count }),

      setError: (message) => {
        set({ taskStatus: 'error', error: message });
        get().appendMessage({ role: 'error', content: message });
      },

      completeTask: (metrics) => {
        const { taskId, taskPrompt, taskHistory, liveMetrics } = get();

        // Mescla métricas finais com dados em tempo real
        const mergedMetrics: TaskMetrics = {
          ...metrics,
          tokensPlanner: metrics.tokensPlanner ?? liveMetrics?.tokensPlanner,
          tokensExecutor: metrics.tokensExecutor ?? liveMetrics?.tokensExecutor,
          tokensReviewer: metrics.tokensReviewer ?? liveMetrics?.tokensReviewer,
          tokensUsed: metrics.tokensUsed ?? liveMetrics?.totalTokens,
          cost: metrics.cost ?? liveMetrics?.totalCostUSD,
        };

        set({
          taskStatus: 'completed',
          metrics: mergedMetrics,
          taskHistory: [
            { id: taskId!, prompt: taskPrompt, status: 'completed', createdAt: new Date().toISOString() },
            ...taskHistory.slice(0, 19),
          ],
        });
        get().appendMessage({
          role: 'system',
          content: `✅ Tarefa concluída em ${mergedMetrics.durationMs ? ((mergedMetrics.durationMs / 1000).toFixed(1) + 's') : 'N/A'}`,
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
          iterationCount: 0,
          files: {},
          activeFile: null,
          logs: [],
          metrics: null,
          liveMetrics: null,
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
          logs: [...state.logs.slice(-499), `[${new Date().toLocaleTimeString()}] ${log}`],
        })),

      // ── Live Metrics (Sprint 10) ──────────────────────────────────────────

      updateLiveMetrics: (data: AgentCostData) =>
        set({
          liveMetrics: {
            totalCostUSD: data.totalCostUSD,
            tokensPlanner: data.tokensPlanner,
            tokensExecutor: data.tokensExecutor,
            tokensReviewer: data.tokensReviewer,
            totalTokens: data.totalTokens,
            lastUpdated: new Date().toISOString(),
          },
        }),
    }),
    {
      name: 'oracle-os-storage',
      partialize: (state) => ({
        taskHistory: state.taskHistory,
        selectedModel: state.selectedModel,
        isPlanExpanded: state.isPlanExpanded,
      }),
    }
  )
);
