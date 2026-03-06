/**
 * ORACLE-OS Planner Agent — Sprint 2
 * Decompõe tarefas em subtasks estruturadas com output Zod
 * Compatível com nó LangGraph e fn plannerAgent(state)
 */

import { z } from 'zod';
import { HumanMessage } from '@langchain/core/messages';
import { createModel } from '../models/model-registry.js';
import { config } from '../config.js';
import { OracleState, Subtask } from '../state/oracle-state.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { retrieveRelevantSkills, formatSkillsAsContext } from '../rag/rag-pipeline.js';

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

export const SubtaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  type: z.enum(['code', 'file', 'search', 'review', 'other']),
  priority: z.number().min(1).max(5),
  dependsOn: z.array(z.string()).default([]),
  assignedAgent: z.enum(['frontend', 'backend', 'devops', 'data', 'security']),
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

// ─── Carrega prompt template ──────────────────────────────────────────────────

function loadPromptTemplate(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const promptPath = resolve(__dirname, '../../prompts/agents/planner-prompt.md');
    return readFileSync(promptPath, 'utf-8');
  } catch {
    // Fallback inline caso o arquivo não exista no ambiente de build
    return `Você é um arquiteto técnico sênior no sistema ORACLE-OS.
Decomponha a tarefa fornecida em subtasks atômicas, testáveis e executáveis.
Cada subtask deve ser completável em menos de 30 minutos.
Prioridade: 1 = crítico, 5 = baixo.
Retorne um plano estruturado em JSON.`;
  }
}

// ─── Função principal — assinatura LangGraph ──────────────────────────────────

/**
 * plannerAgent — nó LangGraph
 * Recebe o estado compartilhado e retorna atualização de estado com subtasks.
 */
export async function plannerAgent(
  state: OracleState
): Promise<Partial<OracleState>> {
  const model = createModel({
    modelId: config.agents.planner.modelId,
    temperature: config.agents.planner.temperature,
  });

  const structuredModel = model.withStructuredOutput(PlanSchema);

  const systemPrompt = loadPromptTemplate();

  const skills = await retrieveRelevantSkills(state.task);
  const ragContextBlock = skills.length > 0 
    ? formatSkillsAsContext(skills)
    : 'Nenhum contexto RAG de skills passadas disponível neste momento.';

  const userMessage = `${systemPrompt}

<task>
${state.task}
</task>

<context>
${ragContextBlock}
</context>

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
