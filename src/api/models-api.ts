/**
 * ORACLE-OS Models API
 * Endpoint que o frontend chama para listar e trocar modelos em runtime
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
    // Indica se a API key está configurada
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
 * Retorna os modelos atualmente configurados por agente
 */
router.get('/current', (_req: Request, res: Response) => {
  res.json({
    planner: getModelById(config.agents.planner.modelId),
    executor: getModelById(config.agents.executor.modelId),
    reviewer: getModelById(config.agents.reviewer.modelId),
  });
});

/**
 * POST /api/models/switch
 * Troca o modelo em runtime (chamado pelo seletor do frontend)
 * Body: { agent: 'planner' | 'executor' | 'reviewer' | 'all', modelId: string }
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
    config.agents.planner.modelId = modelId;
    config.agents.executor.modelId = modelId;
    config.agents.reviewer.modelId = modelId;
  } else if (['planner', 'executor', 'reviewer'].includes(agent)) {
    config.agents[agent as 'planner' | 'executor' | 'reviewer'].modelId = modelId;
  } else {
    return res.status(400).json({ error: `Invalid agent: ${agent}` });
  }

  console.log(`[Models] Switched ${agent} → ${model.label}`);

  res.json({
    success: true,
    message: `${agent} now using ${model.label}`,
    current: config.agents,
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
