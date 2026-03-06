/**
 * ORACLE-OS Main State Graph — Sprint 10
 * Loop completo: Planner → executor_router → Executor → Reviewer → END
 * Com re-execução se needs_revision e iterationCount < 3
 * Sprint 8: CostTracker integrado para rastrear tokens reais por agente
 * Sprint 9: Skill Generator inteligente + logging estruturado aprimorado
 * Sprint 10: shortTermMemory para consciência contextual entre agentes
 *            + emissão de eventos agent:cost para métricas em tempo real
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { OracleState } from '../state/oracle-state.js';
import { plannerAgent } from '../agents/planner.js';
import { executorAgent } from '../agents/executor.js';
import { frontendExecutorAgent } from '../agents/frontend-executor.js';
import { backendExecutorAgent } from '../agents/backend-executor.js';
import { reviewerAgent } from '../agents/reviewer.js';
import { saveTaskAsSkill } from '../rag/rag-pipeline.js';
import { generateSkillFromTask } from '../rag/skill-generator.js';
import { startTask, completeTask } from '../monitoring/metrics.js';
import { plannerLogger, executorLogger, reviewerLogger, systemLogger } from '../monitoring/logger.js';
import { CostTracker } from '../monitoring/cost-tracker.js';
import { config } from '../config.js';

// ─── Singleton CostTracker ────────────────────────────────────────────────────
const costTracker = new CostTracker();

// ─── Exportar costTracker para uso externo (ex: OracleBridge) ─────────────────
export { costTracker };

// ─── Helper: estima tokens a partir do tamanho string (fallback) ─────────────
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── Tipos das arestas do grafo ───────────────────────────────────────────────

type PlannerEdge = 'frontend_executor' | 'backend_executor' | 'executor' | typeof END;
type ExecutorEdge = 'reviewer' | 'frontend_executor' | 'backend_executor' | 'executor';
type ReviewerEdge = 'save_skill' | 'frontend_executor' | 'backend_executor' | 'executor' | typeof END;

// ─── Função de roteamento por conteúdo ────────────────────────────────────────

function executor_router(state: OracleState): 'frontend_executor' | 'backend_executor' | 'executor' {
  const subtask = state.subtasks[state.currentSubtask];
  if (!subtask) return 'executor';

  const typeLower = (subtask.type || '').toLowerCase();
  
  if (typeLower.includes('react') || typeLower.includes('next') || typeLower.includes('component')) {
    return 'frontend_executor';
  }
  
  if (typeLower.includes('api') || typeLower.includes('node') || typeLower.includes('python')) {
    return 'backend_executor';
  }

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
      shortTermMemory: null,
    },
  })
  // ── Nó: Planner ─────────────────────────────────────────────────────────────
  .addNode('planner', async (state: OracleState) => {
    const taskId = Math.random().toString(36).substr(2, 9);

    if (state.iterationCount === 0 && state.subtasks.length === 0) {
      startTask(taskId, state.task, state);
      costTracker.startTask(taskId, 2000);
    }

    plannerLogger.info('🧠 Iniciando planejamento de task...');
    const result = await plannerAgent(state);

    // Rastreia tokens do planner
    const inputTokens = estimateTokens(state.task);
    const outputTokens = estimateTokens(JSON.stringify(result.subtasks ?? []));
    costTracker.track(taskId, 'planner', {
      input: inputTokens,
      output: outputTokens,
      model: config.agents.planner.modelId,
    });
    plannerLogger.info(`💰 Planner: ~${inputTokens + outputTokens} tokens estimados`);

    // Adiciona resumo do planner à memória de curto prazo
    const subtaskTitles = (result.subtasks ?? []).map((s: any) => s.title).join(', ');
    const memoryEntry = `[Planner] Decompôs a tarefa em ${(result.subtasks ?? []).length} subtasks: ${subtaskTitles}`;

    return {
      ...result,
      shortTermMemory: [...(state.shortTermMemory ?? []), memoryEntry],
    };
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

      const memoryEntry = `[Executor/frontend] Subtask "${subtask.title}" → ${result.status}. Files: ${result.filesModified.join(', ')}`;

      return {
        results: { ...state.results, [subtask.id]: result },
        currentSubtask: state.currentSubtask + 1,
        shortTermMemory: [...(state.shortTermMemory ?? []), memoryEntry],
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const memoryEntry = `[Executor/frontend] Subtask "${subtask.title}" → FAILED: ${error.message}`;

      return {
        results: {
          ...state.results,
          [subtask.id]: { subtaskId: subtask.id, status: 'failed', output: error.message, toolCallsExecuted: [], filesModified: [], timestamp: new Date().toISOString() },
        },
        errors: [...(state.errors ?? []), error],
        currentSubtask: state.currentSubtask + 1,
        shortTermMemory: [...(state.shortTermMemory ?? []), memoryEntry],
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

      const memoryEntry = `[Executor/backend] Subtask "${subtask.title}" → ${result.status}. Files: ${result.filesModified.join(', ')}`;

      return {
        results: { ...state.results, [subtask.id]: result },
        currentSubtask: state.currentSubtask + 1,
        shortTermMemory: [...(state.shortTermMemory ?? []), memoryEntry],
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const memoryEntry = `[Executor/backend] Subtask "${subtask.title}" → FAILED: ${error.message}`;

      return {
        results: {
          ...state.results,
          [subtask.id]: { subtaskId: subtask.id, status: 'failed', output: error.message, toolCallsExecuted: [], filesModified: [], timestamp: new Date().toISOString() },
        },
        errors: [...(state.errors ?? []), error],
        currentSubtask: state.currentSubtask + 1,
        shortTermMemory: [...(state.shortTermMemory ?? []), memoryEntry],
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
    const result = await reviewerAgent(state);

    // Rastreia tokens do reviewer
    const resultsStr = JSON.stringify(state.results);
    const inputTokens = estimateTokens(state.task + resultsStr);
    const outputTokens = estimateTokens(JSON.stringify(result));
    const taskId = 'current';
    costTracker.track(taskId, 'reviewer', {
      input: inputTokens,
      output: outputTokens,
      model: config.agents.reviewer.modelId,
    });
    reviewerLogger.info(`💰 Reviewer: ~${inputTokens + outputTokens} tokens estimados`);

    // Adiciona resumo do reviewer à memória de curto prazo
    const memoryEntry = `[Reviewer] Tentativa ${(result.iterationCount ?? state.iterationCount + 1)}/3 → ${result.reviewStatus}.` +
      (result.revisionNotes ? ` Notas: ${result.revisionNotes.substring(0, 200)}` : '');

    return {
      ...result,
      shortTermMemory: [...(state.shortTermMemory ?? []), memoryEntry],
    };
  })

  // ── Nó: Memória RAG (Save Skill) ──────────────────────────────────────────────────
  .addNode('save_skill', async (state: OracleState) => {
    await saveTaskAsSkill(state);

    try {
      const generatedSkill = await generateSkillFromTask(state);
      if (generatedSkill) {
        systemLogger.info(`🧠 Nova skill gerada: "${generatedSkill.title}" (id=${generatedSkill.id})`, {
          skillId: generatedSkill.id,
          tags: generatedSkill.tags,
          score: generatedSkill.successRate,
        });
      }
    } catch (skillErr) {
      systemLogger.warn('Falha na geração de skill inteligente (não crítico).', {
        error: String(skillErr),
      });
    }

    const taskId = 'current';
    const report = costTracker.getTaskReport(taskId);
    const comparison = costTracker.compareWithEstimate(taskId);
    systemLogger.info('🎉 Task workflow completado e documentado!', {
      totalCostUSD: report.totalCostUSD.toFixed(6),
      tokens: {
        planner:  report.planner.tokens,
        executor: report.executor.tokens,
        reviewer: report.reviewer.tokens,
      },
      estimateEfficiency: comparison.efficiency.toFixed(1) + '%',
    });

    const id = Math.random().toString(36).substr(2, 9);
    completeTask(id, state);
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
      if (state.reviewStatus === 'rejected') {
        const id = Math.random().toString(36).substr(2, 9);
        completeTask(id, state);
        systemLogger.error(`Task finalizada com rejeição pelo Reviewer.`);
        return END;
      }
      
      if (state.reviewStatus === 'approved') {
         return 'save_skill';
      }

      if (state.iterationCount >= 3) {
        return 'save_skill';
      }
      
      // needs_revision: volta para a primeira subtask re-roteando tudo
      return executor_router({ ...state, currentSubtask: 0 });
    }
  )
  
  // save_skill → END
  .addEdge('save_skill', END);

  return workflow.compile();
}
