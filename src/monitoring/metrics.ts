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
  reviewStatus: string;
  iterationCount: number;
  modelsUsed: { planner: string; executor: string; reviewer: string };
  subtasksTotal: number;
  subtasksCompleted: number;
  errorsCount: number;
  skillsRetrieved: number; // TODO: Precisaremos rastrear quantas skills o Planner usou na injeção RAG 
  skillSaved: boolean;
}

const MONITORING_DIR = resolve(process.cwd(), 'monitoring');
const METRICS_FILE = join(MONITORING_DIR, 'metrics.json');

// Memory DB ativo na sessão
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
 * Cadastra uma nova rodada de task no monitoramento
 */
export function startTask(taskId: string, task: string, state: OracleState): void {
  loadMetricsMemory();

  const newMetric: TaskMetrics = {
    taskId,
    task,
    startedAt: new Date().toISOString(),
    status: 'running',
    reviewStatus: state.reviewStatus,
    iterationCount: state.iterationCount,
    modelsUsed: {
      planner: config.agents.planner.modelId,
      executor: config.agents.executor.modelId,
      reviewer: config.agents.reviewer.modelId
    },
    subtasksTotal: state.subtasks.length || 0,
    subtasksCompleted: state.currentSubtask || 0,
    errorsCount: state.errors.length,
    skillsRetrieved: 0, 
    skillSaved: false
  };

  inMemoryMetrics.push(newMetric);
  persistMetrics();
}

/**
 * Fecha contabilidade da Task e calcula o TTL/Duração final
 */
export function completeTask(taskId: string, state: OracleState, retrievedSkillsCount: number = 0): void {
  loadMetricsMemory();

  const metricIndex = inMemoryMetrics.findIndex(m => m.taskId === taskId);
  if (metricIndex === -1) return;

  const m = inMemoryMetrics[metricIndex];
  
  const end = new Date();
  const start = new Date(m.startedAt);
  const durationMs = end.getTime() - start.getTime();
  
  const isRejected = state.reviewStatus === 'rejected';

  const subtasksFeitas = Object.values(state.results).filter(x => {
    const res = x as any;
    return res && (res.status === 'success' || res.status === 'failed');
  }).length;

  inMemoryMetrics[metricIndex] = {
    ...m,
    completedAt: end.toISOString(),
    durationMs,
    status: isRejected ? 'failed' : 'completed',
    reviewStatus: state.reviewStatus,
    iterationCount: state.iterationCount,
    subtasksTotal: state.subtasks.length,
    subtasksCompleted: subtasksFeitas,
    errorsCount: state.errors.length,
    skillsRetrieved: retrievedSkillsCount,
    skillSaved: state.reviewStatus === 'approved' // Foi salva pós reviewer
  };

  persistMetrics();
}

/**
 * Obtém raw metrics list
 */
export function getMetrics(): TaskMetrics[] {
  loadMetricsMemory();
  return inMemoryMetrics;
}

/**
 * Extrai view analítica processada para o Dashboard
 */
export function getSummary() {
  const metrics = getMetrics();
  
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayMetrics = metrics.filter(m => new Date(m.startedAt) >= todayStart);
  
  const totalTasks = todayMetrics.length;
  const completedTasks = todayMetrics.filter(m => m.status === 'completed');
  const successRate = totalTasks > 0 ? (completedTasks.length / totalTasks) : 0;
  
  const validDurations = completedTasks.map(m => m.durationMs || 0).filter(d => d > 0);
  const avgDurationMs = validDurations.length > 0
    ? validDurations.reduce((a, b) => a + b, 0) / validDurations.length
    : 0;

  const validIters = completedTasks.map(m => m.iterationCount);
  const avgIterations = validIters.length > 0 
    ? validIters.reduce((a,b) => a + b, 0) / validIters.length 
    : 0;

  // Calculo simples de "provider" ou model name, apenas consolidando por base names
  const modelUsageCount: Record<string, number> = {};
  todayMetrics.forEach(m => {
     ['planner', 'executor', 'reviewer'].forEach(role => {
        const modelStr = m.modelsUsed[role as keyof typeof m.modelsUsed];
        // Captura prefix antes do - (ex groq de groq-llama, ou gemini de gemini-1.5) simplificando visoes.
        let provider = modelStr.split('-')[0].toLowerCase();
        if (modelStr.includes('llama')) provider = 'meta'; 
        if (modelStr.includes('gpt')) provider = 'openai'; 
        if (modelStr.includes('claude')) provider = 'anthropic'; 
        
        modelUsageCount[provider] = (modelUsageCount[provider] || 0) + 1;
     });
  });

  return {
    totalTasks,
    successRate: Math.round(successRate * 100),
    avgDurationMs,
    avgIterations,
    modelUsageCount,
    originalMetricsArr: todayMetrics
  };
}
