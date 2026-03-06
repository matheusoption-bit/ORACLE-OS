/**
 * ORACLE-OS CLI Dashboard — Quadripartite Architecture
 * Displays real-time pipeline status for the 4-stage pipeline:
 * Analyst → Reviewer → Executor → Synthesis
 */

import { getSummary } from './metrics.js';
import { COLORS } from './logger.js';

function renderDashboard() {
  const data = getSummary();
  const tasks = data.originalMetricsArr;
  const lastTask = tasks.length > 0 ? tasks[tasks.length - 1] : null;

  console.clear();

  // Header
  console.log(`${COLORS.cyan}╔══════════════════════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.cyan}║${COLORS.reset}          ORACLE-OS Dashboard (Quadripartite)            ${COLORS.cyan}║${COLORS.reset}`);
  console.log(`${COLORS.cyan}║${COLORS.reset}     Analyst → Reviewer → Executor → Synthesis           ${COLORS.cyan}║${COLORS.reset}`);
  console.log(`${COLORS.cyan}╠══════════════════════════════════════════════════════════╣${COLORS.reset}`);

  // Status Stats
  console.log(`${COLORS.cyan}║${COLORS.reset} Tasks (1d): ${data.totalTasks.toString().padEnd(6)} │ Sucesso: ${(data.successRate + '%').padEnd(14)}   ${COLORS.cyan}║${COLORS.reset}`);

  const avgDurSec = (data.avgDurationMs / 1000).toFixed(1) + 's';
  console.log(`${COLORS.cyan}║${COLORS.reset} Duração média: ${avgDurSec.padEnd(39)} ${COLORS.cyan}║${COLORS.reset}`);

  // Providers Box
  const pList = Object.entries(data.modelUsageCount)
    .map(([k, v]) => `${k} (${v})`)
    .join(' │ ');
  console.log(`${COLORS.cyan}║${COLORS.reset} Modelos: ${pList.padEnd(45)} ${COLORS.cyan}║${COLORS.reset}`);

  // Pipeline Stage Completion
  console.log(`${COLORS.cyan}╠══════════════════════════════════════════════════════════╣${COLORS.reset}`);
  console.log(`${COLORS.cyan}║${COLORS.reset} Pipeline Stages (completion rate):                      ${COLORS.cyan}║${COLORS.reset}`);

  const stages = data.stageCompletionRates;
  const stageBar = (name: string, pct: number) => {
    const filled = Math.round(pct / 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
    return `${name.padEnd(10)} ${bar} ${pct}%`;
  };

  console.log(`${COLORS.cyan}║${COLORS.reset}   ${stageBar('Analyst', stages.analyst).padEnd(53)} ${COLORS.cyan}║${COLORS.reset}`);
  console.log(`${COLORS.cyan}║${COLORS.reset}   ${stageBar('Reviewer', stages.reviewer).padEnd(53)} ${COLORS.cyan}║${COLORS.reset}`);
  console.log(`${COLORS.cyan}║${COLORS.reset}   ${stageBar('Executor', stages.executor).padEnd(53)} ${COLORS.cyan}║${COLORS.reset}`);
  console.log(`${COLORS.cyan}║${COLORS.reset}   ${stageBar('Synthesis', stages.synthesis).padEnd(53)} ${COLORS.cyan}║${COLORS.reset}`);

  // Last Task
  console.log(`${COLORS.cyan}╠══════════════════════════════════════════════════════════╣${COLORS.reset}`);
  console.log(`${COLORS.cyan}║${COLORS.reset} Última task:                                             ${COLORS.cyan}║${COLORS.reset}`);

  if (lastTask) {
    const icon =
      lastTask.status === 'completed'
        ? '✅'
        : lastTask.status === 'failed'
        ? '❌'
        : '⏳';
    const taskNameTrunc =
      lastTask.task.length > 35
        ? lastTask.task.substring(0, 35) + '...'
        : lastTask.task;
    console.log(`${COLORS.cyan}║${COLORS.reset} "${taskNameTrunc}" ${icon}${''.padEnd(15 + (35 - taskNameTrunc.length))} ${COLORS.cyan}║${COLORS.reset}`);

    const stageIcon = (completed: boolean) => (completed ? '✅' : '⬜');
    const stageStatus = lastTask.stagesCompleted
      ? `A${stageIcon(lastTask.stagesCompleted.analyst)} R${stageIcon(lastTask.stagesCompleted.reviewer)} E${stageIcon(lastTask.stagesCompleted.executor)} S${stageIcon(lastTask.stagesCompleted.synthesis)}`
      : 'N/A';

    const details = `${lastTask.subtasksCompleted}/${lastTask.subtasksTotal} subtasks │ ${lastTask.iterationCount} iter │ ${stageStatus}`;
    console.log(`${COLORS.cyan}║${COLORS.reset} ${details.padEnd(55)} ${COLORS.cyan}║${COLORS.reset}`);

    const durStr = lastTask.durationMs
      ? `${(lastTask.durationMs / 1000).toFixed(1)}s`
      : 'running...';
    console.log(`${COLORS.cyan}║${COLORS.reset} Stage: ${(lastTask.currentStage ?? 'unknown').padEnd(12)} │ Duration: ${durStr.padEnd(25)} ${COLORS.cyan}║${COLORS.reset}`);
  } else {
    console.log(`${COLORS.cyan}║${COLORS.reset} (Nenhuma task rodou ainda)                               ${COLORS.cyan}║${COLORS.reset}`);
  }

  console.log(`${COLORS.cyan}╚══════════════════════════════════════════════════════════╝${COLORS.reset}`);
  console.log(
    `\n${COLORS.dim}Pressione Ctrl+C para sair. Atualizando a cada 3s...${COLORS.reset}`
  );
}

async function runDashboardLoop() {
  renderDashboard();

  setInterval(() => {
    try {
      renderDashboard();
    } catch (err) {
      console.error('Dashboard error:', err);
    }
  }, 3000);
}

runDashboardLoop();
