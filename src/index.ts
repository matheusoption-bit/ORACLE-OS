/**
 * ORACLE-OS Entry Point
 * Main orchestration hub for multi-agent system
 */

import { createOracleGraph } from './graphs/oracle-graph';
import { config } from './config';

async function main() {
  console.log('🚀 Initializing ORACLE-OS...');
  
  const graph = createOracleGraph(config);
  
  console.log('✅ ORACLE-OS ready');
  console.log('📊 Agents loaded:', Object.keys(graph.nodes).length);
}

if (require.main === module) {
  main().catch(console.error);
}

export { main };
