/**
 * ORACLE-OS · Testes de integração — Oracle Graph (Quadripartite Architecture)
 * Cobre: fluxo completo do grafo Analyst → Reviewer → Executor → Synthesis,
 * roteamento condicional, iteration guards, e tratamento de erros.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks de dependências externas ──────────────────────────────────────────
vi.mock('../agents/analyst.js', () => ({
  analystNode: vi.fn(),
}));

vi.mock('../agents/reviewer.js', () => ({
  reviewerNode: vi.fn(),
}));

vi.mock('../agents/executor.js', () => ({
  executorNode: vi.fn(),
  executorAgent: vi.fn(),
  executorRouter: vi.fn().mockReturnValue('executor'),
}));

vi.mock('../agents/synthesis.js', () => ({
  synthesisNode: vi.fn(),
  costTracker: {
    startTask: vi.fn(),
    track: vi.fn(),
    getTaskReport: vi.fn().mockReturnValue({
      totalCostUSD: 0.001,
      analyst:   { tokens: 100 },
      reviewer:  { tokens: 50 },
      executor:  { tokens: 200 },
      synthesis: { tokens: 75 },
    }),
    compareWithEstimate: vi.fn().mockReturnValue({ efficiency: 95 }),
  },
}));

vi.mock('../agents/frontend-executor.js', () => ({
  frontendExecutorAgent: vi.fn(),
}));

vi.mock('../agents/backend-executor.js', () => ({
  backendExecutorAgent: vi.fn(),
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
  analystLogger:   { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  reviewerLogger:  { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  executorLogger:  { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  synthesisLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  systemLogger:    { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  plannerLogger:   { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../config.js', () => ({
  config: {
    agents: {
      analyst:   { modelId: 'claude-3-5-sonnet', temperature: 0.5 },
      reviewer:  { modelId: 'claude-3-5-sonnet', temperature: 0.3 },
      executor:  { modelId: 'claude-3-haiku', temperature: 0.2 },
      synthesis: { modelId: 'claude-3-5-sonnet', temperature: 0.4 },
      planner:   { modelId: 'claude-3-5-sonnet', temperature: 0.7 },
    },
    pipeline: {
      maxReviewerAnalystIterations: 3,
      maxExecutorRetries: 3,
      maxSubtasksPerBlueprint: 8,
    },
  },
}));

// ─── Imports após mocks ───────────────────────────────────────────────────────
import { createOracleGraph } from './oracle-graph.js';
import { analystNode } from '../agents/analyst.js';
import { reviewerNode } from '../agents/reviewer.js';
import { executorNode } from '../agents/executor.js';
import { synthesisNode } from '../agents/synthesis.js';

const mockAnalystNode   = vi.mocked(analystNode);
const mockReviewerNode  = vi.mocked(reviewerNode);
const mockExecutorNode  = vi.mocked(executorNode);
const mockSynthesisNode = vi.mocked(synthesisNode);

// ─── Estado inicial base (Quadripartite) ─────────────────────────────────────
const baseState = {
  task: 'Criar uma API REST com autenticação JWT',
  currentStage: 'analyst' as const,
  contextDocument: null,
  executionBlueprint: null,
  executedCode: null,
  synthesisOutput: null,
  subtasks: [],
  currentSubtask: 0,
  results: {},
  errors: [],
  reviewStatus: 'pending' as const,
  iterationCount: 0,
  shortTermMemory: [],
};

// ─── Testes ───────────────────────────────────────────────────────────────────
describe('Oracle Graph — Quadripartite Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cria o grafo sem lançar erro', () => {
    expect(() => createOracleGraph()).not.toThrow();
  });

  it('executa fluxo completo: analyst → reviewer → executor → synthesis', async () => {
    const subtask = {
      id: 'sub-001',
      title: 'Criar endpoint /auth/login',
      type: 'code',
      assignedAgent: 'backend',
      description: 'Implementar endpoint de login',
      priority: 1,
      dependsOn: [],
      dependencies: [],
      estimatedDuration: 15,
      tools: ['file_write', 'shell_exec'],
      validationCriteria: 'Endpoint funcional',
    };

    // Analyst retorna Context Document
    mockAnalystNode.mockResolvedValue({
      contextDocument: {
        taskSummary: 'Criar API REST com JWT',
        ragContext: '',
        requirements: ['Endpoint de login'],
        relevantFiles: ['src/routes/auth.ts'],
        complexityLevel: 'medium',
        externalDependencies: ['jsonwebtoken'],
        initialRisks: [],
        timestamp: new Date().toISOString(),
      },
      currentStage: 'reviewer',
      shortTermMemory: ['[Analyst] Analisou tarefa'],
    } as any);

    // Reviewer aprova e retorna Blueprint
    mockReviewerNode.mockResolvedValue({
      executionBlueprint: {
        status: 'approved',
        subtasks: [subtask],
        executionPlan: 'sequential',
        architecturalNotes: 'Plano sólido',
        securityRisks: [],
        redundanciesFound: [],
        timestamp: new Date().toISOString(),
      },
      subtasks: [subtask],
      currentSubtask: 0,
      currentStage: 'executor',
      reviewStatus: 'approved',
      iterationCount: 1,
      shortTermMemory: ['[Analyst] Analisou tarefa', '[Reviewer] Aprovado'],
    } as any);

    // Executor executa subtasks
    mockExecutorNode.mockResolvedValue({
      executedCode: {
        results: { 'sub-001': { subtaskId: 'sub-001', status: 'success', output: 'OK' } },
        allFilesModified: ['src/routes/auth.ts'],
        testResults: [],
        packagesInstalled: ['jsonwebtoken'],
        executionErrors: [],
        timestamp: new Date().toISOString(),
      },
      results: { 'sub-001': { subtaskId: 'sub-001', status: 'success', output: 'OK' } },
      currentSubtask: 1,
      currentStage: 'synthesis',
      shortTermMemory: ['[Analyst]', '[Reviewer]', '[Executor] sub-001 OK'],
    } as any);

    // Synthesis gera documentação
    mockSynthesisNode.mockResolvedValue({
      synthesisOutput: {
        executiveSummary: 'API REST com JWT implementada com sucesso.',
        commitMessages: ['feat(auth): add JWT login endpoint'],
        changelogEntries: ['### Added\n- JWT login endpoint'],
        readmeUpdates: '',
        finalFiles: [{ path: 'src/routes/auth.ts', description: 'Login endpoint' }],
        qualityMetrics: { subtasksCompleted: 1, subtasksTotal: 1, testsPassRate: 100, selfCorrections: 0 },
        timestamp: new Date().toISOString(),
      },
      currentStage: 'completed',
    } as any);

    const graph = createOracleGraph();
    const finalState = await graph.invoke(baseState);

    expect(mockAnalystNode).toHaveBeenCalledOnce();
    expect(mockReviewerNode).toHaveBeenCalledOnce();
    expect(mockExecutorNode).toHaveBeenCalledOnce();
    expect(mockSynthesisNode).toHaveBeenCalledOnce();
  });

  it('executa re-iteração quando reviewer solicita revisão', async () => {
    // First analyst call
    mockAnalystNode.mockResolvedValue({
      contextDocument: {
        taskSummary: 'Tarefa incompleta',
        ragContext: '',
        requirements: ['Req 1'],
        relevantFiles: [],
        complexityLevel: 'medium',
        externalDependencies: [],
        initialRisks: [],
        timestamp: new Date().toISOString(),
      },
      currentStage: 'reviewer',
      shortTermMemory: ['[Analyst] Primeira análise'],
    } as any);

    // First reviewer: needs_revision
    mockReviewerNode
      .mockResolvedValueOnce({
        executionBlueprint: {
          status: 'needs_revision',
          subtasks: [],
          feedbackToAnalyst: 'Falta análise de segurança',
          timestamp: new Date().toISOString(),
        },
        currentStage: 'analyst',
        reviewStatus: 'needs_revision',
        iterationCount: 1,
        shortTermMemory: ['[Analyst]', '[Reviewer] needs_revision'],
      } as any)
      // Second reviewer: approved
      .mockResolvedValueOnce({
        executionBlueprint: {
          status: 'approved',
          subtasks: [{ id: 'sub-1', title: 'Task', type: 'code', assignedAgent: 'geral', dependencies: [], dependsOn: [], priority: 1, estimatedDuration: 15, tools: [], validationCriteria: '', description: '' }],
          timestamp: new Date().toISOString(),
        },
        subtasks: [{ id: 'sub-1', title: 'Task', type: 'code', assignedAgent: 'geral', dependencies: [], dependsOn: [], priority: 1, estimatedDuration: 15, tools: [], validationCriteria: '', description: '' }],
        currentStage: 'executor',
        reviewStatus: 'approved',
        iterationCount: 2,
      } as any);

    mockExecutorNode.mockResolvedValue({
      executedCode: { results: {}, allFilesModified: [], testResults: [], packagesInstalled: [], executionErrors: [], timestamp: new Date().toISOString() },
      currentStage: 'synthesis',
    } as any);

    mockSynthesisNode.mockResolvedValue({
      synthesisOutput: { executiveSummary: 'Done', commitMessages: [], changelogEntries: [], readmeUpdates: '', finalFiles: [], qualityMetrics: { subtasksCompleted: 0, subtasksTotal: 0, testsPassRate: 0, selfCorrections: 0 }, timestamp: new Date().toISOString() },
      currentStage: 'completed',
    } as any);

    const graph = createOracleGraph();
    const finalState = await graph.invoke(baseState);

    // Analyst called twice (initial + re-analysis)
    expect(mockAnalystNode).toHaveBeenCalledTimes(2);
    // Reviewer called twice
    expect(mockReviewerNode).toHaveBeenCalledTimes(2);
  });

  it('encerra com END quando reviewer rejeita', async () => {
    mockAnalystNode.mockResolvedValue({
      contextDocument: { taskSummary: 'Tarefa perigosa', ragContext: '', requirements: [], relevantFiles: [], complexityLevel: 'high', externalDependencies: [], initialRisks: ['Risco crítico'], timestamp: new Date().toISOString() },
      currentStage: 'reviewer',
    } as any);

    mockReviewerNode.mockResolvedValue({
      executionBlueprint: { status: 'rejected', subtasks: [], timestamp: new Date().toISOString() },
      currentStage: 'completed',
      reviewStatus: 'rejected',
      iterationCount: 1,
    } as any);

    const graph = createOracleGraph();
    const finalState = await graph.invoke(baseState);

    expect(mockAnalystNode).toHaveBeenCalledOnce();
    expect(mockReviewerNode).toHaveBeenCalledOnce();
    expect(mockExecutorNode).not.toHaveBeenCalled();
    expect(mockSynthesisNode).not.toHaveBeenCalled();
  });
});
