/**
 * ORACLE-OS Entry Point — Sprint 4
 * CLI interativo: aceita task via argv ou readline
 */

import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { createOracleGraph } from './graphs/oracle-graph.js';
import { config } from './config.js';
import { createInitialState, OracleState } from './state/oracle-state.js';

// ─── Banner ───────────────────────────────────────────────────────────────────

function printBanner(): void {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║         ORACLE-OS  v0.1.0            ║');
  console.log('║  Multi-Agent Agentic Dev Platform    ║');
  console.log('╚══════════════════════════════════════╝\n');
  console.log(`🧠 Planner  : ${config.agents.planner.modelId}`);
  console.log(`⚙️  Executor : ${config.agents.executor.modelId}`);
  console.log(`✅ Reviewer : ${config.agents.reviewer.modelId}\n`);
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
  console.log('\n══════════════════════════════════════════');
  console.log(`${icon} STATUS FINAL: ${state.reviewStatus.toUpperCase()}`);
  console.log('══════════════════════════════════════════');

  if (state.revisionNotes) {
    console.log(`\n📝 Notas: ${state.revisionNotes}`);
  }

  if (state.subtasks.length > 0) {
    console.log(`\n📋 Subtasks executadas: ${state.subtasks.length}`);
    for (const subtask of state.subtasks) {
      const result = state.results[subtask.id] as { status?: string } | undefined;
      const resultIcon = result?.status === 'success' ? '✅'
        : result?.status === 'partial' ? '⚠️'
        : result?.status === 'failed' ? '❌'
        : '⏳';
      console.log(`  ${resultIcon} [${subtask.id}] ${subtask.title}`);
    }
  }

  if (state.errors.length > 0) {
    console.log(`\n⚠️  Erros capturados: ${state.errors.length}`);
    for (const err of state.errors) {
      console.log(`  • ${err.message}`);
    }
  }

  console.log(`\n🔁 Iterações: ${state.iterationCount}`);
  console.log('══════════════════════════════════════════\n');
}

// ─── Executa uma task ─────────────────────────────────────────────────────────

async function runTask(task: string): Promise<void> {
  console.log(`\n🚀 Task recebida: "${task}"\n`);

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
