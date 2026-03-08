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
 *   - 'needs_revision' → Sends feedback back to Analyst (guarded by PipelineGuards)
 *   - 'rejected' → Hard stop, task is rejected
 *
 * Issue #10: validates inputs and outputs with Zod schemas.
 * Issue #11: uses PipelineGuards for iteration limit enforcement.
 */

import { z } from 'zod';
import { HumanMessage } from '@langchain/core/messages';
import { createModel } from '../models/model-registry.js';
import { config } from '../config.js';
import type { SupervisorState, Subtask, ExecutionBlueprint } from '../state/schemas.js';
import { REVIEWER_SYSTEM_PROMPT } from '../prompts/reviewer.prompt.js';
import { reviewerLogger, systemLogger } from '../monitoring/logger.js';
import { PipelineGuards } from '../pipeline/guards.js';
import { validateReviewerOutput } from '../pipeline/validators.js';
import { guardReason, isValidationFailed } from '../pipeline/type-helpers.js';

// ─── Pipeline guards (Issue #11) ─────────────────────────────────────────────
const guards = new PipelineGuards(config.pipeline);

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
 *
 * Issue #11: uses PipelineGuards.checkReviewerAnalyst() to enforce the
 * maximum number of Reviewer ↔ Analyst cycles.
 */
export async function reviewerNode(
  state: SupervisorState
): Promise<Partial<SupervisorState>> {
  const iteration = state.iterationCount + 1;
  const maxIterations = guards.getConfig().maxReviewerAnalystIterations;

  reviewerLogger.info(`🏗️  [Reviewer] Revisão arquitetural — tentativa ${iteration}/${maxIterations}...`);

  // ── Issue #11: guard check — force approval if limit exceeded ─────────────
  const guardDecision = guards.checkReviewerAnalyst(state.iterationCount);
  if (!guardDecision.allowed) {
    reviewerLogger.warn(`⚠️  [Reviewer] ${guardReason(guardDecision)}`);
    return buildForceApproveResult(state);
  }

  const model = createModel({
    modelId: config.agents.reviewer.modelId,
    temperature: config.agents.reviewer.temperature,
  });

  const structuredModel = model.withStructuredOutput(BlueprintSchema);

  const contextDoc = state.contextDocument;
  const contextDocStr = contextDoc
    ? JSON.stringify(contextDoc, null, 2)
    : '(Context Document não disponível — Analyst pode ter falhado)';

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
    let feedbackToAnalyst = (result as any).feedbackToAnalyst as string | undefined;
    let revisionNotes: string = (result as any).revisionNotes ?? (result as any).architecturalNotes ?? '';
    const securityRisks: string[] = Array.isArray((result as any).securityRisks) ? (result as any).securityRisks : [];
    const redundanciesFound: string[] = Array.isArray((result as any).redundanciesFound) ? (result as any).redundanciesFound : [];

    // ── Issue #11: if still requesting revision at last allowed iteration, force approve ──
    const nextGuardDecision = guards.checkReviewerAnalyst(iteration);
    if ((finalStatus === 'rejected' || finalStatus === 'needs_revision') && !nextGuardDecision.allowed) {
      reviewerLogger.warn(`⚠️  [Reviewer] ${guardReason(nextGuardDecision)}`);
      finalStatus = 'approved';
      feedbackToAnalyst = `[FORCED APPROVAL - MAX ITERATIONS EXCEEDED] ${feedbackToAnalyst ?? ''}`.trim();
      revisionNotes = `[FORCED APPROVAL - MAX ITERATIONS EXCEEDED] ${revisionNotes}`.trim();
    }

    // Mapear subtasks com retrocompatibilidade
    const rawSubtasks: Subtask[] = ((result as any).subtasks || []).map((s: any) => ({
      ...s,
      dependencies: s.dependencies ?? s.dependsOn ?? [],
      dependsOn: s.dependsOn ?? [],
      assignedAgent: ['frontend', 'backend', 'devops', 'data', 'security'].includes(s.assignedAgent)
        ? (s.assignedAgent as Subtask['assignedAgent'])
        : 'geral',
    }));

    // ── Issue #11: clamp subtask count via guard ───────────────────────────────
    const limitedSubtasks = guards.clampSubtasks(rawSubtasks);
    if (limitedSubtasks.length < rawSubtasks.length) {
      reviewerLogger.warn(
        `⚠️  [Reviewer] Blueprint had ${rawSubtasks.length} subtasks; clamped to ${limitedSubtasks.length} ` +
        `(maxSubtasksPerBlueprint=${guards.getConfig().maxSubtasksPerBlueprint}).`
      );
    }

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

    // ── Issue #10: validate the produced blueprint ────────────────────────────
    const outputValidation = validateReviewerOutput(blueprint);
    if (isValidationFailed(outputValidation)) {
      reviewerLogger.warn(`⚠️  [Reviewer] Output validation warning: ${outputValidation.error.message}`);
    } else if (outputValidation.warnings.length > 0) {
      outputValidation.warnings.forEach((w) => reviewerLogger.warn(`⚠️  [Reviewer] ${w}`));
    }

    // Determinar próximo estágio
    let nextStage: SupervisorState['currentStage'];
    let reviewStatus: SupervisorState['reviewStatus'];

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

    // ── Issue #11: if at iteration limit, force approve instead of looping ────
    const retryDecision = guards.checkReviewerAnalyst(iteration);
    if (!retryDecision.allowed) {
      reviewerLogger.warn(`⚠️  [Reviewer] ${guardReason(retryDecision)}`);
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

function buildForceApproveResult(state: SupervisorState): Partial<SupervisorState> {
  systemLogger.warn('⚠️  [Reviewer] Forçando aprovação — máximo de iterações excedido.');

  const existingSubtasks = state.executionBlueprint?.subtasks ?? state.subtasks ?? [];

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
    architecturalNotes: '[FORCED APPROVAL - MAX ITERATIONS EXCEEDED] Limite de iterações atingido.',
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

export async function reviewerAgent(state: SupervisorState): Promise<Partial<SupervisorState>> {
  return reviewerNode(state);
}
