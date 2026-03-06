/**
 * ORACLE-OS Configuration — Quadripartite Architecture
 * Central config for the 4-stage pipeline: Analyst → Reviewer → Executor → Synthesis
 * Supports multiple providers: Anthropic, Groq, Gemini
 */

import { DEFAULT_MODELS } from './models/model-registry.js';

export interface AgentModelConfig {
  modelId: string;    // ID do MODEL_CATALOG
  temperature: number;
}

export interface OracleConfig {
  agents: {
    analyst: AgentModelConfig;
    reviewer: AgentModelConfig;
    executor: AgentModelConfig;
    synthesis: AgentModelConfig;
    /** @deprecated Mantido para retrocompatibilidade — use 'analyst' */
    planner: AgentModelConfig;
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
  ui: {
    allowModelSwitching: boolean;
    defaultUserModel: string;
  };
  /** Guardrails do pipeline quadripartite */
  pipeline: {
    /** Máximo de iterações Reviewer↔Analyst antes de forçar aprovação */
    maxReviewerAnalystIterations: number;
    /** Máximo de iterações Executor↔Reviewer antes de forçar continuação */
    maxExecutorRetries: number;
    /** Máximo de subtasks por blueprint */
    maxSubtasksPerBlueprint: number;
  };
}

export const MODEL_COSTS = {
  'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku':    { input: 0.00025, output: 0.00125 },
  'llama-3.3-70b':     { input: 0.00059, output: 0.00079 },
  'gemini-1.5-flash':  { input: 0.000075, output: 0.0003 },
};

export const ROUTING_STRATEGY = {
  'low':    'llama-3.3-70b',
  'medium': 'claude-3-haiku',
  'high':   'claude-3-5-sonnet',
};

export const config: OracleConfig = {
  agents: {
    // Quadripartite pipeline agents
    analyst:   { modelId: DEFAULT_MODELS.planner,  temperature: 0.5 },
    reviewer:  { modelId: DEFAULT_MODELS.reviewer,  temperature: 0.3 },
    executor:  { modelId: DEFAULT_MODELS.executor,  temperature: 0.2 },
    synthesis: { modelId: DEFAULT_MODELS.reviewer,  temperature: 0.4 },
    // Legacy alias
    planner:   { modelId: DEFAULT_MODELS.planner,  temperature: 0.7 },
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
  ui: {
    allowModelSwitching: true,
    defaultUserModel: 'llama-3.3-70b',
  },
  pipeline: {
    maxReviewerAnalystIterations: 3,
    maxExecutorRetries: 3,
    maxSubtasksPerBlueprint: 8,
  },
};
