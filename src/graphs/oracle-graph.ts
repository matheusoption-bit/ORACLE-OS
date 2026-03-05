/**
 * ORACLE-OS Main State Graph — Sprint 4
 * Loop completo: Planner → executor_router → Executor → Reviewer → END
 * Com re-execução se needs_revision e iterationCount < 3
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { OracleState } from '../state/oracle-state.js';
import { plannerAgent } from '../agents/planner.js';
import { executorAgent } from '../agents/executor.js';
import { frontendExecutorAgent } from '../agents/frontend-executor.js';
import { backendExecutorAgent } from '../agents/backend-executor.js';
import { reviewerAgent } from '../agents/reviewer.js';

// ─── Tipos das arestas do grafo ───────────────────────────────────────────────

type PlannerEdge = 'frontend_executor' | 'backend_executor' | 'executor' | typeof END;
type ExecutorEdge = 'reviewer' | 'frontend_executor' | 'backend_executor' | 'executor';
type ReviewerEdge = 'frontend_executor' | 'backend_executor' | 'executor' | typeof END;

// ─── Função de roteamento por assignedAgent ───────────────────────────────────

function routeByAgent(state: OracleState): 'frontend_executor' | 'backend_executor' | 'executor' {
  const subtask = state.subtasks[state.currentSubtask];
  if (!subtask) return 'executor';

  switch (subtask.assignedAgent) {
    case 'frontend':
      return 'frontend_executor';
    case 'backend':
    case 'devops':
    case 'data':
    case 'security':
      return 'backend_executor';
    default:
      return 'executor';
  }
}

// ─── Criação do grafo ─────────────────────────────────────────────────────────

export function createOracleGraph() {
  const workflow = new StateGraph<OracleState>({
    channels: {
      task: null,
      subtasks: null,
      currentSubtask: null,
      results: null,
      errors: null,
      reviewStatus: null,
      revisionNotes: null,
      iterationCount: null,
    },
  });

  // ── Nó: Planner ─────────────────────────────────────────────────────────────
  workflow.addNode('planner', async (state: OracleState) => {
    console.log('\n🧠 Planning...');
    return plannerAgent(state);
  });

  // ── Nó: Frontend Executor ────────────────────────────────────────────────────
  workflow.addNode('frontend_executor', async (state: OracleState) => {
    const subtask = state.subtasks[state.currentSubtask];
    const label = subtask
      ? `${state.currentSubtask + 1}/${state.subtasks.length} — ${subtask.title}`
      : 'concluído';
    console.log(`⚙️  Executing [frontend] ${label}`);

    if (!subtask) return { currentSubtask: state.currentSubtask };

    try {
      const result = await frontendExecutorAgent(subtask);
      return {
        results: { ...state.results, [subtask.id]: result },
        currentSubtask: state.currentSubtask + 1,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      return {
        results: {
          ...state.results,
          [subtask.id]: { subtaskId: subtask.id, status: 'failed', output: error.message, toolCallsExecuted: [], filesModified: [], timestamp: new Date().toISOString() },
        },
        errors: [...state.errors, error],
        currentSubtask: state.currentSubtask + 1,
      };
    }
  });

  // ── Nó: Backend Executor ─────────────────────────────────────────────────────
  workflow.addNode('backend_executor', async (state: OracleState) => {
    const subtask = state.subtasks[state.currentSubtask];
    const label = subtask
      ? `${state.currentSubtask + 1}/${state.subtasks.length} — ${subtask.title}`
      : 'concluído';
    console.log(`⚙️  Executing [backend] ${label}`);

    if (!subtask) return { currentSubtask: state.currentSubtask };

    try {
      const result = await backendExecutorAgent(subtask);
      return {
        results: { ...state.results, [subtask.id]: result },
        currentSubtask: state.currentSubtask + 1,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      return {
        results: {
          ...state.results,
          [subtask.id]: { subtaskId: subtask.id, status: 'failed', output: error.message, toolCallsExecuted: [], filesModified: [], timestamp: new Date().toISOString() },
        },
        errors: [...state.errors, error],
        currentSubtask: state.currentSubtask + 1,
      };
    }
  });

  // ── Nó: Executor Genérico ────────────────────────────────────────────────────
  workflow.addNode('executor', async (state: OracleState) => {
    const subtask = state.subtasks[state.currentSubtask];
    const label = subtask
      ? `${state.currentSubtask + 1}/${state.subtasks.length} — ${subtask.title}`
      : 'concluído';
    console.log(`⚙️  Executing [generic] ${label}`);
    return executorAgent(state);
  });

  // ── Nó: Reviewer ─────────────────────────────────────────────────────────────
  workflow.addNode('reviewer', async (state: OracleState) => {
    console.log('\n✅ Reviewing...');
    return reviewerAgent(state);
  });

  // ── Arestas ───────────────────────────────────────────────────────────────────

  // START → planner
  workflow.addEdge(START, 'planner');

  // planner → executor_router (ou END se sem subtasks)
  workflow.addConditionalEdges(
    'planner',
    (state): PlannerEdge => {
      if (state.subtasks.length === 0) return END;
      return routeByAgent(state);
    }
  );

  // frontend_executor → próximo subtask ou reviewer
  workflow.addConditionalEdges(
    'frontend_executor',
    (state): ExecutorEdge => {
      if (state.currentSubtask >= state.subtasks.length) return 'reviewer';
      return routeByAgent(state);
    }
  );

  // backend_executor → próximo subtask ou reviewer
  workflow.addConditionalEdges(
    'backend_executor',
    (state): ExecutorEdge => {
      if (state.currentSubtask >= state.subtasks.length) return 'reviewer';
      return routeByAgent(state);
    }
  );

  // executor genérico → próximo subtask ou reviewer
  workflow.addConditionalEdges(
    'executor',
    (state): ExecutorEdge => {
      if (state.currentSubtask >= state.subtasks.length) return 'reviewer';
      return routeByAgent(state);
    }
  );

  // reviewer → END (aprovado/rejeitado/max iter) ou re-execução
  workflow.addConditionalEdges(
    'reviewer',
    (state): ReviewerEdge => {
      if (state.reviewStatus === 'approved' || state.reviewStatus === 'rejected' || state.iterationCount >= 3) {
        return END;
      }
      // needs_revision: reset currentSubtask e volta ao executor correto
      return routeByAgent({ ...state, currentSubtask: 0 });
    }
  );

  return workflow.compile();
}
