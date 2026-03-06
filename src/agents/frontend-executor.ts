/**
 * ORACLE-OS Frontend Executor Agent — Sprint 3
 * Especialista em React, Next.js, TypeScript, Tailwind
 * Estende o executor genérico com system prompt e ferramentas focadas em frontend
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { Subtask } from '../state/oracle-state.js';
import { fileReadTool, fileWriteTool, shellExecTool } from '../tools/tool-registry.js';
import { runToolLoop, SubtaskResult } from './executor.js';
import { executorLogger, systemLogger } from '../monitoring/logger.js';

// ─── Ferramentas do Frontend ──────────────────────────────────────────────────

const FRONTEND_TOOLS: DynamicStructuredTool[] = [
  fileReadTool,
  fileWriteTool,
  shellExecTool,
];

// ─── System Prompt Especializado ─────────────────────────────────────────────

const FRONTEND_SYSTEM_PROMPT = `Você é o **ORACLE Frontend Executor**, um engenheiro React/Next.js sênior.

## Especialidades
- React 18+ com TypeScript estrito (sem \`any\`)
- Next.js 14+ com App Router e Server Components
- Tailwind CSS com design responsivo
- Acessibilidade (WCAG 2.1 AA)
- Performance: Core Web Vitals, lazy loading, code splitting

## Padrões Obrigatórios
- Componentes funcionais com hooks (nunca class components)
- Props tipadas com interfaces TypeScript explícitas
- Exportações nomeadas + exportação default para páginas
- Separar lógica em hooks customizados (\`use*.ts\`)
- Arquivos de componente: \`ComponentName.tsx\`
- Estilos: Tailwind classes ou CSS Modules

## Fluxo de Trabalho
1. \`file_read\` → entender estrutura existente
2. \`file_write\` → criar/editar componentes
3. \`shell_exec\` → \`npm run build\` ou \`npm test\`
4. Reportar resultado

## Formato de Output
Retorne JSON: { status, filesModified, commandsRun, validationResult, notes }`;

// ─── Executor Frontend ────────────────────────────────────────────────────────

export async function frontendExecutorAgent(subtask: Subtask): Promise<SubtaskResult> {
  const taskPrompt = `<subtask>
ID: ${subtask.id}
Título: ${subtask.title}
Descrição: ${subtask.description}
Tipo: ${subtask.type}
Critério de validação: ${subtask.validationCriteria}
</subtask>

Implemente esta subtask usando sua especialização em frontend (React/Next.js/TypeScript).`;

  try {
    const { output, toolCallsExecuted, filesModified } = await runToolLoop(
      FRONTEND_SYSTEM_PROMPT,
      taskPrompt,
      FRONTEND_TOOLS
    );

    executorLogger.info(`Frontend Execution da subtask ${subtask.id} concluída. Fals: ${filesModified.length}`);

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
