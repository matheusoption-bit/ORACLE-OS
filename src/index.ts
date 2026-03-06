/**
 * ORACLE-OS Entry Point — Quadripartite Architecture
 * CLI interativo: aceita task via argv ou readline
 * Pipeline: Analyst → Reviewer (Architect) → Executor → Synthesis
 */

import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { createOracleGraph } from './graphs/oracle-graph.js';
import { config } from './config.js';
import { createInitialState, OracleState } from './state/oracle-state.js';

// ─── Banner ───────────────────────────────────────────────────────────────────

function printBanner(): void {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║            ORACLE-OS  v0.2.0                     ║');
  console.log('║   Quadripartite Multi-Agent Dev Platform          ║');
  console.log('║   Analyst → Reviewer → Executor → Synthesis       ║');
  console.log('╚══════════════════════════════════════════════════╝\n');
  console.log(`🔬 Analyst   : ${config.agents.analyst.modelId}`);
  console.log(`🏗️  Reviewer  : ${config.agents.reviewer.modelId}`);
  console.log(`⚙️  Executor  : ${config.agents.executor.modelId}`);
  console.log(`📝 Synthesis : ${config.agents.synthesis.modelId}`);
  console.log(`\n🔄 Max Reviewer↔Analyst iterations: ${config.pipeline.maxReviewerAnalystIterations}`);
  console.log(`📦 Max subtasks per blueprint: ${config.pipeline.maxSubtasksPerBlueprint}\n`);
}

// ─── Mostra resultado final ───────────────────────────────────────────────────

function printResult(state: OracleState): void {
  const statusIcon: Record<string, string> = {
    approved: '✅',
    rejected: '❌',
    needs_revision: '🔄',
    pending: '⏳',
  };

  const icon = statusIcon[state.reviewStatus] ?? '❓';
  console.log('\n══════════════════════════════════════════════════════');
  console.log(`${icon} STATUS FINAL: ${state.reviewStatus.toUpperCase()}`);
  console.log('══════════════════════════════════════════════════════');

  // Pipeline Stage Summary
  console.log('\n📊 Pipeline Quadripartite:');
  console.log(`  🔬 Analyst   : ${state.contextDocument ? '✅ Concluído' : '⬜ Não executado'}`);
  console.log(`  🏗️  Reviewer  : ${state.executionBlueprint ? '✅ Concluído' : '⬜ Não executado'}`);
  console.log(`  ⚙️  Executor  : ${state.executedCode ? '✅ Concluído' : '⬜ Não executado'}`);
  console.log(`  📝 Synthesis : ${state.synthesisOutput ? '✅ Concluído' : '⬜ Não executado'}`);

  // Context Document Summary
  if (state.contextDocument) {
    console.log(`\n🔬 Context Document:`);
    console.log(`  Resumo: ${state.contextDocument.taskSummary}`);
    console.log(`  Complexidade: ${state.contextDocument.complexityLevel}`);
    console.log(`  Requisitos: ${state.contextDocument.requirements.length}`);
    console.log(`  Arquivos relevantes: ${state.contextDocument.relevantFiles.length}`);
  }

  // Execution Blueprint Summary
  if (state.executionBlueprint) {
    console.log(`\n🏗️  Execution Blueprint:`);
    console.log(`  Status: ${state.executionBlueprint.status}`);
    console.log(`  Subtasks: ${state.executionBlueprint.subtasks.length}`);
    console.log(`  Plano: ${state.executionBlueprint.executionPlan}`);
    if (state.executionBlueprint.securityRisks.length > 0) {
      console.log(`  ⚠️  Riscos de segurança: ${state.executionBlueprint.securityRisks.length}`);
    }
  }

  // Subtask Results
  if (state.subtasks.length > 0) {
    console.log(`\n📋 Subtasks executadas: ${state.subtasks.length}`);
    for (const subtask of state.subtasks) {
      const result = state.results[subtask.id] as { status?: string } | undefined;
      const resultIcon = result?.status === 'success' ? '✅'
        : result?.status === 'partial' ? '⚠️'
        : result?.status === 'failed' ? '❌'
        : '⏳';
      console.log(`  ${resultIcon} [${subtask.id}] ${subtask.title} (${subtask.assignedAgent})`);
    }
  }

  // Synthesis Output
  if (state.synthesisOutput) {
    console.log(`\n📝 Synthesis Output:`);
    console.log(`  ${state.synthesisOutput.executiveSummary.substring(0, 200)}...`);
    console.log(`\n  Commit Messages:`);
    for (const msg of state.synthesisOutput.commitMessages) {
      console.log(`    • ${msg}`);
    }
    console.log(`\n  Métricas de Qualidade:`);
    const qm = state.synthesisOutput.qualityMetrics;
    console.log(`    Subtasks: ${qm.subtasksCompleted}/${qm.subtasksTotal}`);
    console.log(`    Taxa de testes: ${qm.testsPassRate.toFixed(1)}%`);
    console.log(`    Auto-correções: ${qm.selfCorrections}`);
  }

  // Errors
  if (state.errors.length > 0) {
    console.log(`\n⚠️  Erros capturados: ${state.errors.length}`);
    for (const err of state.errors) {
      console.log(`  • ${err.message}`);
    }
  }

  // Revision Notes
  if (state.revisionNotes) {
    console.log(`\n📝 Notas de revisão: ${state.revisionNotes}`);
  }

  console.log(`\n🔁 Iterações Reviewer↔Analyst: ${state.iterationCount}`);
  console.log(`🧠 Short-term memory entries: ${state.shortTermMemory.length}`);
  console.log('══════════════════════════════════════════════════════\n');
}

// ─── Executa uma task ─────────────────────────────────────────────────────────

async function runTask(task: string): Promise<void> {
  console.log(`\n🚀 Task recebida: "${task}"\n`);
  console.log('🔬 Iniciando pipeline Quadripartite...\n');

  const graph = createOracleGraph();
  const initialState = createInitialState(task);

  const finalState = await graph.invoke(initialState) as OracleState;
  printResult(finalState);
}

// ─── Modo interativo via readline ─────────────────────────────────────────────

async function runInteractive(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('🟢 ORACLE-OS pronto! Digite sua tarefa abaixo.');
  console.log('   Pipeline: Analyst → Reviewer → Executor → Synthesis');
  console.log('   (Ctrl+C para sair)\n');

  try {
    while (true) {
      const task = await rl.question('📥 Task: ');
      if (!task.trim()) continue;
      if (task.toLowerCase() === 'exit' || task.toLowerCase() === 'quit') break;
      await runTask(task.trim());
    }
  } finally {
    rl.close();
    console.log('\n👋 ORACLE-OS encerrado.\n');
  }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  printBanner();

  // Modo via argumento de linha de comando: npm run dev -- "minha task"
  const argTask = process.argv[2];
  if (argTask) {
    await runTask(argTask);
    return;
  }

  // Fallback: modo interativo via readline
  await runInteractive();
}

main().catch((err) => {
  console.error('\n❌ ORACLE-OS falhou:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});

export { main, runTask };
