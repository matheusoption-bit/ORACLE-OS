#!/usr/bin/env node
/**
 * ORACLE-OS Bootstrap Script
 * 
 * Executes automated project setup based on ORACLE_KNOWLEDGE_BASE.md
 * Run this in Antigravity IDE after cloning the repository.
 * 
 * Usage:
 *   node bootstrap/oracle-os-bootstrap.js
 */

const fs = require('fs');
const path = require('path');

const directories = [
  'src',
  'src/agents',
  'src/tools',
  'src/state',
  'src/graphs',
  'workspace',
  'workspace/projects',
  'workspace/memory',
  'skills',
  'skills/frontend',
  'skills/backend',
  'skills/rag',
  'rag',
  'rag/embeddings',
  'rag/vector-store',
  'monitoring',
  'monitoring/logs',
  'monitoring/metrics',
  'prompts',
  'prompts/agents',
  'prompts/tools',
  'config',
  'tests',
  'tests/unit',
  'tests/integration',
  'docs',
  'docs/architecture',
  'docs/api',
];

const files = {
  'src/index.ts': `/**
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
`,
  'src/config.ts': `/**
 * ORACLE-OS Configuration
 * Central config for agents, tools, and runtime
 */

export interface OracleConfig {
  agents: {
    planner: { model: string; temperature: number };
    executor: { model: string; temperature: number };
    reviewer: { model: string; temperature: number };
  };
  tools: {
    mcp: { enabled: boolean; servers: string[] };
    e2b: { enabled: boolean; sandboxes: string[] };
  };
  rag: {
    enabled: boolean;
    embeddingModel: string;
    vectorStore: string;
  };
  monitoring: {
    enabled: boolean;
    logLevel: string;
  };
}

export const config: OracleConfig = {
  agents: {
    planner: { model: 'anthropic/claude-3-7-sonnet', temperature: 0.7 },
    executor: { model: 'anthropic/claude-3-7-sonnet', temperature: 0.2 },
    reviewer: { model: 'anthropic/claude-3-7-sonnet', temperature: 0.3 },
  },
  tools: {
    mcp: { enabled: true, servers: ['github', 'filesystem', 'browser'] },
    e2b: { enabled: true, sandboxes: ['node', 'python'] },
  },
  rag: {
    enabled: true,
    embeddingModel: 'text-embedding-3-large',
    vectorStore: 'chromadb',
  },
  monitoring: {
    enabled: true,
    logLevel: 'info',
  },
};
`,
  'package.json': `{
  "name": "oracle-os",
  "version": "0.1.0",
  "description": "Manus-inspired agentic dev OS for private MVP",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "bootstrap": "node bootstrap/oracle-os-bootstrap.js",
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest",
    "lint": "eslint src/**/*.ts",
    "format": "prettier --write src/**/*.ts"
  },
  "keywords": ["agents", "ai", "langgraph", "mcp", "e2b"],
  "author": "Matheus Petry",
  "license": "MIT",
  "dependencies": {
    "@langchain/anthropic": "^0.3.0",
    "@langchain/core": "^0.3.0",
    "@langchain/langgraph": "^0.2.0",
    "zod": "^3.23.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
`,
  'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
`
};

console.log('🔧 ORACLE-OS Bootstrap Starting...');
console.log('');

// Create directories
console.log('📁 Creating directory structure...');
directories.forEach(dir => {
  const fullPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`  ✓ ${dir}`);
  }
});

console.log('');
console.log('📄 Creating core files...');

// Create files
Object.entries(files).forEach(([filePath, content]) => {
  const fullPath = path.join(process.cwd(), filePath);
  const dir = path.dirname(fullPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`  ✓ ${filePath}`);
});

console.log('');
console.log('✅ Bootstrap complete!');
console.log('');
console.log('Next steps:');
console.log('  1. npm install');
console.log('  2. Copy .env.example to .env and configure');
console.log('  3. npm run dev');
console.log('');
