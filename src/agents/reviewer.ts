import { z } from 'zod';
import { HumanMessage } from '@langchain/core/messages';
import { createModel } from '../models/model-registry.js';
import { config } from '../config.js';
import { OracleState } from '../state/oracle-state.js';
import { REVIEWER_SYSTEM_PROMPT } from '../prompts/reviewer.prompt.js';

// ─── Schemas Zod ──────────────────────────────────────────────────────────────

const ReviewSchema = z.object({
  reviewStatus: z.enum(['approved', 'rejected', 'needs_revision']),
  revisionNotes: z.string().optional(),
  learnings: z.string().optional(),
});

export type Review = z.infer<typeof ReviewSchema>;

// ─── Força aprovação após max tentativas ──────────────────────────────────────

function buildForceApproveResult(state: OracleState): Partial<OracleState> {
  console.warn('⚠️  Reviewer: Máximo de tentativas atingido (3) — forçando aprovação com warnings.');
  return {
    reviewStatus: 'approved',
    revisionNotes: '[AUTO-APROVADO] Limite de 3 iterações atingido. O loop foi encerrado forçadamente.',
    iterationCount: state.iterationCount + 1,
  };
}

// ─── Função principal — nó LangGraph ─────────────────────────────────────────

export async function reviewerAgent(
  state: OracleState
): Promise<Partial<OracleState>> {
  console.log(`🔍 Reviewer: Avaliando resultados (tentativa \${state.iterationCount + 1}/3)...`);

  const nextIteration = state.iterationCount + 1;

  const model = createModel({
    modelId: config.agents.reviewer.modelId,
    temperature: config.agents.reviewer.temperature,
  });

  const structuredModel = model.withStructuredOutput(ReviewSchema);
  const systemPrompt = REVIEWER_SYSTEM_PROMPT;

  const resultsJson = JSON.stringify(state.results, null, 2);
  const errorsJson = state.errors.length > 0
    ? JSON.stringify(state.errors.map((e) => ({ message: e.message, name: e.name })), null, 2)
    : '[]';

  const subtasksSummary = state.subtasks
    .map((s) => `- [\${s.id}] \${s.title} (\${s.type}, prioridade \${s.priority})`)
    .join('\n');

  const userPrompt = `\${systemPrompt}

<tarefa_original>
\${state.task}
</tarefa_original>

<subtasks_planejados>
\${subtasksSummary}
</subtasks_planejados>

<resultados_dos_executors>
\${resultsJson}
</resultados_dos_executors>

<erros_capturados>
\${errorsJson}
</erros_capturados>

<contexto_iteracao>
Tentativa: \${nextIteration} de 3
\${state.revisionNotes ? \`Notas da revisão anterior: \${state.revisionNotes}\` : ''}
</contexto_iteracao>

Avalie o trabalho produzido e retorne sua decisão estruturada considerando as diretrizes e critérios.`;

  try {
    const review = await structuredModel.invoke([new HumanMessage(userPrompt)]);
    let finalStatus = review.reviewStatus;
    let finalNotes = review.revisionNotes;

    // Se a decisão for de rejeição ou revisão, verifica se atingimos limite de segurança
    if ((finalStatus === 'rejected' || finalStatus === 'needs_revision') && nextIteration >= 3) {
      console.warn('⚠️  Reviewer: Limite máximo configurado atingido. Forçando aprovação com aviso.');
      finalStatus = 'approved';
      finalNotes = `[FORCED APPROVAL - MAX ITERATIONS EXCEEDED]\nTentativas se esgotaram.\nÚltimo feedback: \${finalNotes || 'Nenhum'}`;
    }
    
    if(review.learnings) {
        console.log(`[Learnings Extraídas] \${review.learnings.substring(0, 100)}...`);
    }

    return {
      reviewStatus: finalStatus,
      revisionNotes: finalNotes,
      iterationCount: nextIteration,
    };
  } catch (err) {
    console.error('❌ Erro no Reviewer Agent:', err);
    if (nextIteration >= 3) {
      return buildForceApproveResult(state);
    }
    return {
      reviewStatus: 'needs_revision',
      revisionNotes: 'Falha interna ao analisar resposta do modelo no Revisor.',
      iterationCount: nextIteration,
      errors: [...state.errors, err instanceof Error ? err : new Error(String(err))]
    };
  }
}
