/**
 * ORACLE-OS Configuration
 * Central config for agents, tools, and runtime
 * Suporta múltiplos providers: Anthropic, Groq, Gemini
 */

import { DEFAULT_MODELS } from './models/model-registry.js';

export interface AgentModelConfig {
  modelId: string;    // ID do MODEL_CATALOG
  temperature: number;
}

export interface OracleConfig {
  agents: {
    planner: AgentModelConfig;
    executor: AgentModelConfig;
    reviewer: AgentModelConfig;
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
    allowModelSwitching: boolean; // habilita seletor no frontend
    defaultUserModel: string;     // modelo padrão na UI
  };
}

export const MODEL_COSTS = {
  'claude-3-5-sonnet': { input: 0.003, output: 0.015 },  // por 1K tokens
  'claude-3-haiku':    { input: 0.00025, output: 0.00125 },
  'llama-3.3-70b':     { input: 0.00059, output: 0.00079 },
  'gemini-1.5-flash':  { input: 0.000075, output: 0.0003 },
};

export const ROUTING_STRATEGY = {
  'low':    'llama-3.3-70b',   // tasks simples → modelo barato
  'medium': 'claude-3-haiku',  // tasks médias → equilibrado
  'high':   'claude-3-5-sonnet' // tasks complexas → melhor modelo
};

export const config: OracleConfig = {
  agents: {
    // Estratégia híbrida: usa o melhor modelo disponível por papel
    // Planner: raciocínio complexo → Claude (pago) ou Llama (grátis)
    planner: { modelId: DEFAULT_MODELS.planner, temperature: 0.7 },
    // Executor: velocidade e volume → Groq (grátis)
    executor: { modelId: DEFAULT_MODELS.executor, temperature: 0.2 },
    // Reviewer: validação → Gemini Flash (grátis)
    reviewer: { modelId: DEFAULT_MODELS.reviewer, temperature: 0.3 },
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
    defaultUserModel: 'llama-3.3-70b', // grátis como padrão
  },
};
