/**
 * ORACLE-OS Reviewer Agent — Sprint 4
 * Valida resultados dos executors, suporta needs_revision e force-approve
 * Função LangGraph nativa com output estruturado Zod
 */

import { z } from 'zod';
import { HumanMessage } from '@langchain/core/messages';
import { createModel } from '../models/model-registry.js';
import { config } from '../config.js';
import { OracleState } from '../state/oracle-state.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// ─── Schemas Zod ──────────────────────────────────────────────────────────────

const IssueSchema = z.object({
  severity: z.enum(['critical', 'major', 'minor']),
  description: z.string(),
  suggestedFix: z.string(),
});

const ReviewSchema = z.object({
  status: z.enum(['approved', 'rejected', 'needs_revision']),
  issues: z.array(IssueSchema).default([]),
  revisionNotes: z.string().optional(),
  summary: z.string(),
});

export type Review = z.infer<typeof ReviewSchema>;
export type ReviewIssue = z.infer<typeof IssueSchema>;

// ─── Carrega prompt template ──────────────────────────────────────────────────

function loadReviewerPrompt(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dir = dirname(__filename);
    return readFileSync(resolve(__dir, '../../prompts/agents/reviewer-prompt.md'), 'utf-8');
  } catch {
    return `Você é o ORACLE Reviewer. Avalie os resultados dos Executors e decida:
- approved: tudo concluído e funcional
- needs_revision: há problemas corrigíveis — forneça revisionNotes específicos
- rejected: falha grave ou estrutural`;
  }
}

// ─── Força aprovação após max tentativas ──────────────────────────────────────

function buildForceApproveResult(): Partial<OracleState> {
  console.warn('⚠️  Reviewer: Máximo de tentativas atingido — forçando aprovação com warnings.');
  return {
    reviewStatus: 'approved',
    revisionNotes: '[AUTO-APROVADO] Máximo de 3 iterações atingido. Revisar manualmente.',
    iterationCount: 3,
  };
}

// ─── Função principal — nó LangGraph ─────────────────────────────────────────

/**
 * reviewerAgent — nó LangGraph
 * Analisa state.results e state.errors, retorna atualização do estado com reviewStatus.
 */
export async function reviewerAgent(
  state: OracleState
): Promise<Partial<OracleState>> {
  console.log(`🔍 Reviewer: Avaliando resultados (tentativa ${state.iterationCount + 1}/3)...`);

  // Force-approve após 3 tentativas — sem chamar o LLM
  if (state.iterationCount >= 3) {
    return buildForceApproveResult();
  }

  const model = createModel({
    modelId: config.agents.reviewer.modelId,
    temperature: config.agents.reviewer.temperature,
  });

  const structuredModel = model.withStructuredOutput(ReviewSchema);
  const systemPrompt = loadReviewerPrompt();

  // Serializa resultados e erros de forma segura (sem circular refs)
  const resultsJson = JSON.stringify(state.results, null, 2);
  const errorsJson = state.errors.length > 0
    ? JSON.stringify(state.errors.map((e) => ({ message: e.message, name: e.name })), null, 2)
    : '[]';

  // Sumário dos subtasks para contexto
  const subtasksSummary = state.subtasks
    .map((s) => `- [${s.id}] ${s.title} (${s.type}, prioridade ${s.priority})`)
    .join('\n');

  const userPrompt = `${systemPrompt}

<tarefa_original>
${state.task}
</tarefa_original>

<subtasks_planejados>
${subtasksSummary}
</subtasks_planejados>

<resultados_dos_executors>
${resultsJson}
</resultados_dos_executors>

<erros_capturados>
${errorsJson}
</erros_capturados>

<contexto_iteracao>
Tentativa: ${state.iterationCount + 1} de 3
${state.revisionNotes ? `Notas da revisão anterior: ${state.revisionNotes}` : ''}
</contexto_iteracao>

Avalie o trabalho produzido e retorne sua decisão estruturada.`;

  const review = await structuredModel.invoke([new HumanMessage(userPrompt)]);

  // Extrai erros críticos para state.errors (mantém compatibilidade)
  const criticalErrors = review.issues
    .filter((i) => i.severity === 'critical')
    .map((i) => new Error(`[CRÍTICO] ${i.description} → Correção: ${i.suggestedFix}`));

  return {
    reviewStatus: review.status,
    revisionNotes: review.revisionNotes,
    errors: criticalErrors.length > 0 ? criticalErrors : state.errors,
    iterationCount: state.iterationCount + 1,
  };
}
