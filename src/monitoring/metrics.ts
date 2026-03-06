/**
 * ORACLE-OS Metrics — Quadripartite Architecture
 * Tracks task lifecycle metrics for the 4-stage pipeline:
 * Analyst → Reviewer → Executor → Synthesis
 */

import { resolve, join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { OracleState } from '../state/oracle-state.js';
import { config } from '../config.js';

export interface TaskMetrics {
  taskId: string;
  task: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  status: 'running' | 'completed' | 'failed';
  /** Current pipeline stage */
  currentStage: string;
  reviewStatus: string;
  iterationCount: number;
  modelsUsed: {
    analyst: string;
    reviewer: string;
    executor: string;
    synthesis: string;
    /** @deprecated Use 'analyst' instead */
    planner: string;
  };
  subtasksTotal: number;
  subtasksCompleted: number;
  errorsCount: number;
  skillsRetrieved: number;
  skillSaved: boolean;
  /** Quadripartite stage completion tracking */
  stagesCompleted: {
    analyst: boolean;
    reviewer: boolean;
    executor: boolean;
    synthesis: boolean;
  };
}

const MONITORING_DIR = resolve(process.cwd(), 'monitoring');
const METRICS_FILE = join(MONITORING_DIR, 'metrics.json');

let inMemoryMetrics: TaskMetrics[] = [];

function ensureStorage(): void {
  if (!existsSync(MONITORING_DIR)) {
    mkdirSync(MONITORING_DIR, { recursive: true });
  }
}

function persistMetrics(): void {
  ensureStorage();
  writeFileSync(METRICS_FILE, JSON.stringify(inMemoryMetrics, null, 2), 'utf-8');
}

function loadMetricsMemory(): void {
  if (inMemoryMetrics.length === 0 && existsSync(METRICS_FILE)) {
    try {
      inMemoryMetrics = JSON.parse(readFileSync(METRICS_FILE, 'utf-8'));
    } catch (e) {
      console.error('Falha ao ler cache de métricas', e);
    }
  }
}

/**
 * Start tracking a new task in the Quadripartite pipeline
 */
export function startTask(taskId: string, task: string, state: OracleState): void {
  loadMetricsMemory();

  const newMetric: TaskMetrics = {
    taskId,
    task,
    startedAt: new Date().toISOString(),
    status: 'running',
    currentStage: state.currentStage ?? 'analyst',
    reviewStatus: state.reviewStatus,
    iterationCount: state.iterationCount,
    modelsUsed: {
      analyst: config.agents.analyst.modelId,
      reviewer: config.agents.reviewer.modelId,
      executor: config.agents.executor.modelId,
      synthesis: config.agents.synthesis.modelId,
      planner: config.agents.analyst.modelId, // legacy alias
    },
    subtasksTotal: state.subtasks.length || 0,
    subtasksCompleted: state.currentSubtask || 0,
    errorsCount: state.errors.length,
    skillsRetrieved: 0,
    skillSaved: false,
    stagesCompleted: {
      analyst: false,
      reviewer: false,
      executor: false,
      synthesis: false,
    },
  };

  inMemoryMetrics.push(newMetric);
  persistMetrics();
}

/**
 * Complete task tracking and calculate final metrics
 */
export function completeTask(
  taskId: string,
  state: OracleState,
  retrievedSkillsCount: number = 0
): void {
  loadMetricsMemory();

  const metricIndex = inMemoryMetrics.findIndex((m) => m.taskId === taskId);
  if (metricIndex === -1) return;

  const m = inMemoryMetrics[metricIndex];

  const end = new Date();
  const start = new Date(m.startedAt);
  const durationMs = end.getTime() - start.getTime();

  const isRejected = state.reviewStatus === 'rejected';

  const subtasksFeitas = Object.values(state.results).filter((x) => {
    const res = x as { status?: string };
    return res && (res.status === 'success' || res.status === 'failed');
  }).length;

  inMemoryMetrics[metricIndex] = {
    ...m,
    completedAt: end.toISOString(),
    durationMs,
    status: isRejected ? 'failed' : 'completed',
    currentStage: state.currentStage ?? 'completed',
    reviewStatus: state.reviewStatus,
    iterationCount: state.iterationCount,
    subtasksTotal: state.subtasks.length,
    subtasksCompleted: subtasksFeitas,
    errorsCount: state.errors.length,
    skillsRetrieved: retrievedSkillsCount,
    skillSaved: state.reviewStatus === 'approved',
    stagesCompleted: {
      analyst: !!state.contextDocument,
      reviewer: !!state.executionBlueprint,
      executor: !!state.executedCode,
      synthesis: !!state.synthesisOutput,
    },
  };

  persistMetrics();
}

/**
 * Get raw metrics list
 */
export function getMetrics(): TaskMetrics[] {
  loadMetricsMemory();
  return inMemoryMetrics;
}

/**
 * Get processed analytics view for the Dashboard
 */
export function getSummary() {
  const metrics = getMetrics();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayMetrics = metrics.filter((m) => new Date(m.startedAt) >= todayStart);

  const totalTasks = todayMetrics.length;
  const completedTasks = todayMetrics.filter((m) => m.status === 'completed');
  const successRate = totalTasks > 0 ? completedTasks.length / totalTasks : 0;

  const validDurations = completedTasks
    .map((m) => m.durationMs || 0)
    .filter((d) => d > 0);
  const avgDurationMs =
    validDurations.length > 0
      ? validDurations.reduce((a, b) => a + b, 0) / validDurations.length
      : 0;

  const validIters = completedTasks.map((m) => m.iterationCount);
  const avgIterations =
    validIters.length > 0
      ? validIters.reduce((a, b) => a + b, 0) / validIters.length
      : 0;

  // Model usage tracking (updated for 4 agents)
  const modelUsageCount: Record<string, number> = {};
  todayMetrics.forEach((m) => {
    const roles = ['analyst', 'reviewer', 'executor', 'synthesis'] as const;
    roles.forEach((role) => {
      const modelStr = m.modelsUsed[role];
      if (!modelStr) return;
      let provider = modelStr.split('-')[0].toLowerCase();
      if (modelStr.includes('llama')) provider = 'meta';
      if (modelStr.includes('gpt')) provider = 'openai';
      if (modelStr.includes('claude')) provider = 'anthropic';

      modelUsageCount[provider] = (modelUsageCount[provider] || 0) + 1;
    });
  });

  // Pipeline stage completion stats
  const stageCompletionRates = {
    analyst: 0,
    reviewer: 0,
    executor: 0,
    synthesis: 0,
  };

  if (completedTasks.length > 0) {
    completedTasks.forEach((m) => {
      if (m.stagesCompleted?.analyst) stageCompletionRates.analyst++;
      if (m.stagesCompleted?.reviewer) stageCompletionRates.reviewer++;
      if (m.stagesCompleted?.executor) stageCompletionRates.executor++;
      if (m.stagesCompleted?.synthesis) stageCompletionRates.synthesis++;
    });

    const total = completedTasks.length;
    stageCompletionRates.analyst = Math.round((stageCompletionRates.analyst / total) * 100);
    stageCompletionRates.reviewer = Math.round((stageCompletionRates.reviewer / total) * 100);
    stageCompletionRates.executor = Math.round((stageCompletionRates.executor / total) * 100);
    stageCompletionRates.synthesis = Math.round((stageCompletionRates.synthesis / total) * 100);
  }

  return {
    totalTasks,
    successRate: Math.round(successRate * 100),
    avgDurationMs,
    avgIterations,
    modelUsageCount,
    stageCompletionRates,
    originalMetricsArr: todayMetrics,
  };
}
