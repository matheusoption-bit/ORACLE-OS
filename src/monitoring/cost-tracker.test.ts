/**
 * ORACLE-OS CostTracker — Testes Unitários (Sprint 8)
 * Valida rastreamento de tokens, cálculo de custo e comparação de estimativas
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock do config para não depender de module real ─────────────────────────

vi.mock('../config.js', () => ({
  MODEL_COSTS: {
    'llama-3.3-70b':     { input: 0.00059, output: 0.00079 },
    'claude-3-haiku':    { input: 0.00025, output: 0.00125 },
    'claude-3-5-sonnet': { input: 0.003,   output: 0.015   },
    'gemini-1.5-flash':  { input: 0.000075, output: 0.0003 },
  },
  ROUTING_STRATEGY: {
    'low':    'llama-3.3-70b',
    'medium': 'claude-3-haiku',
    'high':   'claude-3-5-sonnet',
  },
  config: {
    agents: {
      planner:  { modelId: 'claude-3-5-sonnet', temperature: 0.7 },
      executor: { modelId: 'llama-3.3-70b',     temperature: 0.2 },
      reviewer: { modelId: 'gemini-1.5-flash',  temperature: 0.3 },
    },
  },
}));

// ─── Importa CostTracker após mock ────────────────────────────────────────────

describe('CostTracker', () => {
  let CostTracker: typeof import('./cost-tracker.js').CostTracker;

  beforeEach(async () => {
    vi.resetModules();
    ({ CostTracker } = await import('./cost-tracker.js'));
  });

  // ─── track() ──────────────────────────────────────────────────────────────

  it('track() registra tokens corretamente por agente', async () => {
    const tracker = new CostTracker();
    tracker.startTask('task-001', 1000);

    tracker.track('task-001', 'planner', { input: 100, output: 200, model: 'claude-3-5-sonnet' });
    tracker.track('task-001', 'executor', { input: 300, output: 150, model: 'llama-3.3-70b' });
    tracker.track('task-001', 'reviewer', { input: 80, output: 60, model: 'gemini-1.5-flash' });

    const report = tracker.getTaskReport('task-001');

    expect(report.planner.tokens).toBe(300);   // 100 + 200
    expect(report.executor.tokens).toBe(450);  // 300 + 150
    expect(report.reviewer.tokens).toBe(140);  // 80 + 60
  });

  // ─── getTaskReport() ──────────────────────────────────────────────────────

  it('getTaskReport() calcula custo USD com base em MODEL_COSTS', async () => {
    const tracker = new CostTracker();
    tracker.startTask('task-002', 500);

    // 1000 tokens input + 500 output no modelo claude-3-5-sonnet
    // custo = (1000/1000 * 0.003) + (500/1000 * 0.015) = 0.003 + 0.0075 = 0.0105
    tracker.track('task-002', 'planner', { input: 1000, output: 500, model: 'claude-3-5-sonnet' });

    const report = tracker.getTaskReport('task-002');

    expect(report.planner.costUSD).toBeCloseTo(0.0105, 6);
    expect(report.totalCostUSD).toBeCloseTo(0.0105, 6);
  });

  it('getTaskReport() retorna zeros para task inexistente', async () => {
    const tracker = new CostTracker();
    const report = tracker.getTaskReport('nao-existe');

    expect(report.totalCostUSD).toBe(0);
    expect(report.planner.tokens).toBe(0);
    expect(report.executor.tokens).toBe(0);
    expect(report.reviewer.tokens).toBe(0);
  });

  it('getTaskReport() acumula múltiplos tracks do mesmo agente', async () => {
    const tracker = new CostTracker();
    tracker.startTask('task-003', 1000);

    tracker.track('task-003', 'executor', { input: 100, output: 50, model: 'llama-3.3-70b' });
    tracker.track('task-003', 'executor', { input: 200, output: 100, model: 'llama-3.3-70b' });
    tracker.track('task-003', 'executor', { input: 150, output: 75, model: 'llama-3.3-70b' });

    const report = tracker.getTaskReport('task-003');
    expect(report.executor.tokens).toBe(675); // (100+50) + (200+100) + (150+75)
  });

  // ─── compareWithEstimate() ────────────────────────────────────────────────

  it('compareWithEstimate() retorna eficiência 100% quando estimativa == real', async () => {
    const tracker = new CostTracker();
    tracker.startTask('task-004', 900); // estimativa = 900 tokens total

    tracker.track('task-004', 'planner',  { input: 300, output: 200, model: 'llama-3.3-70b' });
    tracker.track('task-004', 'executor', { input: 250, output: 150, model: 'llama-3.3-70b' });
    // Total real = 900 tokens → eficiência = 100%

    const { estimated, actual, efficiency } = tracker.compareWithEstimate('task-004');

    expect(estimated).toBe(900);
    expect(actual).toBe(900);
    expect(efficiency).toBeCloseTo(100, 1);
  });

  it('compareWithEstimate() retorna 0 para task inexistente', async () => {
    const tracker = new CostTracker();
    const result = tracker.compareWithEstimate('x-nao-existe');

    expect(result.estimated).toBe(0);
    expect(result.actual).toBe(0);
    expect(result.efficiency).toBe(0);
  });

  // ─── getMostExpensiveTasks() ──────────────────────────────────────────────

  it('getMostExpensiveTasks() retorna lista ordenada por custo DESC', async () => {
    const tracker = new CostTracker();

    tracker.startTask('barata', 100);
    tracker.track('barata', 'planner', { input: 100, output: 50, model: 'gemini-1.5-flash' });

    tracker.startTask('cara', 5000);
    tracker.track('cara', 'executor', { input: 5000, output: 3000, model: 'claude-3-5-sonnet' });

    tracker.startTask('media', 1000);
    tracker.track('media', 'reviewer', { input: 500, output: 300, model: 'claude-3-haiku' });

    const top2 = tracker.getMostExpensiveTasks(2);

    expect(top2.length).toBe(2);
    expect(top2[0].taskId).toBe('cara');         // mais cara primeiro
    expect(top2[0].totalCostUSD).toBeGreaterThan(top2[1].totalCostUSD);
  });

  it('getMostExpensiveTasks() respeita o limite (limit)', async () => {
    const tracker = new CostTracker();
    for (let i = 0; i < 5; i++) {
      tracker.startTask(`task-${i}`, 100);
      tracker.track(`task-${i}`, 'planner', { input: 100 * i, output: 50, model: 'llama-3.3-70b' });
    }

    const top3 = tracker.getMostExpensiveTasks(3);
    expect(top3.length).toBe(3);
  });

  // ─── startTask() ──────────────────────────────────────────────────────────

  it('startTask() inicializa record vazio sem quebrar getTaskReport()', async () => {
    const tracker = new CostTracker();
    tracker.startTask('task-fresh', 2000);

    const report = tracker.getTaskReport('task-fresh');
    expect(report.taskId).toBe('task-fresh');
    expect(report.totalCostUSD).toBe(0);
  });
});
