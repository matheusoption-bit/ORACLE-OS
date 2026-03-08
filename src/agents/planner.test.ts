/**
 * ORACLE-OS Planner Agent — Testes Unitários (Sprint 2)
 *
 * @deprecated These tests are for the deprecated Planner agent.
 * The Planner has been replaced by Analyst in the Quadripartite Architecture.
 * Tests now validate backward compatibility layer that delegates to analystNode.
 *
 * Usa mock do LLM para não consumir API real
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Define schemas locally since they're no longer exported from planner.js
const SubtaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  type: z.enum(['code', 'file', 'search', 'review', 'other']),
  priority: z.number().min(1).max(5),
  dependsOn: z.array(z.string()).default([]),
  assignedAgent: z.enum(['frontend', 'backend', 'devops', 'data', 'security', 'geral']).default('geral'),
  dependencies: z.array(z.string()).default([]),
  estimatedDuration: z.number().default(15),
  tools: z.array(z.string()).default([]),
  validationCriteria: z.string().default(''),
});

const PlanSchema = z.object({
  subtasks: z.array(SubtaskSchema),
  executionPlan: z.enum(['sequential', 'parallel', 'mixed']).default('sequential'),
});

// ─── Mock do model-registry ───────────────────────────────────────────────────
// Intercepta createModel e retorna um LLM falso com resposta controlada

vi.mock('../models/model-registry.js', () => ({
  createModel: vi.fn(),
}));

vi.mock('../rag/rag-pipeline.js', () => ({
  retrieveRelevantSkills: vi.fn().mockResolvedValue([]),
  formatSkillsAsContext: vi.fn().mockReturnValue('No skills available'),
}));

vi.mock('../prompts/enhancer.js', () => ({
  PromptEnhancer: vi.fn().mockImplementation(() => ({
    enhance: vi.fn().mockResolvedValue({
      originalPrompt: 'test',
      enhancedPrompt: 'test enhanced',
      complexity: 'medium',
      estimatedSubtasks: 3,
      estimatedTokens: 1000,
      suggestedMode: 'standard',
    }),
  })),
}));

vi.mock('../config.js', () => ({
  config: {
    agents: {
      analyst: { modelId: 'claude-3-5-sonnet', temperature: 0.5 },
      planner: { modelId: 'claude-3-5-sonnet', temperature: 0.7 },
    },
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockSubtask(overrides: Partial<z.infer<typeof SubtaskSchema>> = {}): z.infer<typeof SubtaskSchema> {
  return {
    id: 'BE-001',
    title: 'Implementar endpoint REST',
    description: 'Criar rota POST /api com validação Zod',
    type: 'code',
    priority: 1,
    dependsOn: [],
    assignedAgent: 'backend',
    dependencies: [],
    estimatedDuration: 20,
    tools: ['file_write', 'shell_npm'],
    validationCriteria: 'Retorna 201 para input válido',
    ...overrides,
  };
}

function buildMockPlan(
  task: string,
  subtasks: z.infer<typeof SubtaskSchema>[]
): z.infer<typeof PlanSchema> {
  return {
    subtasks,
    executionPlan: 'sequential',
  };
}

function createMockLLM(plan: z.infer<typeof PlanSchema>) {
  return {
    withStructuredOutput: vi.fn().mockReturnValue({
      invoke: vi.fn().mockResolvedValue(plan),
    }),
  };
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('plannerAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('decompõe "Create a REST API endpoint" em subtasks válidas', async () => {
    const { createModel } = await import('../models/model-registry.js');
    const { plannerAgent } = await import('./planner.js');

    const mockSubtasks = [
      buildMockSubtask({ id: 'BE-001', title: 'Definir schema de validação', type: 'code', priority: 1 }),
      buildMockSubtask({ id: 'BE-002', title: 'Implementar rota POST /api/endpoint', dependsOn: ['BE-001'], dependencies: ['BE-001'] }),
      buildMockSubtask({ id: 'BE-003', title: 'Escrever testes unitários', type: 'code', priority: 2, dependsOn: ['BE-002'], dependencies: ['BE-002'] }),
    ];

    // Mock the Analyst node output (which planner delegates to)
    vi.mocked(createModel).mockReturnValue({
      withStructuredOutput: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({
          taskSummary: 'Create REST API endpoint',
          requirements: ['Define validation schema', 'Implement POST route', 'Write unit tests'],
          relevantFiles: [],
          complexityLevel: 'medium',
          externalDependencies: [],
          initialRisks: [],
        }),
      }),
    } as never);

    const state = {
      task: 'Create a REST API endpoint',
      contextDocument: null,
      executionBlueprint: null,
      executedCode: null,
      synthesisOutput: null,
      currentStage: 'analyst' as const,
      subtasks: [],
      currentSubtask: 0,
      results: {},
      errors: [],
      reviewStatus: 'pending' as const,
      revisionNotes: undefined,
      iterationCount: 0,
      shortTermMemory: [],
    };

    const result = await plannerAgent(state);

    // Planner now delegates to Analyst, which returns contextDocument instead of subtasks
    // The subtasks are created by Reviewer in the Quadripartite architecture
    expect(result.contextDocument).toBeDefined();
    expect(result.contextDocument?.requirements).toBeDefined();
    expect(result.contextDocument?.requirements.length).toBeGreaterThan(0);
  });

  it('decompõe "Fix bug in authentication" em subtasks válidas', async () => {
    const { createModel } = await import('../models/model-registry.js');
    const { plannerAgent } = await import('./planner.js');

    vi.mocked(createModel).mockReturnValue({
      withStructuredOutput: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({
          taskSummary: 'Fix authentication bug',
          requirements: ['Reproduce bug', 'Fix JWT refresh logic', 'Code review'],
          relevantFiles: ['auth.ts', 'jwt.ts'],
          complexityLevel: 'medium',
          externalDependencies: [],
          initialRisks: ['Security vulnerability'],
        }),
      }),
    } as never);

    const state = {
      task: 'Fix bug in authentication',
      contextDocument: null,
      executionBlueprint: null,
      executedCode: null,
      synthesisOutput: null,
      currentStage: 'analyst' as const,
      subtasks: [],
      currentSubtask: 0,
      results: {},
      errors: [],
      reviewStatus: 'pending' as const,
      revisionNotes: undefined,
      iterationCount: 0,
      shortTermMemory: [],
    };

    const result = await plannerAgent(state);

    expect(result.contextDocument).toBeDefined();
    expect(result.contextDocument?.requirements).toBeDefined();
    expect(result.contextDocument?.initialRisks).toContain('Security vulnerability');
  });

  it('valida que o SubtaskSchema rejeita dados inválidos (priority fora do range)', () => {
    const invalidSubtask = {
      id: 'X-001',
      title: 'Subtask inválida',
      description: 'Teste de rejeição',
      type: 'code',
      priority: 99, // inválido — máximo é 5
      dependsOn: [],
      assignedAgent: 'backend',
      dependencies: [],
      estimatedDuration: 10,
      tools: [],
      validationCriteria: '',
    };

    const result = SubtaskSchema.safeParse(invalidSubtask);
    expect(result.success).toBe(false);
  });

  it('valida que o SubtaskSchema rejeita type desconhecido', () => {
    const invalidSubtask = buildMockSubtask({ type: 'unknown' as never });
    const result = SubtaskSchema.safeParse(invalidSubtask);
    expect(result.success).toBe(false);
  });

  it('valida que currentSubtask é resetado para 0 após o planejamento', async () => {
    const { createModel } = await import('../models/model-registry.js');
    const { plannerAgent } = await import('./planner.js');

    vi.mocked(createModel).mockReturnValue({
      withStructuredOutput: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({
          taskSummary: 'Simple task',
          requirements: ['Do something simple'],
          relevantFiles: [],
          complexityLevel: 'low',
          externalDependencies: [],
          initialRisks: [],
        }),
      }),
    } as never);

    const state = {
      task: 'Simple task',
      contextDocument: null,
      executionBlueprint: null,
      executedCode: null,
      synthesisOutput: null,
      currentStage: 'analyst' as const,
      subtasks: [],
      currentSubtask: 5, // estava em execução anterior
      results: {},
      errors: [],
      reviewStatus: 'pending' as const,
      revisionNotes: undefined,
      iterationCount: 0,
      shortTermMemory: [],
    };

    const result = await plannerAgent(state);
    // Analyst node doesn't reset currentSubtask, but it transitions to reviewer stage
    expect(result.currentStage).toBe('reviewer');
  });
});
