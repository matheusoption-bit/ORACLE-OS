/**
 * ORACLE-OS Executor Agent — Sprint 8
 * Agente LangGraph genérico que executa subtasks via tool-calling
 * Agora integrando sistema de Tags (Lovable) e EXECUTOR_SYSTEM_PROMPT
 */

import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createModel } from '../models/model-registry.js';
import { config } from '../config.js';
import { OracleState, Subtask } from '../state/oracle-state.js';
import { getToolsForAgent } from '../tools/tool-registry.js';
import { EXECUTOR_SYSTEM_PROMPT } from '../prompts/executor.prompt.js';

// ─── Tag Parser de Respostas de LLM (Padrão Lovable) ──────────────────────────

function extract(content: string, tag: string): string | undefined {
  const match = content.match(new RegExp(`<\\s*\${tag}[^>]*>([\\s\\S]*?)</\\s*\${tag}\\s*>`, 'i'));
  return match ? match[1].trim() : undefined;
}

function extractAll(content: string, tag: string): Array<{ content: string; path?: string }> {
  // RegExp para lidar com `<oracle-write path="foo">...` ou sem path
  const regex = new RegExp(`<\\s*\${tag}(?:\\s+path=["']([^"']+)["'])?[^>]*>([\\s\\S]*?)</\\s*\${tag}\\s*>`, 'gi');
  const results = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    results.push({
      path: match[1],         // Captura o path se existir
      content: match[2].trim() // Captura o conteúdo
    });
  }
  return results;
}

export function parseOracleTags(output: string) {
  return {
    thinking: extract(output, 'oracle-thinking'),
    writes: extractAll(output, 'oracle-write'),
    deletes: extractAll(output, 'oracle-delete'),
    success: extract(output, 'oracle-success'),
    error: extract(output, 'oracle-error'),
  };
}

// ─── Resultado de execução de subtask ─────────────────────────────────────────

export interface SubtaskResult {
  subtaskId: string;
  status: 'success' | 'partial' | 'failed';
  output: string;
  toolCallsExecuted: string[];
  filesModified: string[];
  timestamp: string;
  parsedTags?: ReturnType<typeof parseOracleTags>;
}

// ─── Tool-calling loop ────────────────────────────────────────────────────────

export async function runToolLoop(
  systemPrompt: string,
  taskPrompt: string,
  tools: DynamicStructuredTool[],
  maxIterations = 8
): Promise<{ output: string; toolCallsExecuted: string[]; filesModified: string[]; parsedTags: ReturnType<typeof parseOracleTags> }> {
  const model = createModel({
    modelId: config.agents.executor.modelId,
    temperature: config.agents.executor.temperature,
  });

  const modelWithTools = model.bindTools ? model.bindTools(tools) : model;

  const messages: (HumanMessage | AIMessage | ToolMessage)[] = [
    new HumanMessage(`\${systemPrompt}\n\n\${taskPrompt}`),
  ];

  const toolCallsExecuted: string[] = [];
  const filesModified: string[] = [];
  let finalResponseContent = '';

  for (let i = 0; i < maxIterations; i++) {
    const response = await modelWithTools.invoke(messages) as AIMessage;
    messages.push(response);

    const toolCalls = response.tool_calls ?? [];
    if (toolCalls.length === 0) {
      // Sem mais tool calls → resposta final
      finalResponseContent = typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);
      return {
        output: finalResponseContent,
        toolCallsExecuted,
        filesModified,
        parsedTags: parseOracleTags(finalResponseContent)
      };
    }

    let loopOutput = typeof response.content === 'string' ? response.content : '';
    // Concatenamos a resposta no loop para ajudar no extrator de tags se ele for particionado (menos provável, mas bom tentar capturar)
    finalResponseContent += loopOutput + '\n';

    // Executa cada tool call e acumula resultados
    for (const toolCall of toolCalls) {
      const tool = tools.find((t) => t.name === toolCall.name);
      if (!tool) {
        messages.push(new ToolMessage({
          tool_call_id: toolCall.id ?? '',
          content: JSON.stringify({ error: `Tool "\${toolCall.name}" não encontrada.` }),
        }));
        continue;
      }

      toolCallsExecuted.push(toolCall.name);

      // Rastreia operações de arquivo nas tags da tool antiga (se houver)
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
    output: 'Execução interrompida: máximo de iterações atingido.\n' + finalResponseContent,
    toolCallsExecuted,
    filesModified,
    parsedTags: parseOracleTags(finalResponseContent)
  };
}

// ─── Executa uma subtask individualmente ─────────────────────────────────────

export async function executeSubtask(subtask: Subtask): Promise<SubtaskResult> {
  const tools = getToolsForAgent(subtask.assignedAgent);
  const systemPrompt = EXECUTOR_SYSTEM_PROMPT;

  const taskPrompt = `<subtask>
ID: \${subtask.id}
Título: \${subtask.title}
Descrição: \${subtask.description}
Tipo: \${subtask.type}
Agente: \${subtask.assignedAgent}
Critério de validação: \${subtask.validationCriteria}
Ferramentas MCP disponíveis: \${subtask.tools.join(', ')}
</subtask>

Execute esta subtask passo a passo usando as ferramentas disponíveis. Não esqueça de utilizar as tags <oracle-thinking> e ao final <oracle-success> ou <oracle-error> explicadas no system prompt!`;

  const { output, toolCallsExecuted, filesModified, parsedTags } = await runToolLoop(
    systemPrompt,
    taskPrompt,
    tools
  );

  return {
    subtaskId: subtask.id,
    status: parsedTags.error ? 'failed' : 'success', // Se cuspiu tag de erro marcamos como falha
    output,
    toolCallsExecuted,
    filesModified: [...new Set([...filesModified, ...parsedTags.writes.map(w => w.path).filter(Boolean) as string[]])], // Junta files alterados via tools antigas com as oracle tags, remove nulls e dedup
    timestamp: new Date().toISOString(),
    parsedTags,
  };
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

  console.log(`⚙️  Executor [\${subtask.assignedAgent}]: \${subtask.title}`);

  try {
    const result = await executeSubtask(subtask);
    
    if(result.parsedTags?.thinking) {
        // Exibimos silenciosamente algo para demonstrar trace
        console.log(`[Thinking...] \${result.parsedTags.thinking.substring(0, 100)}...`);
    }

    return {
      results: { ...state.results, [subtask.id]: result },
      currentSubtask: state.currentSubtask + 1,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`❌ Executor falhou em \${subtask.id}:`, error.message);

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
        } satisfies SubtaskResult,
      },
      errors: [...(state.errors ?? []), error],
      currentSubtask: state.currentSubtask + 1, // avança mesmo com erro
    };
  }
}
