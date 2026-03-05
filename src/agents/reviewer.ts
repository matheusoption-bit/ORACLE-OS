/**
 * ORACLE-OS Reviewer Agent
 * Validates outputs and determines if iteration is needed
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { z } from 'zod';
import { OracleState } from '../state/oracle-state';
import { OracleConfig } from '../config';

const IssueSchema = z.object({
  severity: z.enum(['critical', 'major', 'minor']),
  description: z.string(),
  suggestedFix: z.string(),
});

const ReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  issues: z.array(IssueSchema),
  nextAction: z.enum(['complete', 'iterate', 'escalate']),
  summary: z.string(),
});

export const reviewerAgent = {
  async run(state: OracleState, config: OracleConfig) {
    const model = new ChatAnthropic({
      modelName: config.agents.reviewer.model,
      temperature: config.agents.reviewer.temperature,
    });

    const structuredModel = model.withStructuredOutput(ReviewSchema);

    const resultsJson = JSON.stringify(state.results, null, 2);

    const prompt = `You are a senior code reviewer in the ORACLE-OS system.

Evaluate this work:

<original_task>
${state.task}
</original_task>

<subtask_results>
${resultsJson}
</subtask_results>

<validation_criteria>
- All subtasks completed successfully
- Outputs meet task requirements
- Code quality: proper types, error handling, no hardcoded secrets
- Security: no vulnerabilities, safe dependencies
- Tests: validation criteria satisfied
</validation_criteria>

<iteration_count>
${state.iterationCount} / 3 attempts
</iteration_count>

Provide a structured review with:
- Status: approved (ready to ship) or rejected (needs fixes)
- Issues: list critical/major/minor problems
- Next action: complete, iterate (fix issues), or escalate (manual intervention needed)
- Summary: brief explanation of decision`;

    const result = await structuredModel.invoke(prompt);

    return result;
  },
};
