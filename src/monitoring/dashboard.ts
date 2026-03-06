import { getSummary } from './metrics.js';

// Usamos as próprias cores do logger para não duplicar consts
import { COLORS } from './logger.js';

function renderDashboard() {
  const data = getSummary();
  const tasks = data.originalMetricsArr;
  const lastTask = tasks.length > 0 ? tasks[tasks.length - 1] : null;

  console.clear();
  
  // Header
  console.log(`${COLORS.cyan}╔══════════════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.cyan}║${COLORS.reset}               ORACLE-OS Dashboard                ${COLORS.cyan}║${COLORS.reset}`);
  console.log(`${COLORS.cyan}╠══════════════════════════════════════════════════╣${COLORS.reset}`);
  
  // Status Stats
  console.log(`${COLORS.cyan}║${COLORS.reset} Tasks (1d): ${data.totalTasks.toString().padEnd(6)} │ Sucesso: ${(data.successRate + '%').padEnd(14)} ${COLORS.cyan}║${COLORS.reset}`);
  
  const avgDurSec = (data.avgDurationMs / 1000).toFixed(1) + 's';
  console.log(`${COLORS.cyan}║${COLORS.reset} Duração média: ${avgDurSec.padEnd(31)} ${COLORS.cyan}║${COLORS.reset}`);
  
  // Providers Box
  const pList = Object.entries(data.modelUsageCount)
    .map(([k, v]) => `${k} (${v})`)
    .join(' │ ');
  console.log(`${COLORS.cyan}║${COLORS.reset} Modelos: ${pList.padEnd(37)} ${COLORS.cyan}║${COLORS.reset}`);
  
  console.log(`${COLORS.cyan}╠══════════════════════════════════════════════════╣${COLORS.reset}`);
  console.log(`${COLORS.cyan}║${COLORS.reset} Última task:                                     ${COLORS.cyan}║${COLORS.reset}`);
  
  if (lastTask) {
    const icon = lastTask.status === 'completed' ? '✅' : (lastTask.status === 'failed' ? '❌' : '⏳');
    const taskNameTrunc = (lastTask.task.length > 30 ? lastTask.task.substring(0, 30) + '...' : lastTask.task);
    console.log(`${COLORS.cyan}║${COLORS.reset} "${taskNameTrunc}" ${icon}${''.padEnd(13 + (30 - taskNameTrunc.length))} ${COLORS.cyan}║${COLORS.reset}`);
    
    const details = `${lastTask.subtasksCompleted}/${lastTask.subtasksTotal} subtasks │ ${lastTask.iterationCount} iterações │ ${(lastTask.durationMs ? lastTask.durationMs / 1000 : 0).toFixed(1)}s`;
    console.log(`${COLORS.cyan}║${COLORS.reset} ${details.padEnd(47)} ${COLORS.cyan}║${COLORS.reset}`);
  } else {
    console.log(`${COLORS.cyan}║${COLORS.reset} (Nenhuma task rodou ainda)                       ${COLORS.cyan}║${COLORS.reset}`);
  }
  
  console.log(`${COLORS.cyan}╚══════════════════════════════════════════════════╝${COLORS.reset}`);
  console.log(`\n${COLORS.dim}Pressione Ctrl+C para sair. Atualizando a cada 3s...${COLORS.reset}`);
}

async function runDashboardLoop() {
  renderDashboard();
  
  setInterval(() => {
    try {
      renderDashboard();
    } catch(err) {
      console.error("Dashboard error:", err);
    }
  }, 3000);
}

runDashboardLoop();
