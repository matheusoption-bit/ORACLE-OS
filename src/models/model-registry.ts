/**
 * ORACLE-OS Model Registry
 * Multi-provider factory: Anthropic, Groq, Gemini
 * Allows runtime model switching from the frontend
 */

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGroq } from '@langchain/groq';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai'; // usado para OpenRouter

// ─── Model Catalog ────────────────────────────────────────────────────────────

export type ModelProvider = 'anthropic' | 'groq' | 'gemini' | 'openrouter';

export interface ModelOption {
  id: string;           // identificador interno
  provider: ModelProvider;
  modelName: string;    // nome exato na API do provider
  label: string;        // nome amigável para o frontend
  contextWindow: number;
  costPer1kTokens: number; // 0 = gratuito
  tier: 'free' | 'paid';
  strengths: string[];
}

export const MODEL_CATALOG: ModelOption[] = [
  // ── Anthropic ──────────────────────────────────────────────────────────────
  {
    id: 'claude-3-5-sonnet',
    provider: 'anthropic',
    modelName: 'claude-3-5-sonnet-20241022',
    label: 'Claude 3.5 Sonnet',
    contextWindow: 200000,
    costPer1kTokens: 0.003,
    tier: 'paid',
    strengths: ['coding', 'reasoning', 'long-context'],
  },
  {
    id: 'claude-3-5-haiku',
    provider: 'anthropic',
    modelName: 'claude-3-5-haiku-20241022',
    label: 'Claude 3.5 Haiku',
    contextWindow: 200000,
    costPer1kTokens: 0.0008,
    tier: 'paid',
    strengths: ['fast', 'cheap', 'coding'],
  },

  // ── Groq (gratuito) ────────────────────────────────────────────────────────
  {
    id: 'llama-3.3-70b',
    provider: 'groq',
    modelName: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B (Groq)',
    contextWindow: 128000,
    costPer1kTokens: 0,
    tier: 'free',
    strengths: ['fast', 'coding', 'instructions'],
  },
  {
    id: 'llama-3.1-8b-groq',
    provider: 'groq',
    modelName: 'llama-3.1-8b-instant',
    label: 'Llama 3.1 8B Instant (Groq)',
    contextWindow: 128000,
    costPer1kTokens: 0,
    tier: 'free',
    strengths: ['ultra-fast', 'simple-tasks'],
  },
  {
    id: 'mixtral-8x7b',
    provider: 'groq',
    modelName: 'mixtral-8x7b-32768',
    label: 'Mixtral 8x7B (Groq)',
    contextWindow: 32768,
    costPer1kTokens: 0,
    tier: 'free',
    strengths: ['multilingual', 'reasoning'],
  },

  // ── Google Gemini ──────────────────────────────────────────────────────────
  {
    id: 'gemini-2.0-flash',
    provider: 'gemini',
    modelName: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    contextWindow: 1048576,
    costPer1kTokens: 0,
    tier: 'free',
    strengths: ['multimodal', 'long-context', 'fast'],
  },
  {
    id: 'gemini-1.5-pro',
    provider: 'gemini',
    modelName: 'gemini-1.5-pro',
    label: 'Gemini 1.5 Pro',
    contextWindow: 2097152,
    costPer1kTokens: 0,
    tier: 'free',
    strengths: ['huge-context', 'multimodal', 'reasoning'],
  },
];

// ─── Model Factory ────────────────────────────────────────────────────────────

export interface CreateModelOptions {
  modelId: string;
  temperature?: number;
  streaming?: boolean;
}

export function createModel(options: CreateModelOptions): BaseChatModel {
  const { modelId, temperature = 0.3, streaming = false } = options;

  const model = MODEL_CATALOG.find((m) => m.id === modelId);
  if (!model) {
    throw new Error(
      `Model "${modelId}" not found. Available: ${MODEL_CATALOG.map((m) => m.id).join(', ')}`
    );
  }

  switch (model.provider) {
    case 'anthropic':
      return new ChatAnthropic({
        model: model.modelName,
        temperature,
        streaming,
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

    case 'groq':
      return new ChatGroq({
        model: model.modelName,
        temperature,
        streaming,
        apiKey: process.env.GROQ_API_KEY,
      });

    case 'gemini':
      return new ChatGoogleGenerativeAI({
        model: model.modelName,
        temperature,
        streaming,
        apiKey: process.env.GEMINI_API_KEY,
      });

    case 'openrouter':
      return new ChatOpenAI({
        model: model.modelName,
        temperature,
        streaming,
        openAIApiKey: process.env.OPENROUTER_API_KEY,
        configuration: {
          baseURL: 'https://openrouter.ai/api/v1',
        },
      });

    default:
      throw new Error(`Provider "${model.provider}" not implemented.`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getModelsByTier(tier: 'free' | 'paid'): ModelOption[] {
  return MODEL_CATALOG.filter((m) => m.tier === tier);
}

export function getModelsByProvider(provider: ModelProvider): ModelOption[] {
  return MODEL_CATALOG.filter((m) => m.provider === provider);
}

export function getModelById(id: string): ModelOption | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

// Default models por papel
export const DEFAULT_MODELS = {
  planner: 'llama-3.3-70b',       // fallback devido à restrição do anthropic
  executor: 'llama-3.3-70b',      // rápido e gratuito
  reviewer: 'gemini-2.0-flash',   // gratuito e capaz
  fallback: 'llama-3.3-70b',      // se nenhum funcionar
};
