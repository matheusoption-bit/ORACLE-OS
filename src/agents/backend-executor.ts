/**
 * ORACLE-OS Backend Executor Agent — Sprint 3
 * Especialista em Node.js, Python, APIs REST, bancos de dados
 * Estende o executor genérico com system prompt e ferramentas focadas em backend
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { Subtask } from '../state/oracle-state.js';
import {
  fileReadTool,
  fileWriteTool,
  shellExecTool,
  githubCreateFileTool,
} from '../tools/tool-registry.js';
import { runToolLoop, SubtaskResult } from './executor.js';
import { executorLogger } from '../monitoring/logger.js';

// ─── Ferramentas do Backend ───────────────────────────────────────────────────

const BACKEND_TOOLS: DynamicStructuredTool[] = [
  fileReadTool,
  fileWriteTool,
  shellExecTool,
  githubCreateFileTool,
];

// ─── System Prompt Especializado ─────────────────────────────────────────────

const BACKEND_SYSTEM_PROMPT = `Você é o **ORACLE Backend Executor**, um engenheiro de backend sênior.

## Especialidades
- Node.js 20+ com TypeScript estrito (ESM, sem CommonJS)
- APIs REST com Express ou Fastify
- ORMs: Prisma, TypeORM, Drizzle
- Bancos de dados: PostgreSQL, Redis, MongoDB
- Autenticação: JWT, OAuth2, sessions
- Python: FastAPI, Pydantic, SQLAlchemy (quando necessário)

## Padrões Obrigatórios
- Validação de input com Zod (nunca confiar em dados não validados)
- Error handling em todas as rotas (try/catch + middleware de erros)
- Sem secrets hardcoded — sempre \`process.env.VARIABLE\`
- Respostas tipadas com interfaces TypeScript
- Migration-first para mudanças de banco
- Testes com Vitest + mocks do banco (nunca banco real em testes)

## Fluxo de Trabalho
1. \`file_read\` → entender estrutura existente do projeto
2. \`file_write\` → criar/editar arquivos de código
3. \`shell_exec\` → instalar dependências, rodar migrations, testes
4. \`github_create_file\` → criar arquivo remoto quando necessário
5. Reportar resultado estruturado

## Formato de Output
Retorne JSON: { status, filesModified, commandsRun, validationResult, notes }`;

// ─── Executor Backend ─────────────────────────────────────────────────────────

export async function backendExecutorAgent(subtask: Subtask): Promise<SubtaskResult> {
  const taskPrompt = `<subtask>
ID: ${subtask.id}
Título: ${subtask.title}
Descrição: ${subtask.description}
Tipo: ${subtask.type}
Critério de validação: ${subtask.validationCriteria}
</subtask>

Implemente esta subtask usando sua especialização em backend (Node.js/Python/APIs/banco de dados).`;

  try {
    const { output, toolCallsExecuted, filesModified } = await runToolLoop(
      BACKEND_SYSTEM_PROMPT,
      taskPrompt,
      BACKEND_TOOLS
    );

    executorLogger.info(`Backend Execution da subtask ${subtask.id} concluída. Fals: ${filesModified.length}`);

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
      output: message,
      toolCallsExecuted: [],
      filesModified: [],
      timestamp: new Date().toISOString(),
    };
  }
}
