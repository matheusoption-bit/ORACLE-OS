/**
 * ORACLE-OS Executor Node — Quadripartite Architecture
 *
 * Stage 3: The Sandbox Worker
 *
 * The ONLY node allowed to use the E2B Sandbox and MCP tools to write code,
 * install packages, and test. Executes the Reviewer's Execution Blueprint.
 *
 * Outputs "Raw Executed Code" and test results as ExecutedCode.
 *
 * Preserves all existing integrations:
 * - E2B Sandbox execution
 * - MCP tool calling
 * - Auto-correction patterns
 * - Frontend/Backend specialization routing
 * - Tag parsing (Lovable pattern)
 *
 * Issue #11: uses PipelineGuards for tool-call loop and self-correction caps.
 * Issue #10: uses validateExecutionResult for output validation.
 */

import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createModel } from '../models/model-registry.js';
import { config } from '../config.js';
import type {
  SupervisorState as OracleState,
  Subtask,
  ExecutedCode,
  ExecutionResult as ExecutorResult,
  TestResult,
  ExecutionError,
} from '../state/schemas.js';
import { getToolsForAgent } from '../tools/tool-registry.js';
import { EXECUTOR_SYSTEM_PROMPT } from '../prompts/executor.prompt.js';
import { executorLogger } from '../monitoring/logger.js';
import { PipelineGuards } from '../pipeline/guards.js';
import { validateExecutionResult } from '../pipeline/validators.js';
import { guardReason, isValidationFailed } from '../pipeline/type-helpers.js';

// ─── Pipeline guards (Issue #11) ─────────────────────────────────────────────
const guards = new PipelineGuards(config.pipeline);

// ─── Tag Parser (Lovable Pattern — preserved) ───────────────────────────────

function extract(content: string, tag: string): string | undefined {
  const match = content.match(new RegExp(`<\\s*${tag}[^>]*>([\\s\\S]*?)</\\s*${tag}\\s*>`, 'i'));
  return match ? match[1].trim() : undefined;
}

function extractAll(content: string, tag: string): Array<{ content: string; path?: string }> {
  const regex = new RegExp(`<\\s*${tag}(?:\\s+path=["']([^"']+)["'])?[^>]*>([\\s\\S]*?)</\\s*${tag}\\s*>`, 'gi');
  const results = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    results.push({
      path: match[1],
      content: match[2].trim(),
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

// ─── SubtaskResult type (preserved for compatibility) ────────────────────────

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

// ─── Auto-Correction Patterns (preserved from Sprint 10) ────────────────────

interface ErrorPattern {
  pattern: RegExp;
  description: string;
  correctionCommand: (match: RegExpMatchArray, originalCommand: string) => string;
}

const KNOWN_ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /Cannot find module ['"]([^'"]+)['"]/i,
    description: 'Módulo Node.js não encontrado',
    correctionCommand: (match) => {
      const moduleName = match[1].startsWith('.')
        ? ''
        : match[1].split('/')[0].replace(/^@/, (m) => m);
      if (!moduleName) return '';
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
    correctionCommand: () => 'npm install',
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

// ─── Tool-calling loop with Auto-Correction (Issue #11: guarded) ─────────────

export async function runToolLoop(
  systemPrompt: string,
  taskPrompt: string,
  tools: DynamicStructuredTool[],
  maxIterations = guards.getConfig().maxToolCallIterations,
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

  const memoryBlock = shortTermMemory.length > 0
    ? `\n\n<short_term_memory>\n${shortTermMemory.map((m, i) => `[${i + 1}] ${m}`).join('\n')}\n</short_term_memory>`
    : '';

  const messages: (HumanMessage | AIMessage | ToolMessage)[] = [
    new HumanMessage(`${systemPrompt}${memoryBlock}\n\n${taskPrompt}`),
  ];

  const toolCallsExecuted: string[] = [];
  const filesModified: string[] = [];
  let finalResponseContent = '';
  let selfCorrectionAttempts = 0;

  const effectiveMaxIterations = Math.min(maxIterations, guards.getConfig().maxToolCallIterations);

  for (let i = 0; i < effectiveMaxIterations; i++) {
    // ── Issue #11: check tool-call loop guard ─────────────────────────────────
    const loopDecision = guards.checkToolCallLoop(i);
    if (!loopDecision.allowed) {
      executorLogger.warn(`⚠️  [Executor/ToolLoop] ${guardReason(loopDecision)}`);
      break;
    }

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

    const loopOutput = typeof response.content === 'string' ? response.content : '';
    finalResponseContent += loopOutput + '\n';

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

      if (toolCall.name.startsWith('file_')) {
        const path = (toolCall.args as Record<string, string>)['path'];
        if (path) filesModified.push(path);
      }

      try {
        const result = await tool.invoke(toolCall.args as Record<string, string>);
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

        // Auto-Correction for shell_exec (Issue #11: guarded by checkSelfCorrection)
        if (toolCall.name === 'shell_exec') {
          let parsed: { success?: boolean; error?: string; stderr?: string; command?: string } = {};
          try { parsed = JSON.parse(resultStr); } catch { /* not JSON */ }

          const errorOutput = parsed.error || parsed.stderr || '';
          const originalCommand = (toolCall.args as Record<string, string>)['command'] ?? '';

          // ── Issue #11: check self-correction guard ──────────────────────────
          const correctionDecision = guards.checkSelfCorrection(selfCorrectionAttempts);
          if (!parsed.success && errorOutput && correctionDecision.allowed) {
            const correction = detectCorrectiveAction(errorOutput, originalCommand);

            if (correction) {
              selfCorrectionAttempts++;
              console.log(`🔧 Auto-correção [${selfCorrectionAttempts}/${guards.getConfig().maxSelfCorrectionAttempts}]: ${correction.description}`);

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

              const correctionTool = tools.find((t) => t.name === 'shell_exec');
              if (correctionTool) {
                try {
                  const fixResult = await correctionTool.invoke({ command: correction.command });
                  const fixStr = typeof fixResult === 'string' ? fixResult : JSON.stringify(fixResult);
                  toolCallsExecuted.push('shell_exec (auto-correction)');

                  messages.push(new HumanMessage(
                    `[ORACLE Auto-Correction] Detectei o erro "${correction.description}". ` +
                    `Executei: \`${correction.command}\`\nResultado: ${fixStr}\n` +
                    `Tente novamente o comando original ou ajuste conforme necessário.`
                  ));
                } catch (fixErr) {
                  const fixErrMsg = fixErr instanceof Error ? fixErr.message : String(fixErr);
                  messages.push(new HumanMessage(
                    `[ORACLE Auto-Correction] Tentei corrigir "${correction.description}" com \`${correction.command}\`, ` +
                    `mas falhou: ${fixErrMsg}. Prossiga com abordagem alternativa.`
                  ));
                }
              }
              continue;
            }
          } else if (!correctionDecision.allowed && !parsed.success && errorOutput) {
            // Guard triggered: log and skip further corrections
            executorLogger.warn(`⚠️  [Executor/ToolLoop] ${guardReason(correctionDecision)}`);
          }
        }

        // Normal result
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

  return {
    output: 'Execução interrompida: máximo de iterações atingido.\n' + finalResponseContent,
    toolCallsExecuted,
    filesModified,
    parsedTags: parseOracleTags(finalResponseContent),
    selfCorrectionAttempts,
  };
}

// ─── Execute a single subtask ────────────────────────────────────────────────

export async function executeSubtask(
  subtask: Subtask,
  shortTermMemory: string[] = []
): Promise<SubtaskResult> {
  const tools = getToolsForAgent(subtask.assignedAgent);
  const systemPrompt = EXECUTOR_SYSTEM_PROMPT;

  const taskPrompt = `<subtask>
ID: ${subtask.id}
Título: ${subtask.title}
Descrição: ${subtask.description}
Tipo: ${subtask.type}
Agente: ${subtask.assignedAgent}
Critério de validação: ${subtask.validationCriteria}
Ferramentas MCP disponíveis: ${subtask.tools.join(', ')}
</subtask>

Execute esta subtask passo a passo usando as ferramentas disponíveis no E2B Sandbox.
Use as tags <oracle-thinking> e ao final <oracle-success> ou <oracle-error>.`;

  const { output, toolCallsExecuted, filesModified, parsedTags, selfCorrectionAttempts } = await runToolLoop(
    systemPrompt,
    taskPrompt,
    tools,
    guards.getConfig().maxToolCallIterations,
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

// ─── Executor Router (preserved from Sprint 10) ─────────────────────────────

function executorRouter(state: OracleState): 'frontend_executor' | 'backend_executor' | 'executor' {
  const subtask = state.subtasks[state.currentSubtask];
  if (!subtask) return 'executor';

  const typeLower = (subtask.type || '').toLowerCase();

  if (typeLower.includes('react') || typeLower.includes('next') || typeLower.includes('component')) {
    return 'frontend_executor';
  }

  if (typeLower.includes('api') || typeLower.includes('node') || typeLower.includes('python')) {
    return 'backend_executor';
  }

  if (subtask.assignedAgent === 'frontend') return 'frontend_executor';
  if (subtask.assignedAgent === 'backend') return 'backend_executor';

  return 'executor';
}

export { executorRouter };

// ─── Executor Node — LangGraph Node Function (Stage 3) ──────────────────────

/**
 * executorNode — Nó LangGraph (Stage 3)
 *
 * The ONLY node that uses E2B Sandbox and MCP tools.
 * Executes all subtasks from the Execution Blueprint sequentially.
 * Produces ExecutedCode output for the Synthesis node.
 *
 * Issue #11: executor retry guard applied per subtask.
 * Issue #10: validateExecutionResult called for each subtask result.
 */
export async function executorNode(
  state: OracleState
): Promise<Partial<OracleState>> {
  executorLogger.info(`⚙️  [Executor] Iniciando execução do blueprint...`);

  const subtasks = state.subtasks;
  if (!subtasks || subtasks.length === 0) {
    executorLogger.warn('⚠️  [Executor] Nenhuma subtask para executar.');
    return {
      currentStage: 'synthesis',
      executedCode: {
        results: {},
        allFilesModified: [],
        testResults: [],
        packagesInstalled: [],
        executionErrors: [],
        timestamp: new Date().toISOString(),
      },
    };
  }

  const allResults: Record<string, ExecutorResult> = {};
  const allFilesModified: string[] = [];
  const allTestResults: TestResult[] = [];
  const allPackagesInstalled: string[] = [];
  const allExecutionErrors: ExecutionError[] = [];
  const memoryEntries: string[] = [];
  const currentSubtask = state.currentSubtask;

  for (let i = currentSubtask; i < subtasks.length; i++) {
    const subtask = subtasks[i];
    const label = `${i + 1}/${subtasks.length} — ${subtask.title}`;
    executorLogger.info(`⚙️  [Executor] Executando subtask ${label}`);

    // ── Issue #11: executor retry guard ──────────────────────────────────────
    let attemptCount = 0;
    let lastError: Error | null = null;
    let executorResult: ExecutorResult | null = null;

    while (true) {
      const retryDecision = guards.checkExecutorRetry(attemptCount);
      if (!retryDecision.allowed) {
        executorLogger.warn(`⚠️  [Executor] ${guardReason(retryDecision)} for subtask "${subtask.title}".`);
        break;
      }

      try {
        const result = await executeSubtask(subtask, [
          ...(state.shortTermMemory ?? []),
          ...memoryEntries,
        ]);

        executorResult = {
          subtaskId: result.subtaskId,
          status: result.status,
          output: result.output,
          toolCallsExecuted: result.toolCallsExecuted,
          filesModified: result.filesModified,
          timestamp: result.timestamp,
          parsedTags: result.parsedTags,
          selfCorrectionAttempts: result.selfCorrectionAttempts,
        };

        // ── Issue #10: validate execution result ──────────────────────────────
        const validation = validateExecutionResult(executorResult);
        if (isValidationFailed(validation)) {
          executorLogger.warn(`⚠️  [Executor] Result validation: ${validation.error.message}`);
        } else if (validation.warnings.length > 0) {
          validation.warnings.forEach((w) => executorLogger.warn(`⚠️  [Executor] ${w}`));
        }

        // If the subtask succeeded, break out of retry loop
        if (result.status !== 'failed') {
          break;
        }

        // Subtask failed — check if we should retry
        lastError = new Error(result.output);
        attemptCount++;

        const nextRetryDecision = guards.checkExecutorRetry(attemptCount);
        if (!nextRetryDecision.allowed) {
          executorLogger.warn(`⚠️  [Executor] ${guardReason(nextRetryDecision)} for subtask "${subtask.title}".`);
          break;
        }

        executorLogger.warn(`⚠️  [Executor] Subtask "${subtask.title}" failed (attempt ${attemptCount}/${guards.getConfig().maxExecutorRetries}). Retrying...`);

      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        attemptCount++;
        executorLogger.warn(`⚠️  [Executor] Subtask "${subtask.title}" threw (attempt ${attemptCount}): ${lastError.message}`);

        const nextRetryDecision = guards.checkExecutorRetry(attemptCount);
        if (!nextRetryDecision.allowed) {
          break;
        }
      }
    }

    if (executorResult) {
      allResults[subtask.id] = executorResult;
      allFilesModified.push(...executorResult.filesModified);

      if (executorResult.parsedTags?.thinking) {
        console.log(`[Thinking...] ${executorResult.parsedTags.thinking.substring(0, 100)}...`);
      }

      if (executorResult.selfCorrectionAttempts && executorResult.selfCorrectionAttempts > 0) {
        console.log(`🔧 Auto-correções: ${executorResult.selfCorrectionAttempts}`);
      }

      const memoryEntry = `[Executor/${subtask.assignedAgent}] Subtask "${subtask.title}" → ${executorResult.status}. ` +
        `Tools: ${executorResult.toolCallsExecuted.join(', ')}. Files: ${executorResult.filesModified.join(', ')}.` +
        (executorResult.selfCorrectionAttempts ? ` Auto-correções: ${executorResult.selfCorrectionAttempts}.` : '') +
        (attemptCount > 1 ? ` Retry attempts: ${attemptCount}.` : '');
      memoryEntries.push(memoryEntry);

      if (executorResult.status === 'failed') {
        allExecutionErrors.push({
          subtaskId: subtask.id,
          error: executorResult.output,
          recoverable: false,
          attemptCount,
        });
      }
    } else {
      const errMsg = lastError?.message ?? 'Unknown error after all retries';
      console.error(`❌ [Executor] Falhou em ${subtask.id} após ${attemptCount} tentativas:`, errMsg);

      allResults[subtask.id] = {
        subtaskId: subtask.id,
        status: 'failed',
        output: errMsg,
        toolCallsExecuted: [],
        filesModified: [],
        timestamp: new Date().toISOString(),
      };

      allExecutionErrors.push({
        subtaskId: subtask.id,
        error: errMsg,
        recoverable: false,
        attemptCount,
      });

      const memoryEntry = `[Executor] Subtask "${subtask.title}" → FAILED after ${attemptCount} attempts: ${errMsg}`;
      memoryEntries.push(memoryEntry);
    }
  }

  const executedCode: ExecutedCode = {
    results: allResults,
    allFilesModified: [...new Set(allFilesModified)],
    testResults: allTestResults,
    packagesInstalled: allPackagesInstalled,
    executionErrors: allExecutionErrors,
    timestamp: new Date().toISOString(),
  };

  executorLogger.info(`⚙️  [Executor] Execução completa — ${Object.keys(allResults).length} subtasks processadas.`);

  return {
    executedCode,
    results: { ...state.results, ...allResults },
    currentSubtask: subtasks.length,
    currentStage: 'synthesis',
    shortTermMemory: [...(state.shortTermMemory ?? []), ...memoryEntries],
  };
}

// ─── Legacy executorAgent (backward compatibility) ───────────────────────────

/**
 * @deprecated Use executorNode instead. Kept for backward compatibility.
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
    const result = await executeSubtask(subtask, state.shortTermMemory ?? []);

    const memoryEntry = `[Executor/${subtask.assignedAgent}] Subtask "${subtask.title}" → ${result.status}. ` +
      `Tools: ${result.toolCallsExecuted.join(', ')}. Files: ${result.filesModified.join(', ')}.`;

    return {
      results: { ...state.results, [subtask.id]: result },
      currentSubtask: state.currentSubtask + 1,
      shortTermMemory: [...(state.shortTermMemory ?? []), memoryEntry],
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`❌ Executor falhou em ${subtask.id}:`, error.message);

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
