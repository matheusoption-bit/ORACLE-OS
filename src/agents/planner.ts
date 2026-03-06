/**
 * ORACLE-OS Planner Agent — Sprint 10
 * Decompõe tarefas em subtasks estruturadas com output Zod
 * Integrado com o Prompt Enhancer, Library de Prompts e shortTermMemory
 */

import { z } from 'zod';
import { HumanMessage } from '@langchain/core/messages';
import { createModel } from '../models/model-registry.js';
import { config } from '../config.js';
import { OracleState, Subtask } from '../state/oracle-state.js';
import { retrieveRelevantSkills, formatSkillsAsContext } from '../rag/rag-pipeline.js';
import { PLANNER_SYSTEM_PROMPT } from '../prompts/planner.prompt.js';
import { PromptEnhancer } from '../prompts/enhancer.js';

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

export const SubtaskSchema = z.object({
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

export const PlanSchema = z.object({
  subtasks: z.array(SubtaskSchema),
  executionPlan: z.enum(['sequential', 'parallel', 'mixed']),
});

export type Plan = z.infer<typeof PlanSchema>;
export type SubtaskOutput = z.infer<typeof SubtaskSchema>;

const enhancer = new PromptEnhancer();

// ─── Função principal — assinatura LangGraph ──────────────────────────────────

/**
 * plannerAgent — nó LangGraph
 * Recebe o estado compartilhado e retorna atualização de estado com subtasks.
 * Agora injeta shortTermMemory no prompt para consciência contextual.
 */
export async function plannerAgent(
  state: OracleState
): Promise<Partial<OracleState>> {
  // 1. Enriquecer o prompt de usuário
  const enhancedTask = await enhancer.enhance(state.task);
  console.log(`🧠 Planner: Modo autodetectado -> \${enhancedTask.suggestedMode}`);

  const model = createModel({
    modelId: config.agents.planner.modelId,
    temperature: config.agents.planner.temperature,
  });

  const structuredModel = model.withStructuredOutput(PlanSchema);

  const skills = await retrieveRelevantSkills(state.task);
  const ragContextBlock = skills.length > 0 
    ? formatSkillsAsContext(skills)
    : 'Nenhum contexto RAG de skills passadas disponível neste momento.';

  // 2. Usar o PLANNER_SYSTEM_PROMPT importado da Prompts Library
  const systemPrompt = PLANNER_SYSTEM_PROMPT;

  // 3. Injetar memória de curto prazo se disponível (ex: em re-planejamento após revisão)
  const memoryBlock = (state.shortTermMemory ?? []).length > 0
    ? `\n<short_term_memory>\nContexto de execuções anteriores neste ciclo:\n${state.shortTermMemory!.map((m, i) => `[${i + 1}] ${m}`).join('\n')}\n</short_term_memory>`
    : '';

  const userMessage = `\${systemPrompt}

<enhanced_task>
\${enhancedTask.enhancedPrompt}
</enhanced_task>

<task_original>
\${state.task}
</task_original>

<context>
\${ragContextBlock}
</context>
${memoryBlock}
<available_tools>
- file_read, file_write, file_list
- shell_exec, shell_npm, shell_git
- github_create_pr, github_list_issues
- browser_navigate, browser_click, browser_screenshot
- db_query, db_insert
</available_tools>

Retorne um plano JSON completo com todos os campos obrigatórios.`;

  const result = await structuredModel.invoke([
    new HumanMessage(userMessage),
  ]);

  // Mapeia dependsOn → dependencies para retrocompatibilidade
  const subtasks: Subtask[] = result.subtasks.map((s: SubtaskOutput) => ({
    ...s,
    dependencies: s.dependsOn,
    assignedAgent: ['frontend', 'backend', 'devops', 'data', 'security'].includes(s.assignedAgent) ? s.assignedAgent as any : 'backend'
  }));

  return {
    subtasks,
    currentSubtask: 0,
  };
}

// ─── Wrapper retrocompatível (usado por testes legados) ───────────────────────

export const plannerAgentLegacy = {
  async run(state: OracleState) {
    return plannerAgent(state);
  },
};
