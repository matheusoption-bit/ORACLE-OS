/**
 * ORACLE-OS Reviewer Agent — Testes Unitários (Sprint 4)
 * Mock do LLM para não consumir API real
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OracleState } from '../state/oracle-state.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../models/model-registry.js', () => ({
  createModel: vi.fn(),
}));

vi.mock('../config.js', () => ({
  config: {
    agents: {
      reviewer: { modelId: 'gemini-2.0-flash', temperature: 0.3 },
    },
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildState(overrides: Partial<OracleState> = {}): OracleState {
  return {
    task: 'Create a Button component',
    subtasks: [
      {
        id: 'FE-001',
        title: 'Criar Button.tsx',
        description: 'Criar componente React Button',
        type: 'code',
        priority: 1,
        dependsOn: [],
        assignedAgent: 'frontend',
        dependencies: [],
        estimatedDuration: 15,
        tools: ['file_write'],
        validationCriteria: 'Componente renderiza sem erros',
      },
    ],
    currentSubtask: 1,
    results: {
      'FE-001': { subtaskId: 'FE-001', status: 'success', output: 'Button.tsx criado', toolCallsExecuted: ['file_write'], filesModified: ['src/components/Button.tsx'], timestamp: '2026-03-05T19:00:00Z' },
    },
    errors: [],
    reviewStatus: 'pending',
    iterationCount: 0,
    ...overrides,
  };
}

function buildMockModel(review: Record<string, unknown>) {
  return {
    withStructuredOutput: vi.fn().mockReturnValue({
      invoke: vi.fn().mockResolvedValue(review),
    }),
  };
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('reviewerAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aprova resultado válido — retorna reviewStatus: approved', async () => {
    const { createModel } = await import('../models/model-registry.js');
    const { reviewerAgent } = await import('./reviewer.js');

    vi.mocked(createModel).mockReturnValue(
      buildMockModel({ status: 'approved', issues: [], summary: 'Tudo correto.' }) as never
    );

    const state = buildState();
    const result = await reviewerAgent(state);

    expect(result.reviewStatus).toBe('approved');
    expect(result.iterationCount).toBe(1);
  });

  it('rejeita resultado com erros — retorna reviewStatus: rejected', async () => {
    const { createModel } = await import('../models/model-registry.js');
    const { reviewerAgent } = await import('./reviewer.js');

    vi.mocked(createModel).mockReturnValue(
      buildMockModel({
        status: 'rejected',
        issues: [{ severity: 'critical', description: 'Build quebrado', suggestedFix: 'Corrigir imports' }],
        summary: 'Falha crítica detectada.',
      }) as never
    );

    const state = buildState({
      results: { 'FE-001': { subtaskId: 'FE-001', status: 'failed', output: '', toolCallsExecuted: [], filesModified: [], timestamp: '2026-03-05T19:00:00Z' } },
      errors: [new Error('Build error')],
    });

    const result = await reviewerAgent(state);

    expect(result.reviewStatus).toBe('rejected');
    expect(result.iterationCount).toBe(1);
  });

  it('needs_revision popula revisionNotes com feedback específico', async () => {
    const { createModel } = await import('../models/model-registry.js');
    const { reviewerAgent } = await import('./reviewer.js');

    vi.mocked(createModel).mockReturnValue(
      buildMockModel({
        status: 'needs_revision',
        issues: [{ severity: 'major', description: 'Falta export default', suggestedFix: 'Adicionar export default Button' }],
        revisionNotes: 'Em Button.tsx: adicionar `export default Button` no final do arquivo.',
        summary: 'Implementação quase completa, falta export.',
      }) as never
    );

    const state = buildState();
    const result = await reviewerAgent(state);

    expect(result.reviewStatus).toBe('needs_revision');
    expect(result.revisionNotes).toBe('Em Button.tsx: adicionar `export default Button` no final do arquivo.');
  });

  it('força aprovação após iterationCount >= 3 — sem chamar LLM', async () => {
    const { createModel } = await import('../models/model-registry.js');
    const { reviewerAgent } = await import('./reviewer.js');

    const state = buildState({ iterationCount: 3 });
    const result = await reviewerAgent(state);

    // LLM não deve ter sido chamado
    expect(vi.mocked(createModel)).not.toHaveBeenCalled();
    expect(result.reviewStatus).toBe('approved');
    expect(result.revisionNotes).toContain('AUTO-APROVADO');
  });
});
