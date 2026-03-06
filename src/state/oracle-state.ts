/**
 * ORACLE-OS State Schema
 * Defines the shared state passed between agents
 */

export type SubtaskType = "code" | "file" | "search" | "review" | "other";

export interface Subtask {
  id: string;
  title: string;
  description: string;
  type: SubtaskType;
  priority: number; // 1 (crítico) a 5 (baixo)
  dependsOn: string[]; // IDs de subtasks pré-requisito (Sprint 2)
  assignedAgent: "frontend" | "backend" | "devops" | "data" | "security" | "geral";
  dependencies: string[]; // alias retrocompatível com executor/reviewer
  estimatedDuration: number; // minutos
  tools: string[]; // nomes de ferramentas MCP
  validationCriteria: string;
}

export interface OracleState {
  task: string;
  subtasks: Subtask[];
  currentSubtask: number;
  results: Record<string, unknown>;
  errors: Error[];
  reviewStatus: 'pending' | 'approved' | 'rejected' | 'needs_revision';
  revisionNotes?: string; // feedback do Reviewer para o Executor re-executar
  iterationCount: number;
}

export const createInitialState = (task: string): OracleState => ({
  task,
  subtasks: [],
  currentSubtask: 0,
  results: {},
  errors: [],
  reviewStatus: "pending",
  iterationCount: 0,
});
