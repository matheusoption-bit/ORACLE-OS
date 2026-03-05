/**
 * ORACLE-OS Planner Agent — Testes Unitários (Sprint 2)
 * Usa mock do LLM para não consumir API real
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { PlanSchema, SubtaskSchema } from './planner.js';

// ─── Mock do model-registry ───────────────────────────────────────────────────
// Intercepta createModel e retorna um LLM falso com resposta controlada

vi.mock('../models/model-registry.js', () => ({
  createModel: vi.fn(),
}));

vi.mock('../config.js', () => ({
  config: {
    agents: {
      planner: { modelId: 'claude-3-7-sonnet', temperature: 0.7 },
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

    const mockPlan = buildMockPlan('Create a REST API endpoint', mockSubtasks);
    vi.mocked(createModel).mockReturnValue(createMockLLM(mockPlan) as never);

    const state = {
      task: 'Create a REST API endpoint',
      subtasks: [],
      currentSubtask: 0,
      results: {},
      errors: [],
      reviewStatus: 'pending' as const,
      iterationCount: 0,
    };

    const result = await plannerAgent(state);

    // Deve retornar subtasks
    expect(result.subtasks).toBeDefined();
    expect(result.subtasks!.length).toBeGreaterThan(0);

    // Cada subtask deve ter os campos do Sprint 2
    for (const subtask of result.subtasks!) {
      const parsed = SubtaskSchema.safeParse(subtask);
      expect(parsed.success).toBe(true);
    }

    // Prioridade dentro do range 1-5
    for (const subtask of result.subtasks!) {
      expect(subtask.priority).toBeGreaterThanOrEqual(1);
      expect(subtask.priority).toBeLessThanOrEqual(5);
    }
  });

  it('decompõe "Fix bug in authentication" em subtasks válidas', async () => {
    const { createModel } = await import('../models/model-registry.js');
    const { plannerAgent } = await import('./planner.js');

    const mockSubtasks = [
      buildMockSubtask({
        id: 'SEC-001',
        title: 'Reproduzir o bug de autenticação',
        type: 'search',
        priority: 1,
        assignedAgent: 'backend',
      }),
      buildMockSubtask({
        id: 'SEC-002',
        title: 'Corrigir lógica de refresh do token JWT',
        type: 'code',
        priority: 1,
        dependsOn: ['SEC-001'],
        dependencies: ['SEC-001'],
        assignedAgent: 'backend',
      }),
      buildMockSubtask({
        id: 'SEC-003',
        title: 'Code review da correção',
        type: 'review',
        priority: 2,
        dependsOn: ['SEC-002'],
        dependencies: ['SEC-002'],
        assignedAgent: 'security',
      }),
    ];

    const mockPlan = buildMockPlan('Fix bug in authentication', mockSubtasks);
    vi.mocked(createModel).mockReturnValue(createMockLLM(mockPlan) as never);

    const state = {
      task: 'Fix bug in authentication',
      subtasks: [],
      currentSubtask: 0,
      results: {},
      errors: [],
      reviewStatus: 'pending' as const,
      iterationCount: 0,
    };

    const result = await plannerAgent(state);

    expect(result.subtasks).toBeDefined();
    expect(result.subtasks!.length).toBeGreaterThan(0);

    // Deve conter pelo menos um subtask de review
    const hasReview = result.subtasks!.some((s) => s.type === 'review');
    expect(hasReview).toBe(true);

    // Todos os subtasks devem ser válidos pelo Zod
    for (const subtask of result.subtasks!) {
      const parsed = SubtaskSchema.safeParse(subtask);
      expect(parsed.success).toBe(true);
    }
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

    const mockPlan = buildMockPlan('Simple task', [buildMockSubtask()]);
    vi.mocked(createModel).mockReturnValue(createMockLLM(mockPlan) as never);

    const state = {
      task: 'Simple task',
      subtasks: [],
      currentSubtask: 5, // estava em execução anterior
      results: {},
      errors: [],
      reviewStatus: 'pending' as const,
      iterationCount: 0,
    };

    const result = await plannerAgent(state);
    expect(result.currentSubtask).toBe(0);
  });
});
