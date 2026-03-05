/**
 * ORACLE-OS Executor Agent — Testes Unitários (Sprint 3)
 * Mock de tools e LLM para não consumir API real
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OracleState, Subtask } from '../state/oracle-state.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../models/model-registry.js', () => ({
  createModel: vi.fn(),
}));

vi.mock('../config.js', () => ({
  config: {
    agents: {
      executor: { modelId: 'llama-3.3-70b', temperature: 0.2 },
    },
  },
}));

vi.mock('../tools/tool-registry.js', () => ({
  getToolsForAgent: vi.fn().mockReturnValue([]),
  fileReadTool:  { name: 'file_read',  invoke: vi.fn() },
  fileWriteTool: { name: 'file_write', invoke: vi.fn() },
  shellExecTool: { name: 'shell_exec', invoke: vi.fn() },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSubtask(overrides: Partial<Subtask> = {}): Subtask {
  return {
    id: 'BE-001',
    title: 'Implementar endpoint REST',
    description: 'Criar POST /api/users com validação Zod',
    type: 'code',
    priority: 1,
    dependsOn: [],
    assignedAgent: 'backend',
    dependencies: [],
    estimatedDuration: 20,
    tools: ['file_write', 'shell_exec'],
    validationCriteria: 'Retorna 201 para input válido',
    ...overrides,
  };
}

function buildState(overrides: Partial<OracleState> = {}): OracleState {
  return {
    task: 'Criar endpoint de usuários',
    subtasks: [buildSubtask()],
    currentSubtask: 0,
    results: {},
    errors: [],
    reviewStatus: 'pending',
    iterationCount: 0,
    ...overrides,
  };
}

function createMockModel(finalContent: string, toolCalls: unknown[] = []) {
  let callCount = 0;
  return {
    bindTools: vi.fn().mockReturnValue({
      invoke: vi.fn().mockImplementation(async () => {
        callCount++;
        // Primeira chamada retorna tool calls (se houver), segunda retorna resposta final
        if (callCount === 1 && toolCalls.length > 0) {
          return { content: '', tool_calls: toolCalls };
        }
        return { content: finalContent, tool_calls: [] };
      }),
    }),
  };
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('executorAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executa subtask tipo "code" e salva resultado em state.results', async () => {
    const { createModel } = await import('../models/model-registry.js');
    const { executorAgent } = await import('./executor.js');

    const outputJson = JSON.stringify({
      status: 'success',
      filesModified: ['src/routes/users.ts'],
      commandsRun: [],
      validationResult: 'Endpoint criado com sucesso',
    });

    vi.mocked(createModel).mockReturnValue(createMockModel(outputJson) as never);

    const state = buildState();
    const result = await executorAgent(state);

    expect(result.results).toBeDefined();
    expect(result.results!['BE-001']).toBeDefined();
    expect(result.results!['BE-001'].status).toBe('success');
  });

  it('executa subtask tipo "file" e salva resultado em state.results', async () => {
    const { createModel } = await import('../models/model-registry.js');
    const { executorAgent } = await import('./executor.js');

    const outputJson = JSON.stringify({
      status: 'success',
      filesModified: ['docs/README.md'],
      commandsRun: [],
      validationResult: 'Arquivo criado',
    });

    vi.mocked(createModel).mockReturnValue(createMockModel(outputJson) as never);

    const subtask = buildSubtask({ id: 'DOC-001', type: 'file', title: 'Criar README.md' });
    const state = buildState({ subtasks: [subtask] });

    const result = await executorAgent(state);

    expect(result.results!['DOC-001']).toBeDefined();
    expect(result.results!['DOC-001'].subtaskId).toBe('DOC-001');
  });

  it('captura erro de tool e adiciona em state.errors sem quebrar o fluxo', async () => {
    const { createModel } = await import('../models/model-registry.js');
    const { executorAgent } = await import('./executor.js');

    // Simula LLM lançando exceção
    vi.mocked(createModel).mockReturnValue({
      bindTools: vi.fn().mockReturnValue({
        invoke: vi.fn().mockRejectedValue(new Error('LLM connection timeout')),
      }),
    } as never);

    const state = buildState();
    const result = await executorAgent(state);

    // Deve salvar resultado com status "failed"
    expect(result.results!['BE-001'].status).toBe('failed');
    // Deve adicionar o erro ao array state.errors
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('incrementa currentSubtask após execução (sucesso ou falha)', async () => {
    const { createModel } = await import('../models/model-registry.js');
    const { executorAgent } = await import('./executor.js');

    vi.mocked(createModel).mockReturnValue(
      createMockModel(JSON.stringify({ status: 'success' })) as never
    );

    const state = buildState({ currentSubtask: 0 });
    const result = await executorAgent(state);

    expect(result.currentSubtask).toBe(1);
  });

  it('retorna estado inalterado quando currentSubtask está fora do range', async () => {
    const { executorAgent } = await import('./executor.js');

    const state = buildState({ currentSubtask: 99 }); // além do array
    const result = await executorAgent(state);

    // Deve retornar sem tentar executar
    expect(result.currentSubtask).toBe(99);
    expect(result.results).toBeUndefined();
  });
});
