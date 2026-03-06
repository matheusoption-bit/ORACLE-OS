/**
 * ORACLE-OS Models API — Quadripartite Architecture
 * Endpoint que o frontend chama para listar e trocar modelos em runtime
 * Supports 4 agents: analyst, reviewer, executor, synthesis
 */

import { Router, Request, Response } from 'express';
import {
  MODEL_CATALOG,
  getModelsByTier,
  getModelsByProvider,
  getModelById,
  ModelProvider,
} from '../models/model-registry';
import { config } from '../config';

const router = Router();

type QuadripartiteAgent = 'analyst' | 'reviewer' | 'executor' | 'synthesis';
const VALID_AGENTS: QuadripartiteAgent[] = ['analyst', 'reviewer', 'executor', 'synthesis'];

/**
 * GET /api/models
 * Lista todos os modelos disponíveis (para popular o seletor no frontend)
 */
router.get('/', (_req: Request, res: Response) => {
  const models = MODEL_CATALOG.map((m) => ({
    id: m.id,
    label: m.label,
    provider: m.provider,
    tier: m.tier,
    contextWindow: m.contextWindow,
    costPer1kTokens: m.costPer1kTokens,
    strengths: m.strengths,
    available: isProviderConfigured(m.provider),
  }));

  res.json({ models });
});

/**
 * GET /api/models/free
 * Lista apenas modelos gratuitos
 */
router.get('/free', (_req: Request, res: Response) => {
  res.json({ models: getModelsByTier('free') });
});

/**
 * GET /api/models/current
 * Retorna os modelos atualmente configurados por agente (Quadripartite)
 */
router.get('/current', (_req: Request, res: Response) => {
  res.json({
    analyst:   getModelById(config.agents.analyst.modelId),
    reviewer:  getModelById(config.agents.reviewer.modelId),
    executor:  getModelById(config.agents.executor.modelId),
    synthesis: getModelById(config.agents.synthesis.modelId),
    // Legacy alias
    planner:   getModelById(config.agents.analyst.modelId),
  });
});

/**
 * POST /api/models/switch
 * Troca o modelo em runtime (chamado pelo seletor do frontend)
 * Body: { agent: 'analyst' | 'reviewer' | 'executor' | 'synthesis' | 'all', modelId: string }
 */
router.post('/switch', (req: Request, res: Response) => {
  const { agent, modelId } = req.body;

  if (!config.ui.allowModelSwitching) {
    return res.status(403).json({ error: 'Model switching is disabled.' });
  }

  const model = getModelById(modelId);
  if (!model) {
    return res.status(400).json({ error: `Model "${modelId}" not found.` });
  }

  if (!isProviderConfigured(model.provider)) {
    return res.status(400).json({
      error: `API key for provider "${model.provider}" is not configured.`,
    });
  }

  // Atualiza em runtime
  if (agent === 'all') {
    config.agents.analyst.modelId = modelId;
    config.agents.reviewer.modelId = modelId;
    config.agents.executor.modelId = modelId;
    config.agents.synthesis.modelId = modelId;
    config.agents.planner.modelId = modelId; // legacy
  } else if (VALID_AGENTS.includes(agent as QuadripartiteAgent)) {
    config.agents[agent as QuadripartiteAgent].modelId = modelId;
    // Keep legacy planner in sync with analyst
    if (agent === 'analyst') {
      config.agents.planner.modelId = modelId;
    }
  } else if (agent === 'planner') {
    // Legacy support: 'planner' maps to 'analyst'
    config.agents.analyst.modelId = modelId;
    config.agents.planner.modelId = modelId;
  } else {
    return res.status(400).json({ error: `Invalid agent: ${agent}. Valid: ${VALID_AGENTS.join(', ')}` });
  }

  console.log(`[Models] Switched ${agent} → ${model.label}`);

  res.json({
    success: true,
    message: `${agent} now using ${model.label}`,
    current: {
      analyst:   config.agents.analyst,
      reviewer:  config.agents.reviewer,
      executor:  config.agents.executor,
      synthesis: config.agents.synthesis,
    },
  });
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function isProviderConfigured(provider: ModelProvider): boolean {
  const keys: Record<ModelProvider, string | undefined> = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    groq: process.env.GROQ_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
  };
  return !!keys[provider];
}

export default router;
