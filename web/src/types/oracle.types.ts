// ─── ORACLE-OS · Tipos TypeScript Completos ─────────────────────────────────

// Tipos existentes mantidos para compatibilidade
export interface Subtask {
  id: string;
  title: string;
  type: string;
  assignedAgent: string;
  expectedOutput: string;
  dependencies: string[];
}

export interface TaskMetrics {
  taskId?: string;
  task?: string;
  durationMs?: number;
  successRate?: number;
  tokensUsed?: number;
  /** Tokens discriminados por agente (Sprint 9) */
  tokensPlanner?: number;
  tokensExecutor?: number;
  tokensReviewer?: number;
  /** Número de iterações do ciclo Reviewer (Sprint 9) */
  iterationCount?: number;
  cost?: number;
}

export type ChatMessage = {
  id: string;
  role: 'user' | 'planner' | 'executor' | 'reviewer' | 'system' | 'error';
  content: string;
  timestamp: string;
  streaming?: boolean;
};

export type OracleEvent =
  | { type: 'task:started'; taskId: string; task: string }
  | { type: 'plan:created'; subtasks: Subtask[] }
  | { type: 'subtask:started'; index: number; total: number; title: string }
  | { type: 'subtask:completed'; index: number; output: string }
  | { type: 'file:created'; path: string; content: string }
  | { type: 'review:started'; attempt: number; iterationCount?: number }
  | { type: 'review:approved' }
  | { type: 'review:rejected'; feedback: string }
  | { type: 'skill:saved'; skillId: string }
  | { type: 'task:completed'; metrics: TaskMetrics }
  | { type: 'error'; message: string }
  | { type: 'token'; token: string };

// ─── Novos tipos: Modelos de IA ─────────────────────────────────────────────

export type ModelTier = 'HIGH' | 'FAST' | 'LOCAL' | 'FREE';

export interface OracleModel {
  id: string;
  name: string;
  provider: 'anthropic' | 'meta' | 'google' | 'openai';
  tier: ModelTier;
  icon: string;
  color: string;
}

export const ORACLE_MODELS: OracleModel[] = [
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    tier: 'HIGH',
    icon: '🟣',
    color: '#a855f7',
  },
  {
    id: 'claude-3-haiku',
    name: 'Claude 3 Haiku',
    provider: 'anthropic',
    tier: 'FAST',
    icon: '🔵',
    color: '#3b82f6',
  },
  {
    id: 'llama-3.3-70b',
    name: 'Llama 3.3 70B',
    provider: 'meta',
    tier: 'LOCAL',
    icon: '🟡',
    color: '#f59e0b',
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    provider: 'google',
    tier: 'FREE',
    icon: '🟢',
    color: '#10b981',
  },
];

// ─── Modos de Tarefa ─────────────────────────────────────────────────────────

export interface TaskMode {
  id: string;
  label: string;
  icon: string;
  description?: string;
}

export const TASK_MODES: TaskMode[] = [
  { id: 'website', label: 'Website', icon: '🌐', description: 'Landing page, portfólio, blog' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊', description: 'Analytics, visualizações' },
  { id: 'app', label: 'App', icon: '⚙️', description: 'Aplicação completa' },
  { id: 'fix', label: 'Corrigir', icon: '🔧', description: 'Debug e correção de bugs' },
  { id: 'docs', label: 'Docs', icon: '📝', description: 'Documentação técnica' },
  { id: 'analyze', label: 'Analisar', icon: '🔍', description: 'Code review e auditoria' },
];

// ─── Status da Tarefa ─────────────────────────────────────────────────────────

export type OracleTaskStatus =
  | 'pending'
  | 'planning'
  | 'executing'
  | 'reviewing'
  | 'completed'
  | 'failed';

// ─── Tarefa Principal ─────────────────────────────────────────────────────────

export interface OracleTask {
  id: string;
  prompt: string;
  mode: string;
  model: string;
  status: OracleTaskStatus;
  subtasks: Subtask[];
  messages: ChatMessage[];
  metrics?: TaskMetrics;
  createdAt: string;
  updatedAt: string;
}

// ─── Tarefa Recente (Sidebar) ─────────────────────────────────────────────────

export interface RecentTask {
  id: string;
  title: string;
  status: OracleTaskStatus;
  createdAt: string;
  mode?: string;
}

// ─── Passo do Agente ─────────────────────────────────────────────────────────

export interface AgentStep {
  id: string;
  agent: 'planner' | 'executor' | 'reviewer';
  action: string;
  input?: string;
  output?: string;
  status: 'pending' | 'running' | 'done' | 'error';
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

// ─── Estado Global (Zustand) ─────────────────────────────────────────────────

export interface OracleState {
  currentTask: OracleTask | null;
  recentTasks: RecentTask[];
  selectedModel: string;
  selectedMode: string;
  isLoading: boolean;
  error: string | null;
}
