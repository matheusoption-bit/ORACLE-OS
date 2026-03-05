/**
 * ORACLE-OS State Schema
 * Defines the shared state passed between agents
 */

export interface Subtask {
  id: string;
  description: string;
  assignedAgent: 'frontend' | 'backend' | 'devops' | 'data' | 'security';
  dependencies: string[];
  estimatedDuration: number; // minutes
  tools: string[]; // MCP tool names
  validationCriteria: string;
}

export interface OracleState {
  task: string;
  subtasks: Subtask[];
  currentSubtask: number;
  results: Record<string, any>;
  errors: Error[];
  reviewStatus: 'pending' | 'approved' | 'rejected';
  iterationCount: number;
}

export const createInitialState = (task: string): OracleState => ({
  task,
  subtasks: [],
  currentSubtask: 0,
  results: {},
  errors: [],
  reviewStatus: 'pending',
  iterationCount: 0,
});
