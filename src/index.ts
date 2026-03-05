/**
 * ORACLE-OS Entry Point
 * Main orchestration hub for multi-agent system
 */

import 'dotenv/config';
import { createOracleGraph } from './graphs/oracle-graph.js';
import { config } from './config.js';

async function main() {
  console.log('\n🚀 Initializing ORACLE-OS...');
  console.log('🧠 Planner  :', config.agents.planner.modelId);
  console.log('⚙️  Executor :', config.agents.executor.modelId);
  console.log('✅ Reviewer :', config.agents.reviewer.modelId);

  const graph = createOracleGraph(config);

  console.log('\n🟢 ORACLE-OS ready! Waiting for tasks...');
  console.log('   Press Ctrl+C to stop.\n');

  // Exemplo de task para testar
  const testMode = process.env.TEST_TASK;
  if (testMode) {
    console.log(`🧪 Running test task: "${testMode}"`);
    const result = await graph.invoke({
      task: testMode,
      subtasks: [],
      currentSubtask: 0,
      results: {},
      errors: [],
      reviewStatus: 'pending',
      iterationCount: 0,
    });
    console.log('\n🏁 Result:', result.reviewStatus);
  }
}

// ESM-compatible entry point (substitui require.main === module)
main().catch((err) => {
  console.error('\n❌ ORACLE-OS failed to start:', err.message);
  process.exit(1);
});

export { main };
