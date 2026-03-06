/**
 * ORACLE-OS Executor Agent — Sprint 10
 * Agente LangGraph genérico que executa subtasks via tool-calling
 * Integrando sistema de Tags (Lovable), EXECUTOR_SYSTEM_PROMPT
 * e Auto-Correção inteligente no runToolLoop
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
  const regex = new RegExp(`<\\s*\${tag}(?:\\s+path=["']([^"']+)["'])?[^>]*>([\\s\\S]*?)</\\s*\${tag}\\s*>`, 'gi');
  const results = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    results.push({
      path: match[1],
      content: match[2].trim()
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
  selfCorrectionAttempts?: number;
}

// ─── Auto-Correção: Padrões de erro conhecidos ──────────────────────────────

interface ErrorPattern {
  /** Regex para detectar o padrão de erro no stderr/mensagem */
  pattern: RegExp;
  /** Descrição legível do tipo de erro */
  description: string;
  /** Função que gera o comando corretivo a partir do match */
  correctionCommand: (match: RegExpMatchArray, originalCommand: string) => string;
}

const KNOWN_ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /Cannot find module ['"]([^'"]+)['"]/i,
    description: 'Módulo Node.js não encontrado',
    correctionCommand: (match) => {
      const moduleName = match[1].startsWith('.')
        ? '' // módulo local, não instalar
        : match[1].split('/')[0].replace(/^@/, (m) => m); // escopo npm
      if (!moduleName) return '';
      // Trata escopos npm como @scope/package
      const pkg = match[1].startsWith('@')
        ? match[1].split('/').slice(0, 2).join('/')
        : moduleName;
      return `npm install ${pkg}`;
    },
  },
  {
    pattern: /command not found:\s*(\S+)/i,
    description: 'Comando não encontrado no sistema',
    correctionCommand: (match) => {
      const cmd = match[1];
      const knownInstalls: Record<string, string> = {
        tsc: 'npm install -g typescript',
        tsx: 'npm install -g tsx',
        vitest: 'npm install -D vitest',
        jest: 'npm install -D jest',
        eslint: 'npm install -D eslint',
        prettier: 'npm install -D prettier',
        prisma: 'npm install prisma',
        python3: 'pip install python3',
      };
      return knownInstalls[cmd] ?? `npm install -g ${cmd}`;
    },
  },
  {
    pattern: /ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND/i,
    description: 'Módulo ESM/CJS não encontrado',
    correctionCommand: (_match, originalCommand) => {
      // Tenta reinstalar dependências do projeto
      return 'npm install';
    },
  },
  {
    pattern: /No module named ['"]?(\S+?)['"]?$/im,
    description: 'Módulo Python não encontrado',
    correctionCommand: (match) => {
      const moduleName = match[1].replace(/\./g, '-');
      return `pip install ${moduleName}`;
    },
  },
  {
    pattern: /ENOENT.*package\.json/i,
    description: 'package.json não encontrado',
    correctionCommand: () => 'npm init -y',
  },
  {
    pattern: /peer dep.*missing|ERESOLVE/i,
    description: 'Conflito de dependências peer',
    correctionCommand: () => 'npm install --legacy-peer-deps',
  },
  {
    pattern: /TypeScript.*error TS/i,
    description: 'Erro de compilação TypeScript',
    correctionCommand: () => 'npx tsc --noEmit 2>&1 || true',
  },
];

/**
 * Tenta identificar um padrão de erro conhecido e retorna o comando corretivo.
 * Retorna null se o erro não é reconhecido.
 */
function detectCorrectiveAction(
  errorOutput: string,
  originalCommand: string
): { description: string; command: string } | null {
  for (const pattern of KNOWN_ERROR_PATTERNS) {
    const match = errorOutput.match(pattern.pattern);
    if (match) {
      const command = pattern.correctionCommand(match, originalCommand);
      if (command) {
        return { description: pattern.description, command };
      }
    }
  }
  return null;
}

// ─── Tool-calling loop com Auto-Correção ─────────────────────────────────────

export async function runToolLoop(
  systemPrompt: string,
  taskPrompt: string,
  tools: DynamicStructuredTool[],
  maxIterations = 8,
  shortTermMemory: string[] = []
): Promise<{
  output: string;
  toolCallsExecuted: string[];
  filesModified: string[];
  parsedTags: ReturnType<typeof parseOracleTags>;
  selfCorrectionAttempts: number;
}> {
  const model = createModel({
    modelId: config.agents.executor.modelId,
    temperature: config.agents.executor.temperature,
  });

  const modelWithTools = model.bindTools ? model.bindTools(tools) : model;

  // Injeta memória de curto prazo no prompt se disponível
  const memoryBlock = shortTermMemory.length > 0
    ? `\n\n<short_term_memory>\n${shortTermMemory.map((m, i) => `[${i + 1}] ${m}`).join('\n')}\n</short_term_memory>`
    : '';

  const messages: (HumanMessage | AIMessage | ToolMessage)[] = [
    new HumanMessage(`\${systemPrompt}${memoryBlock}\n\n\${taskPrompt}`),
  ];

  const toolCallsExecuted: string[] = [];
  const filesModified: string[] = [];
  let finalResponseContent = '';
  let selfCorrectionAttempts = 0;
  const MAX_SELF_CORRECTIONS = 3; // Máximo de tentativas de auto-correção por tool call

  for (let i = 0; i < maxIterations; i++) {
    const response = await modelWithTools.invoke(messages) as AIMessage;
    messages.push(response);

    const toolCalls = response.tool_calls ?? [];
    if (toolCalls.length === 0) {
      finalResponseContent = typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);
      return {
        output: finalResponseContent,
        toolCallsExecuted,
        filesModified,
        parsedTags: parseOracleTags(finalResponseContent),
        selfCorrectionAttempts,
      };
    }

    let loopOutput = typeof response.content === 'string' ? response.content : '';
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

      // Rastreia operações de arquivo
      if (toolCall.name.startsWith('file_')) {
        const path = (toolCall.args as Record<string, string>)['path'];
        if (path) filesModified.push(path);
      }

      try {
        const result = await tool.invoke(toolCall.args as Record<string, string>);
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

        // ── Auto-Correção: Detecta erros em shell_exec ──────────────────
        if (toolCall.name === 'shell_exec') {
          let parsed: { success?: boolean; error?: string; stderr?: string; command?: string } = {};
          try { parsed = JSON.parse(resultStr); } catch { /* não é JSON */ }

          const errorOutput = parsed.error || parsed.stderr || '';
          const originalCommand = (toolCall.args as Record<string, string>)['command'] ?? '';

          if (!parsed.success && errorOutput && selfCorrectionAttempts < MAX_SELF_CORRECTIONS) {
            const correction = detectCorrectiveAction(errorOutput, originalCommand);

            if (correction) {
              selfCorrectionAttempts++;
              console.log(`🔧 Auto-correção [${selfCorrectionAttempts}/${MAX_SELF_CORRECTIONS}]: ${correction.description}`);
              console.log(`   Comando corretivo: ${correction.command}`);

              // Informa o agente sobre o erro e a tentativa de correção
              messages.push(new ToolMessage({
                tool_call_id: toolCall.id ?? '',
                content: JSON.stringify({
                  ...parsed,
                  _selfCorrection: {
                    detected: correction.description,
                    attemptedFix: correction.command,
                    attempt: selfCorrectionAttempts,
                  },
                }),
              }));

              // Executa o comando corretivo automaticamente
              const correctionTool = tools.find((t) => t.name === 'shell_exec');
              if (correctionTool) {
                try {
                  const fixResult = await correctionTool.invoke({ command: correction.command });
                  const fixStr = typeof fixResult === 'string' ? fixResult : JSON.stringify(fixResult);
                  toolCallsExecuted.push('shell_exec (auto-correction)');

                  console.log(`   Resultado da correção: ${fixStr.substring(0, 200)}`);

                  // Adiciona o resultado da correção como contexto para o agente
                  messages.push(new HumanMessage(
                    `[ORACLE Auto-Correction] Detectei o erro "${correction.description}" no comando anterior. ` +
                    `Executei automaticamente: \`${correction.command}\`\n` +
                    `Resultado: ${fixStr}\n\n` +
                    `Por favor, tente novamente o comando original ou ajuste conforme necessário.`
                  ));
                } catch (fixErr) {
                  const fixErrMsg = fixErr instanceof Error ? fixErr.message : String(fixErr);
                  messages.push(new HumanMessage(
                    `[ORACLE Auto-Correction] Tentei corrigir "${correction.description}" com \`${correction.command}\`, ` +
                    `mas a correção também falhou: ${fixErrMsg}. Tente uma abordagem alternativa.`
                  ));
                }
              }
              continue; // Pula para a próxima iteração, deixando o agente decidir o próximo passo
            }
          }
        }

        // Resultado normal (sem auto-correção necessária)
        messages.push(new ToolMessage({
          tool_call_id: toolCall.id ?? '',
          content: resultStr,
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
    parsedTags: parseOracleTags(finalResponseContent),
    selfCorrectionAttempts,
  };
}

// ─── Executa uma subtask individualmente ─────────────────────────────────────

export async function executeSubtask(
  subtask: Subtask,
  shortTermMemory: string[] = []
): Promise<SubtaskResult> {
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

  const { output, toolCallsExecuted, filesModified, parsedTags, selfCorrectionAttempts } = await runToolLoop(
    systemPrompt,
    taskPrompt,
    tools,
    8,
    shortTermMemory
  );

  return {
    subtaskId: subtask.id,
    status: parsedTags.error ? 'failed' : 'success',
    output,
    toolCallsExecuted,
    filesModified: [...new Set([...filesModified, ...parsedTags.writes.map(w => w.path).filter(Boolean) as string[]])],
    timestamp: new Date().toISOString(),
    parsedTags,
    selfCorrectionAttempts,
  };
}

// ─── Função principal — nó LangGraph ─────────────────────────────────────────

/**
 * executorAgent — nó LangGraph
 * Executa a subtask atual do estado, salva resultado e incrementa currentSubtask.
 * Agora com suporte a shortTermMemory para contexto entre agentes.
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
    const result = await executeSubtask(subtask, state.shortTermMemory ?? []);
    
    if(result.parsedTags?.thinking) {
        console.log(`[Thinking...] \${result.parsedTags.thinking.substring(0, 100)}...`);
    }

    if (result.selfCorrectionAttempts && result.selfCorrectionAttempts > 0) {
      console.log(`🔧 Auto-correções realizadas: ${result.selfCorrectionAttempts}`);
    }

    // Adiciona resumo à memória de curto prazo
    const memoryEntry = `[Executor/${subtask.assignedAgent}] Subtask "${subtask.title}" → ${result.status}. ` +
      `Tools: ${result.toolCallsExecuted.join(', ')}. Files: ${result.filesModified.join(', ')}.` +
      (result.selfCorrectionAttempts ? ` Auto-correções: ${result.selfCorrectionAttempts}.` : '');

    return {
      results: { ...state.results, [subtask.id]: result },
      currentSubtask: state.currentSubtask + 1,
      shortTermMemory: [...(state.shortTermMemory ?? []), memoryEntry],
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`❌ Executor falhou em \${subtask.id}:`, error.message);

    const memoryEntry = `[Executor/${subtask.assignedAgent}] Subtask "${subtask.title}" → FAILED: ${error.message}`;

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
      currentSubtask: state.currentSubtask + 1,
      shortTermMemory: [...(state.shortTermMemory ?? []), memoryEntry],
    };
  }
}
