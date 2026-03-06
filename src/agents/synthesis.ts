/**
 * ORACLE-OS Synthesis Node — Quadripartite Architecture
 * 
 * Stage 4: Documentation & Integration
 * 
 * Cleans up the Executor's output, writes semantic commit messages,
 * updates the README.md or changelog, and formats the final output for the user.
 * 
 * This node NEVER writes code — only documents, formats, and integrates.
 */

import { z } from 'zod';
import { HumanMessage } from '@langchain/core/messages';
import { createModel } from '../models/model-registry.js';
import { config } from '../config.js';
import {
  OracleState,
  SynthesisOutput,
} from '../state/oracle-state.js';
import { SYNTHESIS_SYSTEM_PROMPT } from '../prompts/synthesis.prompt.js';
import { saveTaskAsSkill } from '../rag/rag-pipeline.js';
import { generateSkillFromTask } from '../rag/skill-generator.js';
import { startTask, completeTask } from '../monitoring/metrics.js';
import { systemLogger } from '../monitoring/logger.js';
import { CostTracker } from '../monitoring/cost-tracker.js';

// ─── Singleton CostTracker ──────────────────────────────────────────────────

const costTracker = new CostTracker();
export { costTracker };

// ─── Helper: estimate tokens from string length ─────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── Zod Schema for Synthesis Output ────────────────────────────────────────

const SynthesisSchema = z.object({
  executiveSummary: z.string().describe('Resumo executivo do que foi feito'),
  commitMessages: z.array(z.string()).describe('Mensagens de commit semânticas'),
  changelogEntries: z.array(z.string()).describe('Entradas de changelog'),
  readmeUpdates: z.string().default('').describe('Atualizações sugeridas para o README'),
  finalFiles: z.array(z.object({
    path: z.string(),
    description: z.string(),
  })).default([]).describe('Arquivos finais com descrições'),
});

export type SynthesisSchemaOutput = z.infer<typeof SynthesisSchema>;

// ─── Synthesis Node — LangGraph Node Function ───────────────────────────────

/**
 * synthesisNode — Nó LangGraph (Stage 4)
 * 
 * Recebe o ExecutedCode do Executor, documenta tudo, gera commit messages,
 * atualiza changelog, e formata a saída final para o usuário.
 * Também salva a skill no RAG e registra métricas.
 */
export async function synthesisNode(
  state: OracleState
): Promise<Partial<OracleState>> {
  systemLogger.info('📝 [Synthesis] Iniciando documentação e integração final...');

  const model = createModel({
    modelId: config.agents.synthesis.modelId,
    temperature: config.agents.synthesis.temperature,
  });

  const structuredModel = model.withStructuredOutput(SynthesisSchema);

  // Preparar contexto completo para síntese
  const contextDocStr = state.contextDocument
    ? JSON.stringify(state.contextDocument, null, 2)
    : '(não disponível)';

  const blueprintStr = state.executionBlueprint
    ? JSON.stringify({
        status: state.executionBlueprint.status,
        subtasksCount: state.executionBlueprint.subtasks.length,
        executionPlan: state.executionBlueprint.executionPlan,
        architecturalNotes: state.executionBlueprint.architecturalNotes,
      }, null, 2)
    : '(não disponível)';

  const executedCodeStr = state.executedCode
    ? JSON.stringify({
        resultsCount: Object.keys(state.executedCode.results).length,
        filesModified: state.executedCode.allFilesModified,
        testResults: state.executedCode.testResults,
        errors: state.executedCode.executionErrors,
      }, null, 2)
    : '(não disponível)';

  const resultsStr = JSON.stringify(state.results, null, 2);

  // Memória de curto prazo
  const memoryBlock = (state.shortTermMemory ?? []).length > 0
    ? `\n<short_term_memory>\nHistórico completo do pipeline:\n${state.shortTermMemory.map((m, i) => `[${i + 1}] ${m}`).join('\n')}\n</short_term_memory>\n`
    : '';

  // Calcular métricas de qualidade
  const totalSubtasks = state.subtasks.length;
  const completedSubtasks = Object.values(state.results).filter((r: any) =>
    r && (r.status === 'success' || r.status === 'partial')
  ).length;
  const failedSubtasks = Object.values(state.results).filter((r: any) =>
    r && r.status === 'failed'
  ).length;
  const totalSelfCorrections = Object.values(state.results).reduce((acc: number, r: any) =>
    acc + (r?.selfCorrectionAttempts ?? 0), 0
  );

  const userPrompt = `${SYNTHESIS_SYSTEM_PROMPT}

<tarefa_original>
${state.task}
</tarefa_original>

<context_document>
${contextDocStr}
</context_document>

<execution_blueprint>
${blueprintStr}
</execution_blueprint>

<executed_code>
${executedCodeStr}
</executed_code>

<resultados_detalhados>
${resultsStr}
</resultados_detalhados>
${memoryBlock}
<metricas>
Subtasks totais: ${totalSubtasks}
Subtasks completadas: ${completedSubtasks}
Subtasks falharam: ${failedSubtasks}
Auto-correções: ${totalSelfCorrections}
Iterações do pipeline: ${state.iterationCount}
</metricas>

Gere a documentação final completa: resumo executivo, commit messages semânticas,
changelog entries, e sugestões de atualização do README.
Retorne o JSON estruturado.`;

  try {
    const result = await structuredModel.invoke([new HumanMessage(userPrompt)]);

    // Track token usage
    const inputTokens = estimateTokens(userPrompt);
    const outputTokens = estimateTokens(JSON.stringify(result));
    const taskId = 'current';
    costTracker.track(taskId, 'synthesis', {
      input: inputTokens,
      output: outputTokens,
      model: config.agents.synthesis.modelId,
    });

    const synthesisOutput: SynthesisOutput = {
      executiveSummary: result.executiveSummary,
      commitMessages: result.commitMessages,
      changelogEntries: result.changelogEntries,
      readmeUpdates: result.readmeUpdates,
      finalFiles: result.finalFiles,
      qualityMetrics: {
        subtasksCompleted: completedSubtasks,
        subtasksTotal: totalSubtasks,
        testsPassRate: totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0,
        selfCorrections: totalSelfCorrections,
      },
      timestamp: new Date().toISOString(),
    };

    // ── Save skill to RAG ───────────────────────────────────────────────
    try {
      await saveTaskAsSkill(state);
      const generatedSkill = await generateSkillFromTask(state);
      if (generatedSkill) {
        systemLogger.info(`🧠 Nova skill gerada: "${generatedSkill.title}" (id=${generatedSkill.id})`, {
          skillId: generatedSkill.id,
          tags: generatedSkill.tags,
          score: generatedSkill.successRate,
        });
      }
    } catch (skillErr) {
      systemLogger.warn('Falha na geração de skill (não crítico).', {
        error: String(skillErr),
      });
    }

    // ── Log final cost report ───────────────────────────────────────────
    try {
      const report = costTracker.getTaskReport(taskId);
      const comparison = costTracker.compareWithEstimate(taskId);
      systemLogger.info('🎉 Pipeline Quadripartite completado!', {
        totalCostUSD: report.totalCostUSD.toFixed(6),
        tokens: {
          analyst: report.analyst?.tokens ?? 0,
          reviewer: report.reviewer?.tokens ?? 0,
          executor: report.executor?.tokens ?? 0,
          synthesis: report.synthesis?.tokens ?? 0,
        },
        estimateEfficiency: comparison.efficiency.toFixed(1) + '%',
      });
    } catch {
      // Cost tracking may not have all data, non-critical
    }

    // ── Complete task metrics ────────────────────────────────────────────
    const metricsId = Math.random().toString(36).substr(2, 9);
    completeTask(metricsId, state);

    // Memória de curto prazo
    const memoryEntry = `[Synthesis] Pipeline completo. ` +
      `${completedSubtasks}/${totalSubtasks} subtasks OK. ` +
      `${result.commitMessages.length} commits gerados. ` +
      `Resumo: ${result.executiveSummary.substring(0, 150)}`;

    systemLogger.info(`📝 [Synthesis] Documentação gerada — ${result.commitMessages.length} commits, ${result.changelogEntries.length} changelog entries.`);

    return {
      synthesisOutput,
      currentStage: 'completed',
      shortTermMemory: [...(state.shortTermMemory ?? []), memoryEntry],
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('❌ [Synthesis] Falha na síntese:', error.message);

    // Fallback: gera síntese mínima
    const fallbackSynthesis: SynthesisOutput = {
      executiveSummary: `Task "${state.task}" executada com ${completedSubtasks}/${totalSubtasks} subtasks completadas. Síntese automática falhou: ${error.message}`,
      commitMessages: [`chore: execute task - ${state.task.substring(0, 50)}`],
      changelogEntries: [`- Executada task: ${state.task.substring(0, 80)}`],
      readmeUpdates: '',
      finalFiles: [],
      qualityMetrics: {
        subtasksCompleted: completedSubtasks,
        subtasksTotal: totalSubtasks,
        testsPassRate: totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0,
        selfCorrections: totalSelfCorrections,
      },
      timestamp: new Date().toISOString(),
    };

    const metricsId = Math.random().toString(36).substr(2, 9);
    completeTask(metricsId, state);

    const memoryEntry = `[Synthesis] FALLBACK — Síntese falhou: ${error.message}. Documentação mínima gerada.`;

    return {
      synthesisOutput: fallbackSynthesis,
      currentStage: 'completed',
      errors: [...(state.errors ?? []), error],
      shortTermMemory: [...(state.shortTermMemory ?? []), memoryEntry],
    };
  }
}
