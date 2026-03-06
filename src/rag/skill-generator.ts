/**
 * ORACLE-OS · Skill Generator
 *
 * Gera novas habilidades (skills) de forma inteligente a partir de tarefas
 * concluídas com sucesso, abstraindo padrões de solução reutilizáveis.
 *
 * Diferença em relação ao skill-manager.ts (que apenas salva):
 *  - Usa LLM para extrair padrões, tags e título semântico
 *  - Detecta duplicatas por similaridade antes de salvar
 *  - Calcula score de qualidade da skill gerada
 */
import { randomUUID } from 'crypto';
import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { createModel } from '../models/model-registry.js';
import { config } from '../config.js';
import { saveSkill, type Skill } from './skill-manager.js';
import { searchSimilarSkills } from './vector-store.js';
import { ragLogger } from '../monitoring/logger.js';
import type { OracleState } from '../state/oracle-state.js';

// ─── Schema de extração ───────────────────────────────────────────────────────
const SkillExtractionSchema = z.object({
  title:       z.string().describe('Título conciso e descritivo da skill (max 60 chars)'),
  description: z.string().describe('Descrição clara do que a skill resolve (max 200 chars)'),
  tags:        z.array(z.string()).describe('Tags relevantes para busca (max 8 tags)'),
  codePattern: z.string().optional().describe('Padrão de código ou solução extraído (se aplicável)'),
  qualityScore: z.number().min(0).max(1).describe('Score de qualidade da skill (0=baixa, 1=alta)'),
  isReusable:  z.boolean().describe('Indica se a skill é suficientemente genérica para reutilização'),
});

type SkillExtraction = z.infer<typeof SkillExtractionSchema>;

// ─── Similaridade mínima para considerar duplicata ───────────────────────────
const DUPLICATE_SIMILARITY_THRESHOLD = 0.92;

/**
 * Gera uma skill a partir do estado final de uma tarefa aprovada.
 * Retorna null se a skill não for suficientemente genérica ou for duplicata.
 */
export async function generateSkillFromTask(state: OracleState): Promise<Skill | null> {
  if (state.reviewStatus !== 'approved') {
    ragLogger.warn('Skill generation ignorada: tarefa não aprovada.');
    return null;
  }

  ragLogger.info('Iniciando geração de skill a partir da tarefa concluída.', {
    task: state.task.slice(0, 80),
  });

  try {
    const model = createModel({
      modelId: config.agents.executor.modelId, // modelo rápido para extração
      temperature: 0.2,
    });
    const structuredModel = model.withStructuredOutput(SkillExtractionSchema);

    const resultsJson = JSON.stringify(state.results, null, 2).slice(0, 3000);
    const subtasksSummary = state.subtasks
      .map((s) => `- ${s.title}: ${s.description}`)
      .join('\n');

    const prompt = `Você é um extrator de padrões de solução de software.
Analise a tarefa abaixo e os resultados produzidos pelos agentes.
Extraia uma "skill" reutilizável que capture o padrão de solução de forma genérica.

<tarefa_original>
${state.task}
</tarefa_original>

<subtasks_executadas>
${subtasksSummary}
</subtasks_executadas>

<resultados_parciais>
${resultsJson}
</resultados_parciais>

Retorne a skill extraída no formato JSON especificado.
Se a tarefa for muito específica e não gerar valor reutilizável, defina isReusable=false.`;

    const extraction: SkillExtraction = await structuredModel.invoke([
      new HumanMessage(prompt),
    ]);

    // Filtra skills de baixa qualidade ou não reutilizáveis
    if (!extraction.isReusable || extraction.qualityScore < 0.4) {
      ragLogger.info('Skill descartada: baixa qualidade ou não reutilizável.', {
        qualityScore: extraction.qualityScore,
        isReusable: extraction.isReusable,
      });
      return null;
    }

    // Verifica duplicatas por similaridade semântica
    const similar = await searchSimilarSkills(extraction.title + ' ' + extraction.description, 1);
    if (similar.length > 0) {
      const topScore = (similar[0] as any).score ?? 0;
      if (topScore >= DUPLICATE_SIMILARITY_THRESHOLD) {
        ragLogger.info('Skill descartada: duplicata detectada.', {
          similarSkill: (similar[0] as any).metadata?.title,
          score: topScore,
        });
        return null;
      }
    }

    // Constrói a skill final
    const skill: Skill = {
      id:           randomUUID(),
      title:        extraction.title,
      description:  extraction.description,
      tags:         extraction.tags.slice(0, 8),
      code:         extraction.codePattern,
      taskExample:  state.task,
      successRate:  extraction.qualityScore,
      usageCount:   0,
      createdAt:    new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
    };

    await saveSkill(skill);

    ragLogger.info('Nova skill gerada e salva com sucesso.', {
      id:    skill.id,
      title: skill.title,
      score: extraction.qualityScore,
    });

    return skill;
  } catch (err) {
    ragLogger.error('Falha na geração de skill.', { error: String(err) });
    return null;
  }
}
