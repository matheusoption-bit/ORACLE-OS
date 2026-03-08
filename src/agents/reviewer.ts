/**
 * ORACLE-OS Reviewer Node (Architect) — Quadripartite Architecture
 * 
 * Stage 2: Architecture & Security Review
 * 
 * Acts as a Red Team. Takes the Analyst's Context Document and criticizes it
 * for architectural flaws, security risks, or redundancy BEFORE any code is written.
 * 
 * Outputs:
 *   - 'approved' → Execution Blueprint with decomposed subtasks → goes to Executor
 *   - 'needs_revision' → Sends feedback back to Analyst (max 3 iterations)
 *   - 'rejected' → Hard stop, task is rejected
 */

import { z } from 'zod';
import { HumanMessage } from '@langchain/core/messages';
import { createModel } from '../models/model-registry.js';
import { config } from '../config.js';
import {
  OracleState,
  Subtask,
  ExecutionBlueprint,
} from '../state/oracle-state.js';
import { REVIEWER_SYSTEM_PROMPT } from '../prompts/reviewer.prompt.js';
import { reviewerLogger, systemLogger } from '../monitoring/logger.js';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const SubtaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  type: z.enum(['code', 'file', 'search', 'review', 'other']),
  priority: z.number().min(1).max(5),
  dependsOn: z.array(z.string()).default([]),
  assignedAgent: z.enum(['frontend', 'backend', 'devops', 'data', 'security', 'geral']).default('geral'),
  dependencies: z.array(z.string()).default([]),
  estimatedDuration: z.number().default(15),
  tools: z.array(z.string()).default([]),
  validationCriteria: z.string().default(''),
});

const BlueprintSchema = z.object({
  status: z.enum(['approved', 'needs_revision', 'rejected']),
  subtasks: z.array(SubtaskSchema).default([]),
  executionPlan: z.enum(['sequential', 'parallel', 'mixed']).default('sequential'),
  architecturalNotes: z.string().default(''),
  securityRisks: z.array(z.string()).default([]),
  redundanciesFound: z.array(z.string()).default([]),
  feedbackToAnalyst: z.string().optional(),
});

export type BlueprintOutput = z.infer<typeof BlueprintSchema>;

// ─── Reviewer Node — LangGraph Node Function ────────────────────────────────

/**
 * reviewerNode — Nó LangGraph (Stage 2)
 * 
 * Recebe o Context Document do Analyst, faz revisão arquitetural e de segurança,
 * e produz um Execution Blueprint ou envia feedback para re-análise.
 */
export async function reviewerNode(
  state: OracleState
): Promise<Partial<OracleState>> {
  const iteration = state.iterationCount + 1;
  const maxIterations = config.pipeline.maxReviewerAnalystIterations;

  reviewerLogger.info(`🏗️  [Reviewer] Revisão arquitetural — tentativa ${iteration}/${maxIterations}...`);

  // Guard: se atingiu máximo de iterações, forçar aprovação
  if (iteration > maxIterations) {
    reviewerLogger.warn(`⚠️  [Reviewer] Máximo de iterações atingido (${maxIterations}) — forçando aprovação.`);
    return buildForceApproveResult(state);
  }

  const model = createModel({
    modelId: config.agents.reviewer.modelId,
    temperature: config.agents.reviewer.temperature,
  });

  const structuredModel = model.withStructuredOutput(BlueprintSchema);

  // Montar o prompt com o Context Document do Analyst
  const contextDoc = state.contextDocument;
  const contextDocStr = contextDoc
    ? JSON.stringify(contextDoc, null, 2)
    : '(Context Document não disponível — Analyst pode ter falhado)';

  // Memória de curto prazo
  const memoryBlock = (state.shortTermMemory ?? []).length > 0
    ? `\n<short_term_memory>\nHistórico de decisões e resultados neste ciclo:\n${state.shortTermMemory.map((m, i) => `[${i + 1}] ${m}`).join('\n')}\n</short_term_memory>\n`
    : '';

  const userPrompt = `${REVIEWER_SYSTEM_PROMPT}

<tarefa_original>
${state.task}
</tarefa_original>

<context_document>
${contextDocStr}
</context_document>
${memoryBlock}
<contexto_iteracao>
Tentativa: ${iteration} de ${maxIterations}
${state.executionBlueprint?.feedbackToAnalyst ? `Feedback anterior enviado ao Analyst: ${state.executionBlueprint.feedbackToAnalyst}` : ''}
</contexto_iteracao>

<available_tools>
- file_read, file_write, file_list
- shell_exec, shell_npm, shell_git
- github_create_pr, github_list_issues
- browser_navigate, browser_click, browser_screenshot
- db_query, db_insert
</available_tools>

Revise o Context Document como um Red Team (arquitetura + segurança).
Se aprovado, decomponha em subtasks executáveis.
Se precisar de re-análise, forneça feedback específico para o Analyst.
Retorne o Execution Blueprint JSON completo.`;

  try {
    const result = await structuredModel.invoke([new HumanMessage(userPrompt)]);

    const rawStatus = (result as any).status ?? (result as any).reviewStatus ?? 'needs_revision';
    let finalStatus = rawStatus as ExecutionBlueprint['status'];
    let feedbackToAnalyst = (result as any).feedbackToAnalyst;
    let revisionNotes = (result as any).revisionNotes ?? (result as any).architecturalNotes ?? '';
    const securityRisks = Array.isArray((result as any).securityRisks) ? (result as any).securityRisks : [];
    const redundanciesFound = Array.isArray((result as any).redundanciesFound) ? (result as any).redundanciesFound : [];

    // Guard: se rejeita ou pede revisão mas já atingiu limite, forçar aprovação
    if ((finalStatus === 'rejected' || finalStatus === 'needs_revision') && iteration >= maxIterations) {
      reviewerLogger.warn(`⚠️  [Reviewer] Limite de iterações atingido. Forçando aprovação com warnings.`);
      finalStatus = 'approved';
      feedbackToAnalyst = `[FORCED APPROVAL - MAX ITERATIONS EXCEEDED] ${feedbackToAnalyst ?? ''}`.trim();
      revisionNotes = `[FORCED APPROVAL - MAX ITERATIONS EXCEEDED] ${revisionNotes ?? ''}`.trim();
    }

    // Mapear subtasks com retrocompatibilidade
    const subtasks: Subtask[] = ((result as any).subtasks || []).map((s: any) => ({
      ...s,
      dependencies: s.dependencies ?? s.dependsOn ?? [],
      dependsOn: s.dependsOn ?? [],
      assignedAgent: ['frontend', 'backend', 'devops', 'data', 'security'].includes(s.assignedAgent)
        ? (s.assignedAgent as Subtask['assignedAgent'])
        : 'geral',
    }));

    // Limitar número de subtasks
    const limitedSubtasks = subtasks.slice(0, config.pipeline.maxSubtasksPerBlueprint);

    const blueprint: ExecutionBlueprint = {
      status: finalStatus,
      subtasks: limitedSubtasks,
      executionPlan: (result as any).executionPlan ?? 'sequential',
      architecturalNotes: revisionNotes,
      securityRisks,
      redundanciesFound,
      feedbackToAnalyst,
      timestamp: new Date().toISOString(),
    };

    // Determinar próximo estágio
    let nextStage: OracleState['currentStage'];
    let reviewStatus: OracleState['reviewStatus'];

    if (finalStatus === 'approved') {
      nextStage = 'executor';
      reviewStatus = 'approved';
      reviewerLogger.info(`✅ [Reviewer] Blueprint APROVADO — ${limitedSubtasks.length} subtasks para execução.`);
    } else if (finalStatus === 'needs_revision') {
      nextStage = 'analyst';
      reviewStatus = 'needs_revision';
      reviewerLogger.info(`🔄 [Reviewer] Enviando feedback ao Analyst para re-análise.`);
    } else {
      nextStage = 'completed';
      reviewStatus = 'rejected';
      reviewerLogger.error(`❌ [Reviewer] Blueprint REJEITADO.`);
    }

    // Memória de curto prazo
    const memoryEntry = `[Reviewer] Tentativa ${iteration}/${maxIterations} → ${finalStatus}. ` +
      `Subtasks: ${limitedSubtasks.length}. ` +
      `Riscos de segurança: ${securityRisks.length}. ` +
      `Redundâncias: ${redundanciesFound.length}.` +
      (feedbackToAnalyst ? ` Feedback: ${feedbackToAnalyst.substring(0, 150)}` : '');

    return {
      executionBlueprint: blueprint,
      subtasks: limitedSubtasks,
      currentSubtask: 0,
      currentStage: nextStage,
      reviewStatus,
      revisionNotes,
      iterationCount: iteration,
      shortTermMemory: [...(state.shortTermMemory ?? []), memoryEntry],
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('❌ [Reviewer] Erro na revisão:', error.message);

    if (iteration >= maxIterations) {
      return buildForceApproveResult(state);
    }

    const memoryEntry = `[Reviewer] ERRO na tentativa ${iteration}: ${error.message}`;

    return {
      reviewStatus: 'needs_revision',
      revisionNotes: `Falha interna no Reviewer: ${error.message}`,
      iterationCount: iteration,
      currentStage: 'analyst',
      errors: [...(state.errors ?? []), error],
      shortTermMemory: [...(state.shortTermMemory ?? []), memoryEntry],
    };
  }
}

// ─── Force Approve Helper ────────────────────────────────────────────────────

function buildForceApproveResult(state: OracleState): Partial<OracleState> {
  systemLogger.warn('⚠️  [Reviewer] Forçando aprovação — máximo de iterações excedido.');

  // Se já temos um blueprint parcial, usar suas subtasks
  const existingSubtasks = state.executionBlueprint?.subtasks ?? state.subtasks ?? [];

  // Se não temos subtasks, criar uma genérica baseada na task
  const subtasks: Subtask[] = existingSubtasks.length > 0
    ? existingSubtasks
    : [{
        id: 'auto-1',
        title: state.task.substring(0, 80),
        description: state.task,
        type: 'code',
        priority: 1,
        dependsOn: [],
        assignedAgent: 'geral',
        dependencies: [],
        estimatedDuration: 30,
        tools: ['file_read', 'file_write', 'shell_exec'],
        validationCriteria: 'Task executada sem erros críticos',
      }];

  const blueprint: ExecutionBlueprint = {
    status: 'approved',
    subtasks,
    executionPlan: 'sequential',
    architecturalNotes: '[FORCED APPROVAL - MAX ITERATIONS EXCEEDED] Limite de iterações atingido. Prosseguindo com blueprint mínimo.',
    securityRisks: [],
    redundanciesFound: [],
    feedbackToAnalyst: undefined,
    timestamp: new Date().toISOString(),
  };

  const memoryEntry = `[Reviewer] AUTO-APROVAÇÃO forçada após ${state.iterationCount + 1} iterações.`;

  return {
    executionBlueprint: blueprint,
    subtasks,
    currentSubtask: 0,
    currentStage: 'executor',
    reviewStatus: 'approved',
    revisionNotes: '[FORCED APPROVAL - MAX ITERATIONS EXCEEDED] Limite de iterações atingido.',
    iterationCount: state.iterationCount + 1,
    shortTermMemory: [...(state.shortTermMemory ?? []), memoryEntry],
  };
}

// ─── Legacy export for backward compatibility ────────────────────────────────

export async function reviewerAgent(state: OracleState): Promise<Partial<OracleState>> {
  return reviewerNode(state);
}
