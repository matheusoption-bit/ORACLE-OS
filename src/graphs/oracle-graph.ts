/**
 * ORACLE-OS Main State Graph — Quadripartite Architecture
 * 
 * 4-Stage Pipeline: Analyst → Reviewer (Architect) → Executor → Synthesis
 * 
 * Flow:
 *   START → analyst → reviewer → (approved?) → executor → synthesis → END
 *                        ↓ (needs_revision)
 *                      analyst (max 3 iterations)
 *                        ↓ (rejected)
 *                       END
 * 
 * Executor sub-routing preserved:
 *   executor_router → frontend_executor | backend_executor | executor (generic)
 * 
 * Guards:
 *   - Max 3 Reviewer↔Analyst iterations before forced approval
 *   - Max 3 Executor retries before TODO comment and move on
 *   - CostTracker integrated for real token tracking per agent
 *   - shortTermMemory for contextual awareness between agents
 *   - State events emitted for dashboard/monitoring
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { OracleState } from '../state/oracle-state.js';
import { analystNode } from '../agents/analyst.js';
import { reviewerNode } from '../agents/reviewer.js';
import { executorNode, executorAgent, executorRouter } from '../agents/executor.js';
import { frontendExecutorAgent } from '../agents/frontend-executor.js';
import { backendExecutorAgent } from '../agents/backend-executor.js';
import { synthesisNode, costTracker } from '../agents/synthesis.js';
import { startTask } from '../monitoring/metrics.js';
import { systemLogger } from '../monitoring/logger.js';
import { config } from '../config.js';

// ─── Export costTracker for external use (e.g., OracleBridge) ────────────────
export { costTracker };

// ─── Helper: estimate tokens from string length (fallback) ──────────────────
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── Edge Types ──────────────────────────────────────────────────────────────

type AnalystEdge = 'reviewer';
type ReviewerEdge = 'analyst' | 'executor' | typeof END;
type ExecutorEdge = 'synthesis';
type SynthesisEdge = typeof END;

// ─── Graph Creation ──────────────────────────────────────────────────────────

export function createOracleGraph() {
  const workflow = new StateGraph<OracleState>({
    channels: {
      task: null,
      currentStage: null,
      contextDocument: null,
      executionBlueprint: null,
      executedCode: null,
      synthesisOutput: null,
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

  // ══════════════════════════════════════════════════════════════════════════
  // STAGE 1: ANALYST (Context & RAG)
  // ══════════════════════════════════════════════════════════════════════════
  .addNode('analyst', async (state: OracleState) => {
    const taskId = Math.random().toString(36).substr(2, 9);

    // Start task metrics on first entry
    if (state.iterationCount === 0 && !state.contextDocument) {
      startTask(taskId, state.task, state);
      costTracker.startTask(taskId, 2000);
    }

    systemLogger.info('🔬 [Pipeline] Stage 1: Analyst — Análise de contexto e requisitos');

    const result = await analystNode(state);

    // Track analyst tokens
    const inputTokens = estimateTokens(state.task);
    const outputTokens = estimateTokens(JSON.stringify(result.contextDocument ?? {}));
    costTracker.track(taskId, 'analyst', {
      input: inputTokens,
      output: outputTokens,
      model: config.agents.analyst.modelId,
    });

    return result;
  })

  // ══════════════════════════════════════════════════════════════════════════
  // STAGE 2: REVIEWER (Architecture & Security — Red Team)
  // ══════════════════════════════════════════════════════════════════════════
  .addNode('reviewer', async (state: OracleState) => {
    systemLogger.info(`🏗️  [Pipeline] Stage 2: Reviewer — Revisão arquitetural (iteração ${state.iterationCount + 1}/${config.pipeline.maxReviewerAnalystIterations})`);

    const result = await reviewerNode(state);

    // Track reviewer tokens
    const inputTokens = estimateTokens(JSON.stringify(state.contextDocument ?? {}));
    const outputTokens = estimateTokens(JSON.stringify(result.executionBlueprint ?? {}));
    const taskId = 'current';
    costTracker.track(taskId, 'reviewer', {
      input: inputTokens,
      output: outputTokens,
      model: config.agents.reviewer.modelId,
    });

    return result;
  })

  // ══════════════════════════════════════════════════════════════════════════
  // STAGE 3: EXECUTOR (The Sandbox Worker — E2B + MCP)
  // ══════════════════════════════════════════════════════════════════════════
  .addNode('executor', async (state: OracleState) => {
    systemLogger.info('⚙️  [Pipeline] Stage 3: Executor — Execução no E2B Sandbox');

    const result = await executorNode(state);

    // Track executor tokens (aggregate)
    const inputTokens = estimateTokens(JSON.stringify(state.subtasks));
    const outputTokens = estimateTokens(JSON.stringify(result.results ?? {}));
    const taskId = 'current';
    costTracker.track(taskId, 'executor', {
      input: inputTokens,
      output: outputTokens,
      model: config.agents.executor.modelId,
    });

    return result;
  })

  // ── Specialized Executor sub-nodes (preserved from Sprint 10) ─────────
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
          [subtask.id]: {
            subtaskId: subtask.id,
            status: 'failed',
            output: error.message,
            toolCallsExecuted: [],
            filesModified: [],
            timestamp: new Date().toISOString(),
          },
        },
        errors: [...(state.errors ?? []), error],
        currentSubtask: state.currentSubtask + 1,
        shortTermMemory: [...(state.shortTermMemory ?? []), memoryEntry],
      };
    }
  })

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
          [subtask.id]: {
            subtaskId: subtask.id,
            status: 'failed',
            output: error.message,
            toolCallsExecuted: [],
            filesModified: [],
            timestamp: new Date().toISOString(),
          },
        },
        errors: [...(state.errors ?? []), error],
        currentSubtask: state.currentSubtask + 1,
        shortTermMemory: [...(state.shortTermMemory ?? []), memoryEntry],
      };
    }
  })

  // ══════════════════════════════════════════════════════════════════════════
  // STAGE 4: SYNTHESIS (Documentation & Integration)
  // ══════════════════════════════════════════════════════════════════════════
  .addNode('synthesis', async (state: OracleState) => {
    systemLogger.info('📝 [Pipeline] Stage 4: Synthesis — Documentação e integração final');
    return synthesisNode(state);
  })

  // ══════════════════════════════════════════════════════════════════════════
  // EDGES — Quadripartite Pipeline Wiring
  // ══════════════════════════════════════════════════════════════════════════

  // START → analyst (always begins with analysis)
  .addEdge(START, 'analyst')

  // analyst → reviewer (always goes to review after analysis)
  .addEdge('analyst', 'reviewer')

  // reviewer → conditional routing
  .addConditionalEdges(
    'reviewer',
    (state): ReviewerEdge => {
      // REJECTED → END (hard stop)
      if (state.reviewStatus === 'rejected') {
        systemLogger.error('❌ [Pipeline] Task rejeitada pelo Reviewer.');
        return END;
      }

      // APPROVED → executor (proceed to code execution)
      if (state.reviewStatus === 'approved') {
        return 'executor';
      }

      // NEEDS_REVISION → back to analyst (with iteration guard)
      if (state.iterationCount >= config.pipeline.maxReviewerAnalystIterations) {
        // Guard: max iterations exceeded, force to executor
        systemLogger.warn('⚠️  [Pipeline] Max iterations exceeded — forcing to executor.');
        return 'executor';
      }

      return 'analyst';
    }
  )

  // executor → synthesis (after all subtasks executed)
  .addEdge('executor', 'synthesis')

  // frontend_executor → next subtask or synthesis
  .addConditionalEdges(
    'frontend_executor',
    (state) => {
      if (state.currentSubtask >= state.subtasks.length) return 'synthesis';
      return executorRouter(state);
    }
  )

  // backend_executor → next subtask or synthesis
  .addConditionalEdges(
    'backend_executor',
    (state) => {
      if (state.currentSubtask >= state.subtasks.length) return 'synthesis';
      return executorRouter(state);
    }
  )

  // synthesis → END (pipeline complete)
  .addEdge('synthesis', END);

  return workflow.compile();
}
