/**
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
