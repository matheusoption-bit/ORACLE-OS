/**
 * ORACLE-OS Planner Agent
 * Decomposes tasks into executable subtasks
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { z } from 'zod';
import { OracleState, Subtask } from '../state/oracle-state';
import { OracleConfig } from '../config';

const SubtaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  assignedAgent: z.enum(['frontend', 'backend', 'devops', 'data', 'security']),
  dependencies: z.array(z.string()),
  estimatedDuration: z.number(),
  tools: z.array(z.string()),
  validationCriteria: z.string(),
});

const PlanSchema = z.object({
  subtasks: z.array(SubtaskSchema),
  executionPlan: z.enum(['sequential', 'parallel', 'mixed']),
});

export const plannerAgent = {
  async run(state: OracleState, config: OracleConfig) {
    const model = new ChatAnthropic({
      modelName: config.agents.planner.model,
      temperature: config.agents.planner.temperature,
    });

    const structuredModel = model.withStructuredOutput(PlanSchema);

    const prompt = `You are a senior technical architect in the ORACLE-OS system.

Decompose this task into atomic, testable subtasks:

<task>
${state.task}
</task>

<guidelines>
- Each subtask should be completable in <30 minutes
- Assign to the most appropriate agent (frontend, backend, devops, data, security)
- Specify MCP tools needed (file_*, shell_*, github_*, browser_*, db_*)
- Define clear validation criteria
- Consider dependencies between subtasks
</guidelines>

<available_tools>
- file_read, file_write, file_list
- shell_exec, shell_npm, shell_git
- github_create_pr, github_list_issues
- browser_navigate, browser_click, browser_screenshot
- db_query, db_insert
</available_tools>

Output a structured plan with subtasks and execution strategy.`;

    const result = await structuredModel.invoke(prompt);

    return result;
  },
};
