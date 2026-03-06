import { MODEL_COSTS } from '../config.js';

export interface TaskCostSummary {
    taskId: string;
    totalTokens: number;
    totalCostUSD: number;
}

export interface CostReport {
    taskId: string;
    planner: { tokens: number; costUSD: number };
    executor: { tokens: number; costUSD: number };
    reviewer: { tokens: number; costUSD: number };
    totalCostUSD: number;
}

export class CostTracker {
  private records: Record<string, {
      planner: { input: number; output: number; model: string }[];
      executor: { input: number; output: number; model: string }[];
      reviewer: { input: number; output: number; model: string }[];
  }> = {};

  private estimates: Record<string, number> = {};

  startTask(taskId: string, expectedTokens: number) {
      this.records[taskId] = { planner: [], executor: [], reviewer: [] };
      this.estimates[taskId] = expectedTokens;
  }

  track(taskId: string, agent: 'planner' | 'executor' | 'reviewer', tokens: {
    input: number;
    output: number;
    model: string;
  }): void {
      if (!this.records[taskId]) {
          this.records[taskId] = { planner: [], executor: [], reviewer: [] };
      }
      this.records[taskId][agent].push(tokens);
  }

  private calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
      const costs = MODEL_COSTS[modelId as keyof typeof MODEL_COSTS];
      if (!costs) return 0; // Fallback se modelo não encontrado
      return ((inputTokens / 1000) * costs.input) + ((outputTokens / 1000) * costs.output);
  }

  compareWithEstimate(taskId: string): {
    estimated: number;
    actual: number;
    efficiency: number; // % de acerto da estimativa
  } {
      const record = this.records[taskId];
      if (!record) return { estimated: 0, actual: 0, efficiency: 0 };
      
      const estimated = this.estimates[taskId] || 0;
      let actual = 0;

      for (const agent of ['planner', 'executor', 'reviewer'] as const) {
          actual += record[agent].reduce((sum, item) => sum + item.input + item.output, 0);
      }

      const efficiency = estimated > 0 ? (estimated / actual) * 100 : 0;

      return { estimated, actual, efficiency };
  }

  getTaskReport(taskId: string): CostReport {
      const record = this.records[taskId];
      if (!record) {
          return {
              taskId,
              planner: { tokens: 0, costUSD: 0 },
              executor: { tokens: 0, costUSD: 0 },
              reviewer: { tokens: 0, costUSD: 0 },
              totalCostUSD: 0
          };
      }

      const calculateAgentStats = (agent: 'planner' | 'executor' | 'reviewer') => {
          return record[agent].reduce((acc, item) => ({
              tokens: acc.tokens + item.input + item.output,
              costUSD: acc.costUSD + this.calculateCost(item.model, item.input, item.output)
          }), { tokens: 0, costUSD: 0 });
      };

      const plannerStats = calculateAgentStats('planner');
      const executorStats = calculateAgentStats('executor');
      const reviewerStats = calculateAgentStats('reviewer');

      return {
          taskId,
          planner: plannerStats,
          executor: executorStats,
          reviewer: reviewerStats,
          totalCostUSD: plannerStats.costUSD + executorStats.costUSD + reviewerStats.costUSD
      };
  }

  getMostExpensiveTasks(limit: number): TaskCostSummary[] {
      const summaries = Object.keys(this.records).map(taskId => {
          const report = this.getTaskReport(taskId);
          return {
              taskId,
              totalTokens: report.planner.tokens + report.executor.tokens + report.reviewer.tokens,
              totalCostUSD: report.totalCostUSD
          };
      });

      return summaries.sort((a, b) => b.totalCostUSD - a.totalCostUSD).slice(0, limit);
  }
}
