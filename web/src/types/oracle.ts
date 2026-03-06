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
  | { type: 'review:started'; attempt: number }
  | { type: 'review:approved' }
  | { type: 'review:rejected'; feedback: string }
  | { type: 'skill:saved'; skillId: string }
  | { type: 'task:completed'; metrics: TaskMetrics }
  | { type: 'error'; message: string }
  | { type: 'token'; token: string };
