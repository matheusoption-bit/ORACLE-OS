/**
 * ORACLE-OS Planner Agent — Legacy Compatibility Layer
 *
 * The Quadripartite architecture replaced the Planner with the Analyst,
 * but we keep a thin compatibility layer for older tests and integrations.
 * It validates subtask contracts (Zod) and delegates LLM planning using
 * the legacy schema expected by the Sprint 2 tests.
 */

import { z } from 'zod';
import { HumanMessage } from '@langchain/core/messages';
import { createModel, DEFAULT_MODELS } from '../models/model-registry.js';
import { config } from '../config.js';
import { OracleState } from '../state/oracle-state.js';

// ─── Zod Schemas (legacy) ────────────────────────────────────────────────────

export const SubtaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  type: z.enum(['code', 'file', 'search', 'review', 'other']),
  priority: z.number().min(1).max(5),
  dependsOn: z.array(z.string()).default([]),
  assignedAgent: z.enum(['frontend', 'backend', 'devops', 'data', 'security', 'geral']).default('geral'),
  dependencies: z.array(z.string()).default([]),
  estimatedDuration: z.number().default(15),
  tools: z.array(z.string()).default([]),
  validationCriteria: z.string().default(''),
});

export const PlanSchema = z.object({
  subtasks: z.array(SubtaskSchema).default([]),
  executionPlan: z.enum(['sequential', 'parallel', 'mixed']).default('sequential'),
});

// ─── Helper ──────────────────────────────────────────────────────────────────

const getPlannerModelConfig = () =>
  config?.agents?.planner ?? config?.agents?.analyst ?? {
    modelId: DEFAULT_MODELS.planner,
    temperature: 0.5,
  };

// ─── Planner Agent (legacy) ──────────────────────────────────────────────────

/**
 * @deprecated Use analystNode instead. This implementation exists to keep
 * legacy tests stable while the Analyst is the canonical entrypoint.
 */
export async function plannerAgent(
  state: OracleState
): Promise<Partial<OracleState>> {
  console.warn('⚠️  plannerAgent is deprecated. Use analystNode instead.');

  const modelConfig = getPlannerModelConfig();
  const model = createModel({
    modelId: modelConfig.modelId,
    temperature: modelConfig.temperature,
  });

  const structuredModel = model.withStructuredOutput(PlanSchema);

  const prompt = `Decompose the following task into executable subtasks with ids, titles, priorities (1-5), dependsOn, tools and validationCriteria. Return a JSON plan.

<task>
${state.task}
</task>`;

  try {
    const plan = await structuredModel.invoke([new HumanMessage(prompt)]);

    const mappedSubtasks = (plan.subtasks ?? []).map((s) => ({
      ...s,
      dependsOn: s.dependsOn ?? [],
      dependencies: s.dependencies ?? s.dependsOn ?? [],
    }));

    return {
      subtasks: mappedSubtasks,
      currentSubtask: 0, // reset for new plan
      reviewStatus: 'pending',
      iterationCount: state.iterationCount + 0, // keep current iteration
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('❌ plannerAgent falhou ao gerar plano:', err.message);

    const fallbackSubtask = {
      id: 'fallback-1',
      title: state.task.substring(0, 60),
      description: state.task,
      type: 'code' as const,
      priority: 1,
      dependsOn: [],
      assignedAgent: 'geral' as const,
      dependencies: [],
      estimatedDuration: 30,
      tools: ['file_write'],
      validationCriteria: 'Task executed without critical errors',
    };

    return {
      subtasks: [fallbackSubtask],
      currentSubtask: 0,
      reviewStatus: 'pending',
      errors: [...(state.errors ?? []), err],
    };
  }
}

/**
 * @deprecated Use analystNode instead.
 */
export const plannerAgentLegacy = {
  async run(state: OracleState) {
    return plannerAgent(state);
  },
};
