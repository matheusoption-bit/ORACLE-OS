/**
 * ORACLE-OS PromptEnhancer — Testes Unitários (Sprint 8)
 * Valida detectMode(), estimateCost() e fallback do enhance()
 * Usa mock do LLM para não consumir API real
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../models/model-registry.js', () => ({
  createModel: vi.fn(),
}));

vi.mock('../config.js', () => ({
  MODEL_COSTS: {
    'llama-3.3-70b':     { input: 0.00059, output: 0.00079 },
    'claude-3-haiku':    { input: 0.00025, output: 0.00125 },
    'claude-3-5-sonnet': { input: 0.003,   output: 0.015   },
  },
  config: {
    agents: {
      planner: { modelId: 'claude-3-5-sonnet', temperature: 0.7 },
    },
  },
}));

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('PromptEnhancer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── detectMode() ─────────────────────────────────────────────────────────

  it('detectMode() retorna "planning" para prompts com palavra "planejar"', async () => {
    const { PromptEnhancer } = await import('./enhancer.js');
    const enhancer = new PromptEnhancer();

    expect(enhancer.detectMode('planejar a arquitetura do sistema')).toBe('planning');
  });

  it('detectMode() retorna "planning" para prompts com palavra "arquitetura"', async () => {
    const { PromptEnhancer } = await import('./enhancer.js');
    const enhancer = new PromptEnhancer();

    expect(enhancer.detectMode('defina a arquitetura do microsserviço')).toBe('planning');
  });

  it('detectMode() retorna "planning" para prompts com palavra "analise"', async () => {
    const { PromptEnhancer } = await import('./enhancer.js');
    const enhancer = new PromptEnhancer();

    expect(enhancer.detectMode('analise o código e sugira melhorias')).toBe('planning');
  });

  it('detectMode() retorna "standard" para prompts simples de execução', async () => {
    const { PromptEnhancer } = await import('./enhancer.js');
    const enhancer = new PromptEnhancer();

    expect(enhancer.detectMode('cria um botão de login')).toBe('standard');
    expect(enhancer.detectMode('adicionar campo de e-mail no formulário')).toBe('standard');
    expect(enhancer.detectMode('fix the null pointer exception')).toBe('standard');
  });

  // ─── estimateCost() ───────────────────────────────────────────────────────

  it('estimateCost() retorna os três campos obrigatórios', async () => {
    const { PromptEnhancer } = await import('./enhancer.js');
    const enhancer = new PromptEnhancer();

    const mockEnhanced = {
      originalPrompt: 'criar endpoint',
      enhancedPrompt: 'Crie um endpoint REST...',
      complexity: 'medium' as const,
      estimatedSubtasks: 3,
      estimatedTokens: 1200,
      suggestedMode: 'standard' as const,
    };

    const result = enhancer.estimateCost(mockEnhanced);

    expect(result).toHaveProperty('estimatedTokens');
    expect(result).toHaveProperty('estimatedCostUSD');
    expect(result).toHaveProperty('estimatedTimeSeconds');
  });

  it('estimateCost() calcula estimatedCostUSD proporcional aos tokens', async () => {
    const { PromptEnhancer } = await import('./enhancer.js');
    const enhancer = new PromptEnhancer();

    const mock1 = {
      originalPrompt: 'x', enhancedPrompt: 'x', complexity: 'low' as const,
      estimatedSubtasks: 1, estimatedTokens: 1000, suggestedMode: 'standard' as const,
    };
    const mock2 = {
      originalPrompt: 'x', enhancedPrompt: 'x', complexity: 'low' as const,
      estimatedSubtasks: 1, estimatedTokens: 2000, suggestedMode: 'standard' as const,
    };

    const cost1 = enhancer.estimateCost(mock1);
    const cost2 = enhancer.estimateCost(mock2);

    // 2000 tokens deve custar o dobro de 1000 tokens
    expect(cost2.estimatedCostUSD).toBeCloseTo(cost1.estimatedCostUSD * 2, 6);
  });

  it('estimateCost() calcula estimatedTimeSeconds baseado no número de subtasks', async () => {
    const { PromptEnhancer } = await import('./enhancer.js');
    const enhancer = new PromptEnhancer();

    const mock3 = {
      originalPrompt: 'x', enhancedPrompt: 'x', complexity: 'medium' as const,
      estimatedSubtasks: 3, estimatedTokens: 800, suggestedMode: 'standard' as const,
    };
    const mock6 = {
      ...mock3,
      estimatedSubtasks: 6,
    };

    const time3 = enhancer.estimateCost(mock3);
    const time6 = enhancer.estimateCost(mock6);

    expect(time6.estimatedTimeSeconds).toBe(time3.estimatedTimeSeconds * 2);
  });

  // ─── enhance() com fallback ───────────────────────────────────────────────

  it('enhance() retorna prompt original como fallback quando LLM falha', async () => {
    const { createModel } = await import('../models/model-registry.js');
    const { PromptEnhancer } = await import('./enhancer.js');

    // Simula LLM lançando exceção
    vi.mocked(createModel).mockReturnValue({
      withStructuredOutput: vi.fn().mockReturnValue({
        invoke: vi.fn().mockRejectedValue(new Error('LLM timeout')),
      }),
    } as never);

    const enhancer = new PromptEnhancer();
    const result = await enhancer.enhance('cria um componente de alerta');

    // Deve retornar o prompt original inalterado
    expect(result.originalPrompt).toBe('cria um componente de alerta');
    expect(result.enhancedPrompt).toBe('cria um componente de alerta');
    expect(result.complexity).toBe('medium'); // valor padrão do fallback
    expect(result.suggestedMode).toBe('standard'); // valor padrão do fallback
  });

  it('enhance() retorna EnhancedPrompt com todos os campos quando LLM sucede', async () => {
    const { createModel } = await import('../models/model-registry.js');
    const { PromptEnhancer } = await import('./enhancer.js');

    const mockOutput = {
      originalPrompt: 'cria um botão',
      enhancedPrompt: 'Crie um componente React Button em TypeScript...',
      complexity: 'low' as const,
      estimatedSubtasks: 2,
      estimatedTokens: 800,
      suggestedMode: 'standard' as const,
    };

    vi.mocked(createModel).mockReturnValue({
      withStructuredOutput: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue(mockOutput),
      }),
    } as never);

    const enhancer = new PromptEnhancer();
    const result = await enhancer.enhance('cria um botão');

    expect(result.complexity).toBe('low');
    expect(result.estimatedSubtasks).toBe(2);
    expect(result.suggestedMode).toBe('standard');
  });
});
