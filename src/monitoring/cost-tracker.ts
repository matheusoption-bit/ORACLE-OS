/**
 * ORACLE-OS Cost Tracker — Quadripartite Architecture
 * Tracks token usage and costs across the 4-stage pipeline:
 * Analyst → Reviewer → Executor → Synthesis
 */

import { MODEL_COSTS } from '../config.js';

export type AgentRole = 'analyst' | 'reviewer' | 'executor' | 'synthesis' | 'planner';

export interface TokenRecord {
  input: number;
  output: number;
  model: string;
}

export interface AgentCostStats {
  tokens: number;
  costUSD: number;
}

export interface TaskCostSummary {
  taskId: string;
  totalTokens: number;
  totalCostUSD: number;
}

export interface CostReport {
  taskId: string;
  analyst: AgentCostStats;
  reviewer: AgentCostStats;
  executor: AgentCostStats;
  synthesis: AgentCostStats;
  /** @deprecated Use 'analyst' instead */
  planner: AgentCostStats;
  totalCostUSD: number;
}

type AgentRecords = Record<AgentRole, TokenRecord[]>;

export class CostTracker {
  private records: Record<string, AgentRecords> = {};
  private estimates: Record<string, number> = {};

  private createEmptyRecords(): AgentRecords {
    return {
      analyst: [],
      reviewer: [],
      executor: [],
      synthesis: [],
      planner: [], // legacy alias
    };
  }

  startTask(taskId: string, expectedTokens: number): void {
    this.records[taskId] = this.createEmptyRecords();
    this.estimates[taskId] = expectedTokens;
  }

  track(taskId: string, agent: AgentRole, tokens: TokenRecord): void {
    if (!this.records[taskId]) {
      this.records[taskId] = this.createEmptyRecords();
    }

    // Map legacy 'planner' to 'analyst'
    const resolvedAgent = agent === 'planner' ? 'analyst' : agent;
    this.records[taskId][resolvedAgent].push(tokens);
  }

  private calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
    const costs = MODEL_COSTS[modelId as keyof typeof MODEL_COSTS];
    if (!costs) return 0;
    return ((inputTokens / 1000) * costs.input) + ((outputTokens / 1000) * costs.output);
  }

  private calculateAgentStats(records: TokenRecord[]): AgentCostStats {
    return records.reduce(
      (acc, item) => ({
        tokens: acc.tokens + item.input + item.output,
        costUSD: acc.costUSD + this.calculateCost(item.model, item.input, item.output),
      }),
      { tokens: 0, costUSD: 0 }
    );
  }

  compareWithEstimate(taskId: string): {
    estimated: number;
    actual: number;
    efficiency: number;
  } {
    const record = this.records[taskId];
    if (!record) return { estimated: 0, actual: 0, efficiency: 0 };

    const estimated = this.estimates[taskId] || 0;
    let actual = 0;

    const agents: AgentRole[] = ['analyst', 'reviewer', 'executor', 'synthesis'];
    for (const agent of agents) {
      actual += record[agent].reduce((sum, item) => sum + item.input + item.output, 0);
    }

    const efficiency = estimated > 0 ? (estimated / actual) * 100 : 0;
    return { estimated, actual, efficiency };
  }

  getTaskReport(taskId: string): CostReport {
    const record = this.records[taskId];
    if (!record) {
      const empty: AgentCostStats = { tokens: 0, costUSD: 0 };
      return {
        taskId,
        analyst: empty,
        reviewer: empty,
        executor: empty,
        synthesis: empty,
        planner: empty,
        totalCostUSD: 0,
      };
    }

    const analystStats = this.calculateAgentStats(record.analyst);
    const reviewerStats = this.calculateAgentStats(record.reviewer);
    const executorStats = this.calculateAgentStats(record.executor);
    const synthesisStats = this.calculateAgentStats(record.synthesis);

    return {
      taskId,
      analyst: analystStats,
      reviewer: reviewerStats,
      executor: executorStats,
      synthesis: synthesisStats,
      planner: analystStats, // legacy alias
      totalCostUSD:
        analystStats.costUSD +
        reviewerStats.costUSD +
        executorStats.costUSD +
        synthesisStats.costUSD,
    };
  }

  getMostExpensiveTasks(limit: number): TaskCostSummary[] {
    const summaries = Object.keys(this.records).map((taskId) => {
      const report = this.getTaskReport(taskId);
      return {
        taskId,
        totalTokens:
          report.analyst.tokens +
          report.reviewer.tokens +
          report.executor.tokens +
          report.synthesis.tokens,
        totalCostUSD: report.totalCostUSD,
      };
    });

    return summaries.sort((a, b) => b.totalCostUSD - a.totalCostUSD).slice(0, limit);
  }
}
