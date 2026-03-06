/**
 * ORACLE-OS · Testes de integração — Oracle Graph (Sprint 9)
 * Cobre: fluxo completo do grafo, integração com skill-generator,
 * roteamento de executores e tratamento de erros.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks de dependências externas ──────────────────────────────────────────
vi.mock('../agents/planner.js', () => ({
  plannerAgent: vi.fn(),
}));

vi.mock('../agents/executor.js', () => ({
  executorAgent: vi.fn(),
}));

vi.mock('../agents/frontend-executor.js', () => ({
  frontendExecutorAgent: vi.fn(),
}));

vi.mock('../agents/backend-executor.js', () => ({
  backendExecutorAgent: vi.fn(),
}));

vi.mock('../agents/reviewer.js', () => ({
  reviewerAgent: vi.fn(),
}));

vi.mock('../rag/rag-pipeline.js', () => ({
  saveTaskAsSkill: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../rag/skill-generator.js', () => ({
  generateSkillFromTask: vi.fn().mockResolvedValue({
    id: 'skill-test-001',
    title: 'Test Skill',
    tags: ['test'],
    successRate: 0.9,
  }),
}));

vi.mock('../monitoring/metrics.js', () => ({
  startTask:    vi.fn(),
  completeTask: vi.fn(),
}));

vi.mock('../monitoring/logger.js', () => ({
  plannerLogger:  { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  executorLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  reviewerLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  systemLogger:   { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../monitoring/cost-tracker.js', () => ({
  CostTracker: vi.fn().mockImplementation(() => ({
    startTask:           vi.fn(),
    track:               vi.fn(),
    getTaskReport:       vi.fn().mockReturnValue({
      totalCostUSD: 0.001,
      planner:  { tokens: 100 },
      executor: { tokens: 200 },
      reviewer: { tokens: 50 },
    }),
    compareWithEstimate: vi.fn().mockReturnValue({ efficiency: 95 }),
  })),
}));

vi.mock('../config.js', () => ({
  config: {
    agents: {
      planner:  { modelId: 'claude-3-5-sonnet' },
      executor: { modelId: 'claude-3-haiku' },
      reviewer: { modelId: 'claude-3-5-sonnet' },
    },
  },
}));

// ─── Imports após mocks ───────────────────────────────────────────────────────
import { createOracleGraph } from './oracle-graph.js';
import { plannerAgent } from '../agents/planner.js';
import { executorAgent } from '../agents/executor.js';
import { reviewerAgent } from '../agents/reviewer.js';
import { generateSkillFromTask } from '../rag/skill-generator.js';
import { saveTaskAsSkill } from '../rag/rag-pipeline.js';

const mockPlannerAgent  = vi.mocked(plannerAgent);
const mockExecutorAgent = vi.mocked(executorAgent);
const mockReviewerAgent = vi.mocked(reviewerAgent);

// ─── Estado inicial base ──────────────────────────────────────────────────────
const baseState = {
  task: 'Criar uma API REST com autenticação JWT',
  subtasks: [],
  currentSubtask: 0,
  results: {},
  errors: [],
  reviewStatus: 'pending' as const,
  revisionNotes: '',
  iterationCount: 0,
};

// ─── Testes ───────────────────────────────────────────────────────────────────
describe('Oracle Graph — Fluxo completo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cria o grafo sem lançar erro', () => {
    expect(() => createOracleGraph()).not.toThrow();
  });

  it('executa fluxo aprovado: planner → executor → reviewer → save_skill', async () => {
    const subtask = {
      id: 'sub-001',
      title: 'Criar endpoint /auth/login',
      type: 'api',
      assignedAgent: 'backend',
      expectedOutput: 'Endpoint funcional',
      dependencies: [],
    };

    // Planner retorna 1 subtask
    mockPlannerAgent.mockResolvedValue({
      subtasks: [subtask],
      currentSubtask: 0,
      iterationCount: 0,
    } as any);

    // Executor genérico retorna sucesso
    mockExecutorAgent.mockResolvedValue({
      results: {
        'sub-001': {
          subtaskId: 'sub-001',
          status: 'completed',
          output: 'Endpoint criado com sucesso',
          toolCallsExecuted: [],
          filesModified: [],
          timestamp: new Date().toISOString(),
        },
      },
      currentSubtask: 1,
    } as any);

    // Reviewer aprova
    mockReviewerAgent.mockResolvedValue({
      reviewStatus: 'approved',
      revisionNotes: '',
      iterationCount: 1,
    } as any);

    const graph = createOracleGraph();
    const finalState = await graph.invoke(baseState);

    expect(finalState.reviewStatus).toBe('approved');
    expect(saveTaskAsSkill).toHaveBeenCalledOnce();
    expect(generateSkillFromTask).toHaveBeenCalledOnce();
  });

  it('executa re-iteração quando reviewer solicita revisão', async () => {
    const subtask = {
      id: 'sub-002',
      title: 'Adicionar validação de input',
      type: 'api',
      assignedAgent: 'backend',
      expectedOutput: 'Validação implementada',
      dependencies: [],
    };

    mockPlannerAgent.mockResolvedValue({
      subtasks: [subtask],
      currentSubtask: 0,
      iterationCount: 0,
    } as any);

    mockExecutorAgent.mockResolvedValue({
      results: {
        'sub-002': {
          subtaskId: 'sub-002',
          status: 'completed',
          output: 'Implementado',
          toolCallsExecuted: [],
          filesModified: [],
          timestamp: new Date().toISOString(),
        },
      },
      currentSubtask: 1,
    } as any);

    // Primeiro reviewer solicita revisão, segundo aprova
    mockReviewerAgent
      .mockResolvedValueOnce({
        reviewStatus: 'needs_revision',
        revisionNotes: 'Adicionar tratamento de erro',
        iterationCount: 1,
      } as any)
      .mockResolvedValueOnce({
        reviewStatus: 'approved',
        revisionNotes: '',
        iterationCount: 2,
      } as any);

    const graph = createOracleGraph();
    const finalState = await graph.invoke(baseState);

    expect(finalState.reviewStatus).toBe('approved');
    // Reviewer foi chamado 2 vezes
    expect(mockReviewerAgent).toHaveBeenCalledTimes(2);
  });

  it('encerra com END quando planner retorna sem subtasks', async () => {
    mockPlannerAgent.mockResolvedValue({
      subtasks: [],
      currentSubtask: 0,
      iterationCount: 0,
    } as any);

    const graph = createOracleGraph();
    const finalState = await graph.invoke(baseState);

    // Sem subtasks, o grafo deve encerrar sem chamar executor
    expect(mockExecutorAgent).not.toHaveBeenCalled();
    expect(mockReviewerAgent).not.toHaveBeenCalled();
  });

  it('skill-generator é chamado após aprovação', async () => {
    const subtask = {
      id: 'sub-003',
      title: 'Criar middleware de autenticação',
      type: 'api',
      assignedAgent: 'backend',
      expectedOutput: 'Middleware funcional',
      dependencies: [],
    };

    mockPlannerAgent.mockResolvedValue({
      subtasks: [subtask],
      currentSubtask: 0,
      iterationCount: 0,
    } as any);

    mockExecutorAgent.mockResolvedValue({
      results: { 'sub-003': { subtaskId: 'sub-003', status: 'completed', output: 'ok', toolCallsExecuted: [], filesModified: [], timestamp: new Date().toISOString() } },
      currentSubtask: 1,
    } as any);

    mockReviewerAgent.mockResolvedValue({
      reviewStatus: 'approved',
      revisionNotes: '',
      iterationCount: 1,
    } as any);

    const graph = createOracleGraph();
    await graph.invoke(baseState);

    expect(generateSkillFromTask).toHaveBeenCalledOnce();
    // Verifica que foi chamado com o estado final
    const [calledState] = vi.mocked(generateSkillFromTask).mock.calls[0];
    expect(calledState.reviewStatus).toBe('approved');
  });

  it('não propaga erro do skill-generator (não crítico)', async () => {
    const subtask = {
      id: 'sub-004',
      title: 'Tarefa qualquer',
      type: 'api',
      assignedAgent: 'backend',
      expectedOutput: 'output',
      dependencies: [],
    };

    mockPlannerAgent.mockResolvedValue({
      subtasks: [subtask],
      currentSubtask: 0,
      iterationCount: 0,
    } as any);

    mockExecutorAgent.mockResolvedValue({
      results: { 'sub-004': { subtaskId: 'sub-004', status: 'completed', output: 'ok', toolCallsExecuted: [], filesModified: [], timestamp: new Date().toISOString() } },
      currentSubtask: 1,
    } as any);

    mockReviewerAgent.mockResolvedValue({
      reviewStatus: 'approved',
      revisionNotes: '',
      iterationCount: 1,
    } as any);

    // Skill generator lança erro
    vi.mocked(generateSkillFromTask).mockRejectedValue(new Error('LLM timeout'));

    const graph = createOracleGraph();

    // O grafo não deve lançar erro mesmo com skill-generator falhando
    await expect(graph.invoke(baseState)).resolves.toBeDefined();
  });
});
