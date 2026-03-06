/**
 * ORACLE-OS Reviewer Agent — Sprint 10
 * Avalia resultados dos executors, com shortTermMemory e geração de testes unitários
 */

import { z } from 'zod';
import { HumanMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createModel } from '../models/model-registry.js';
import { config } from '../config.js';
import { OracleState } from '../state/oracle-state.js';
import { REVIEWER_SYSTEM_PROMPT } from '../prompts/reviewer.prompt.js';
import { shellExecTool, fileWriteTool, fileReadTool } from '../tools/tool-registry.js';
import { runToolLoop } from './executor.js';

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

// ─── Geração de Testes Unitários ─────────────────────────────────────────────

const TEST_GENERATION_PROMPT = `Você é um engenheiro de qualidade especializado em testes unitários.
Gere um arquivo de teste unitário para o código fornecido.

## Regras
- Use Vitest como framework de testes
- Importe com \`import { describe, it, expect, vi } from 'vitest'\`
- Teste os cenários principais: happy path, edge cases, error handling
- Use mocks quando necessário (vi.mock, vi.fn)
- O arquivo de teste deve ser autossuficiente e executável
- Nomeie o arquivo como: \`<nome-original>.test.<ext>\`
- Máximo de 50 linhas por arquivo de teste
- Foque nos comportamentos mais críticos

## Formato de Output
Use a ferramenta file_write para criar o arquivo de teste.
Depois use shell_exec para executar: npx vitest run <arquivo> --reporter=verbose 2>&1 || true
Reporte o resultado.`;

/**
 * Identifica arquivos de código (.ts, .tsx, .py) nos resultados que podem ter testes gerados.
 */
function extractCodeFilesFromResults(state: OracleState): string[] {
  const codeFiles: string[] = [];
  const codeExtensions = ['.ts', '.tsx', '.py', '.js', '.jsx'];

  for (const result of Object.values(state.results)) {
    const r = result as { filesModified?: string[]; status?: string };
    if (r?.status === 'success' && r?.filesModified) {
      for (const file of r.filesModified) {
        const ext = '.' + (file.split('.').pop() ?? '');
        if (codeExtensions.includes(ext) && !file.includes('.test.') && !file.includes('.spec.')) {
          codeFiles.push(file);
        }
      }
    }
  }

  return [...new Set(codeFiles)];
}

/**
 * Gera testes unitários para os arquivos de código aprovados.
 * Usa o runToolLoop do executor para gerar e executar os testes.
 */
async function generateUnitTests(
  codeFiles: string[],
  state: OracleState
): Promise<{ testsGenerated: string[]; testResults: string }> {
  if (codeFiles.length === 0) {
    return { testsGenerated: [], testResults: 'Nenhum arquivo de código para testar.' };
  }

  const tools: DynamicStructuredTool[] = [fileReadTool, fileWriteTool, shellExecTool];
  const fileList = codeFiles.map((f) => `- ${f}`).join('\n');

  const taskPrompt = `Gere testes unitários para os seguintes arquivos de código que foram aprovados na revisão:

${fileList}

Para cada arquivo:
1. Leia o conteúdo com file_read
2. Gere um arquivo de teste correspondente com file_write
3. Execute o teste com shell_exec

Priorize os arquivos mais críticos se houver muitos (máximo 3 arquivos de teste).`;

  try {
    const { output, filesModified } = await runToolLoop(
      TEST_GENERATION_PROMPT,
      taskPrompt,
      tools,
      6, // maxIterations reduzido para testes
      state.shortTermMemory ?? []
    );

    const testFiles = filesModified.filter(
      (f) => f.includes('.test.') || f.includes('.spec.')
    );

    console.log(`🧪 Testes gerados: ${testFiles.length} arquivos`);

    return {
      testsGenerated: testFiles,
      testResults: output,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️ Falha na geração de testes (não crítico): ${errMsg}`);
    return {
      testsGenerated: [],
      testResults: `Erro na geração de testes: ${errMsg}`,
    };
  }
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

  // Injetar memória de curto prazo no prompt do reviewer
  const memoryBlock = (state.shortTermMemory ?? []).length > 0
    ? `\n<short_term_memory>\nHistórico de decisões e resultados neste ciclo:\n${state.shortTermMemory!.map((m, i) => `[${i + 1}] ${m}`).join('\n')}\n</short_term_memory>\n`
    : '';

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
${memoryBlock}
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

    // ── Geração de Testes Unitários (se aprovado) ────────────────────────
    if (finalStatus === 'approved') {
      console.log('🧪 Reviewer aprovado — iniciando geração de testes unitários...');
      const codeFiles = extractCodeFilesFromResults(state);

      if (codeFiles.length > 0) {
        const { testsGenerated, testResults } = await generateUnitTests(codeFiles, state);

        if (testsGenerated.length > 0) {
          finalNotes = (finalNotes ?? '') +
            `\n\n[TESTES UNITÁRIOS GERADOS]\nArquivos: ${testsGenerated.join(', ')}\nResultado: ${testResults.substring(0, 500)}`;
        }
      } else {
        console.log('🧪 Nenhum arquivo de código encontrado para gerar testes.');
      }
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
