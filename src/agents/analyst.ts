/**
 * ORACLE-OS Analyst Node — Quadripartite Architecture
 * 
 * Stage 1: Context & RAG
 * 
 * Ingests the user task, uses ChromaDB/Docling to read codebase context,
 * and defines requirements. Outputs a "Context Document".
 * 
 * This node is the entry point of the Quadripartite pipeline.
 * It NEVER writes code — only analyzes and produces structured context.
 */

import { z } from 'zod';
import { HumanMessage } from '@langchain/core/messages';
import { createModel } from '../models/model-registry.js';
import { config } from '../config.js';
import { OracleState, ContextDocument } from '../state/oracle-state.js';
import { retrieveRelevantSkills, formatSkillsAsContext } from '../rag/rag-pipeline.js';
import { ANALYST_SYSTEM_PROMPT } from '../prompts/analyst.prompt.js';
import { PromptEnhancer } from '../prompts/enhancer.js';

// ─── Zod Schema for Analyst Output ──────────────────────────────────────────

const ContextDocumentSchema = z.object({
  taskSummary: z.string().describe('Resumo conciso da tarefa analisada'),
  requirements: z.array(z.string()).describe('Requisitos funcionais identificados'),
  relevantFiles: z.array(z.string()).describe('Arquivos relevantes no codebase'),
  complexityLevel: z.enum(['low', 'medium', 'high']).describe('Nível de complexidade estimado'),
  externalDependencies: z.array(z.string()).default([]).describe('Dependências externas necessárias'),
  initialRisks: z.array(z.string()).default([]).describe('Riscos iniciais identificados'),
});

export type AnalystOutput = z.infer<typeof ContextDocumentSchema>;

const enhancer = new PromptEnhancer();

// ─── Analyst Node — LangGraph Node Function ─────────────────────────────────

/**
 * analystNode — Nó LangGraph (Stage 1)
 * 
 * Recebe o estado compartilhado, analisa a tarefa com contexto RAG,
 * e retorna um Context Document estruturado para o Reviewer.
 */
export async function analystNode(
  state: OracleState
): Promise<Partial<OracleState>> {
  console.log('🔬 [Analyst] Iniciando análise de contexto e requisitos...');

  // 1. Enriquecer o prompt do usuário
  const enhancedTask = await enhancer.enhance(state.task);
  console.log(`🔬 [Analyst] Modo autodetectado → ${enhancedTask.suggestedMode}`);

  // 2. Recuperar contexto RAG
  const skills = await retrieveRelevantSkills(state.task);
  const ragContextBlock = skills.length > 0
    ? formatSkillsAsContext(skills)
    : 'Nenhum contexto RAG de skills passadas disponível neste momento.';

  // 3. Criar modelo com output estruturado
  const model = createModel({
    modelId: config.agents.analyst.modelId,
    temperature: config.agents.analyst.temperature,
  });

  const structuredModel = model.withStructuredOutput(ContextDocumentSchema);

  // 4. Injetar memória de curto prazo (para re-análise após feedback do Reviewer)
  const memoryBlock = (state.shortTermMemory ?? []).length > 0
    ? `\n<short_term_memory>\nContexto de iterações anteriores neste ciclo:\n${state.shortTermMemory.map((m, i) => `[${i + 1}] ${m}`).join('\n')}\n</short_term_memory>`
    : '';

  // 5. Injetar feedback do Reviewer se houver (re-análise)
  const reviewerFeedback = state.executionBlueprint?.feedbackToAnalyst
    ? `\n<reviewer_feedback>\nO Reviewer (Architect) solicitou re-análise com o seguinte feedback:\n${state.executionBlueprint.feedbackToAnalyst}\n</reviewer_feedback>`
    : '';

  const userMessage = `${ANALYST_SYSTEM_PROMPT}

<enhanced_task>
${enhancedTask.enhancedPrompt}
</enhanced_task>

<task_original>
${state.task}
</task_original>

<rag_context>
${ragContextBlock}
</rag_context>
${memoryBlock}${reviewerFeedback}
<available_tools>
- file_read, file_write, file_list
- shell_exec, shell_npm, shell_git
- github_create_pr, github_list_issues
- browser_navigate, browser_click, browser_screenshot
- db_query, db_insert
</available_tools>

Analise a tarefa e retorne um Context Document JSON completo com todos os campos obrigatórios.`;

  try {
    const result = await structuredModel.invoke([
      new HumanMessage(userMessage),
    ]);

    const contextDocument: ContextDocument = {
      taskSummary: result.taskSummary,
      ragContext: ragContextBlock,
      requirements: result.requirements,
      relevantFiles: result.relevantFiles,
      complexityLevel: result.complexityLevel,
      externalDependencies: result.externalDependencies,
      initialRisks: result.initialRisks,
      timestamp: new Date().toISOString(),
    };

    // Memória de curto prazo
    const memoryEntry = `[Analyst] Analisou tarefa: "${result.taskSummary.substring(0, 100)}". ` +
      `Complexidade: ${result.complexityLevel}. ` +
      `Requisitos: ${result.requirements.length}. ` +
      `Riscos: ${result.initialRisks.length}.`;

    console.log(`🔬 [Analyst] Context Document gerado — ${result.requirements.length} requisitos, complexidade ${result.complexityLevel}`);

    return {
      contextDocument,
      currentStage: 'reviewer',
      shortTermMemory: [...(state.shortTermMemory ?? []), memoryEntry],
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('❌ [Analyst] Falha na análise:', error.message);

    // Fallback: gera um Context Document mínimo para não travar o pipeline
    const fallbackDoc: ContextDocument = {
      taskSummary: state.task,
      ragContext: ragContextBlock,
      requirements: [state.task],
      relevantFiles: [],
      complexityLevel: 'medium',
      externalDependencies: [],
      initialRisks: [`Analyst falhou: ${error.message}`],
      timestamp: new Date().toISOString(),
    };

    const memoryEntry = `[Analyst] FALLBACK — Análise falhou: ${error.message}. Context Document mínimo gerado.`;

    return {
      contextDocument: fallbackDoc,
      currentStage: 'reviewer',
      errors: [...(state.errors ?? []), error],
      shortTermMemory: [...(state.shortTermMemory ?? []), memoryEntry],
    };
  }
}
