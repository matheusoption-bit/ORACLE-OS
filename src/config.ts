/**
 * ORACLE-OS Configuration
 * Central config for agents, tools, and runtime
 * Suporta múltiplos providers: Anthropic, Groq, Gemini
 */

import { DEFAULT_MODELS } from './models/model-registry';

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
