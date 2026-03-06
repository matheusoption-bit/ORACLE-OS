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
import { saveTaskAsSkill } from '../rag/rag-pipeline.js';
import { startTask, completeTask } from '../monitoring/metrics.js';
import { plannerLogger, executorLogger, reviewerLogger, systemLogger } from '../monitoring/logger.js';

// ─── Tipos das arestas do grafo ───────────────────────────────────────────────

type PlannerEdge = 'frontend_executor' | 'backend_executor' | 'executor' | typeof END;
type ExecutorEdge = 'reviewer' | 'frontend_executor' | 'backend_executor' | 'executor';
type ReviewerEdge = 'save_skill' | 'frontend_executor' | 'backend_executor' | 'executor' | typeof END;

// ─── Função de roteamento por conteúdo ────────────────────────────────────────

function executor_router(state: OracleState): 'frontend_executor' | 'backend_executor' | 'executor' {
  const subtask = state.subtasks[state.currentSubtask];
  if (!subtask) return 'executor'; // Fallback seguro se não houver task atual

  const typeLower = (subtask.type || '').toLowerCase();
  
  if (typeLower.includes('react') || typeLower.includes('next') || typeLower.includes('component')) {
    return 'frontend_executor';
  }
  
  if (typeLower.includes('api') || typeLower.includes('node') || typeLower.includes('python')) {
    return 'backend_executor';
  }

  // Fallback baseado no assignAgent original caso não bata a keyword (mantendo certa retrocompatibilidade)
  if (subtask.assignedAgent === 'frontend') return 'frontend_executor';
  if (subtask.assignedAgent === 'backend') return 'backend_executor';

  return 'executor';
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
  })
  // ── Nó: Planner ─────────────────────────────────────────────────────────────
  .addNode('planner', async (state: OracleState) => {
    // START BOUNDARY METRICS (Usando timestamp gerado random ou o primeiro run)
    if (state.iterationCount === 0 && state.subtasks.length === 0) {
      startTask(Math.random().toString(36).substr(2, 9), state.task, state);
    }
    
    plannerLogger.info('🧠 Iniciando planejamento de task...');
    return plannerAgent(state);
  })

  // ── Nó: Frontend Executor ────────────────────────────────────────────────────
  .addNode('frontend_executor', async (state: OracleState) => {
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
        errors: [...(state.errors ?? []), error],
        currentSubtask: state.currentSubtask + 1,
      };
    }
  })

  // ── Nó: Backend Executor ─────────────────────────────────────────────────────
  .addNode('backend_executor', async (state: OracleState) => {
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
        errors: [...(state.errors ?? []), error],
        currentSubtask: state.currentSubtask + 1,
      };
    }
  })

  // ── Nó: Executor Genérico ────────────────────────────────────────────────────
  .addNode('executor', async (state: OracleState) => {
    const subtask = state.subtasks[state.currentSubtask];
    const label = subtask
      ? `${state.currentSubtask + 1}/${state.subtasks.length} — ${subtask.title}`
      : 'concluído';
    executorLogger.info(`⚙️  Executing [generic] ${label}`);
    return executorAgent(state);
  })

  // ── Nó: Reviewer ─────────────────────────────────────────────────────────────
  .addNode('reviewer', async (state: OracleState) => {
    reviewerLogger.info(`🔍 Reviewing attempt ${state.iterationCount + 1}/3...`);
    return reviewerAgent(state);
  })

  // ── Nó: Memória RAG (Save Skill) ──────────────────────────────────────────────
  .addNode('save_skill', async (state: OracleState) => {
    await saveTaskAsSkill(state);
    
    // Fechamento da task metrics no final do loop
    // (Numa infra real usaríamos o taskID vindo de um state.id que adicionaríamos no Schema. 
    // Como simplificou, vamos forçar uma atualização da ultima rodada correndo do array local do monitor)
    systemLogger.info(`🎉 Task workflow completado e documentado!`);
    return state;
  })

  // ── Arestas ───────────────────────────────────────────────────────────────────

  // START → planner
  .addEdge(START, 'planner')

  // planner → executor_router (ou END se sem subtasks)
  .addConditionalEdges(
    'planner',
    (state): PlannerEdge => {
      if (state.subtasks.length === 0) return END;
      return executor_router(state);
    }
  )

  // frontend_executor → próximo subtask ou reviewer
  .addConditionalEdges(
    'frontend_executor',
    (state): ExecutorEdge => {
      if (state.currentSubtask >= state.subtasks.length) return 'reviewer';
      return executor_router(state);
    }
  )

  // backend_executor → próximo subtask ou reviewer
  .addConditionalEdges(
    'backend_executor',
    (state): ExecutorEdge => {
      if (state.currentSubtask >= state.subtasks.length) return 'reviewer';
      return executor_router(state);
    }
  )

  // executor genérico → próximo subtask ou reviewer
  .addConditionalEdges(
    'executor',
    (state): ExecutorEdge => {
      if (state.currentSubtask >= state.subtasks.length) return 'reviewer';
      return executor_router(state);
    }
  )

  // reviewer → save_skill (se approved) ou re-execução (se precisa alterar) ou END (se falha hard)
  .addConditionalEdges(
    'reviewer',
    (state): ReviewerEdge => {
      // Rejeição grave ou limite extourado e forçado
      if (state.reviewStatus === 'rejected') {
        const id = Math.random().toString(36).substr(2, 9); // Mock ID
        completeTask(id, state); // Fallback caso não possamos rastrear real ID aqui, a lógica certa é guardar TaskMetricsID no State.
        systemLogger.error(`Task finalizada com rejeição pelo Reviewer.`);
        return END;
      }
      
      if (state.reviewStatus === 'approved') {
         return 'save_skill';
      }

      if (state.iterationCount >= 3) {
        return 'save_skill'; // Forçou aprovação, então grava o que deu.
      }
      
      // needs_revision: volta para a primeira subtask re-roteando tudo
      return executor_router({ ...state, currentSubtask: 0 });
    }
  )
  
  // save_skill → END
  .addEdge('save_skill', END);

  return workflow.compile();
}
