/**
 * ORACLE-OS Executor Agent — Sprint 3
 * Agente LangGraph genérico que executa subtasks via tool-calling
 * Roteia por assignedAgent para frontend/backend/genérico
 */

import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createModel } from '../models/model-registry.js';
import { config } from '../config.js';
import { OracleState, Subtask } from '../state/oracle-state.js';
import { getToolsForAgent } from '../tools/tool-registry.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// ─── Resultado de execução de subtask ─────────────────────────────────────────

export interface SubtaskResult {
  subtaskId: string;
  status: 'success' | 'partial' | 'failed';
  output: string;
  toolCallsExecuted: string[];
  filesModified: string[];
  timestamp: string;
}

// ─── Carrega prompt template ──────────────────────────────────────────────────

function loadExecutorPrompt(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dir = dirname(__filename);
    return readFileSync(resolve(__dir, '../../prompts/agents/executor-prompt.md'), 'utf-8');
  } catch {
    return `Você é o ORACLE Executor. Execute a subtask usando as ferramentas disponíveis.
Retorne um JSON com status, filesModified, commandsRun e validationResult.`;
  }
}

// ─── Tool-calling loop ────────────────────────────────────────────────────────

export async function runToolLoop(
  systemPrompt: string,
  taskPrompt: string,
  tools: DynamicStructuredTool[],
  maxIterations = 8
): Promise<{ output: string; toolCallsExecuted: string[]; filesModified: string[] }> {
  const model = createModel({
    modelId: config.agents.executor.modelId,
    temperature: config.agents.executor.temperature,
  });

  const modelWithTools = model.bindTools(tools);

  const messages: (HumanMessage | AIMessage | ToolMessage)[] = [
    new HumanMessage(`${systemPrompt}\n\n${taskPrompt}`),
  ];

  const toolCallsExecuted: string[] = [];
  const filesModified: string[] = [];

  for (let i = 0; i < maxIterations; i++) {
    const response = await modelWithTools.invoke(messages) as AIMessage;
    messages.push(response);

    const toolCalls = response.tool_calls ?? [];
    if (toolCalls.length === 0) {
      // Sem mais tool calls → resposta final
      return {
        output: typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content),
        toolCallsExecuted,
        filesModified,
      };
    }

    // Executa cada tool call e acumula resultados
    for (const toolCall of toolCalls) {
      const tool = tools.find((t) => t.name === toolCall.name);
      if (!tool) {
        messages.push(new ToolMessage({
          tool_call_id: toolCall.id ?? '',
          content: JSON.stringify({ error: `Tool "${toolCall.name}" não encontrada.` }),
        }));
        continue;
      }

      toolCallsExecuted.push(toolCall.name);

      // Rastreia operações de arquivo
      if (toolCall.name.startsWith('file_')) {
        const path = (toolCall.args as Record<string, string>)['path'];
        if (path) filesModified.push(path);
      }

      try {
        const result = await tool.invoke(toolCall.args as Record<string, string>);
        messages.push(new ToolMessage({
          tool_call_id: toolCall.id ?? '',
          content: typeof result === 'string' ? result : JSON.stringify(result),
        }));
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        messages.push(new ToolMessage({
          tool_call_id: toolCall.id ?? '',
          content: JSON.stringify({ error: errMsg }),
        }));
      }
    }
  }

  // Esgotou iterações
  return {
    output: 'Execução interrompida: máximo de iterações atingido.',
    toolCallsExecuted,
    filesModified,
  };
}

// ─── Executa uma subtask individualmente ─────────────────────────────────────

export async function executeSubtask(subtask: Subtask): Promise<SubtaskResult> {
  const tools = getToolsForAgent(subtask.assignedAgent);
  const systemPrompt = loadExecutorPrompt();

  const taskPrompt = `<subtask>
ID: ${subtask.id}
Título: ${subtask.title}
Descrição: ${subtask.description}
Tipo: ${subtask.type}
Agente: ${subtask.assignedAgent}
Critério de validação: ${subtask.validationCriteria}
Ferramentas MCP disponíveis: ${subtask.tools.join(', ')}
</subtask>

Execute esta subtask passo a passo usando as ferramentas disponíveis.`;

  try {
    const { output, toolCallsExecuted, filesModified } = await runToolLoop(
      systemPrompt,
      taskPrompt,
      tools
    );

    return {
      subtaskId: subtask.id,
      status: 'success',
      output,
      toolCallsExecuted,
      filesModified,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      subtaskId: subtask.id,
      status: 'failed',
      output: '',
      toolCallsExecuted: [],
      filesModified: [],
      timestamp: new Date().toISOString(),
    };
  }
}

// ─── Função principal — nó LangGraph ─────────────────────────────────────────

/**
 * executorAgent — nó LangGraph
 * Executa a subtask atual do estado, salva resultado e incrementa currentSubtask.
 */
export async function executorAgent(
  state: OracleState
): Promise<Partial<OracleState>> {
  const subtask = state.subtasks[state.currentSubtask];

  if (!subtask) {
    return { currentSubtask: state.currentSubtask };
  }

  console.log(`⚙️  Executor [${subtask.assignedAgent}]: ${subtask.title}`);

  try {
    const result = await executeSubtask(subtask);

    return {
      results: { ...state.results, [subtask.id]: result },
      currentSubtask: state.currentSubtask + 1,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`❌ Executor falhou em ${subtask.id}:`, error.message);

    return {
      results: {
        ...state.results,
        [subtask.id]: {
          subtaskId: subtask.id,
          status: 'failed',
          output: '',
          toolCallsExecuted: [],
          filesModified: [],
          timestamp: new Date().toISOString(),
        } satisfies SubtaskResult,
      },
      errors: [...state.errors, error],
      currentSubtask: state.currentSubtask + 1, // avança mesmo com erro
    };
  }
}
