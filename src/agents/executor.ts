/**
 * ORACLE-OS Executor Agent
 * Executes subtasks using MCP tools and E2B sandboxes
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { Subtask } from '../state/oracle-state';
import { OracleConfig } from '../config';
import { getToolsForAgent } from '../tools/tool-registry';

export const executorAgent = {
  async run(subtask: Subtask, config: OracleConfig) {
    const model = new ChatAnthropic({
      modelName: config.agents.executor.model,
      temperature: config.agents.executor.temperature,
    });

    // Get MCP tools available for this agent type
    const tools = getToolsForAgent(subtask.assignedAgent);
    const modelWithTools = model.bindTools(tools);

    const prompt = `You are a ${subtask.assignedAgent} agent in the ORACLE-OS system.

Execute this subtask:

<subtask>
${subtask.description}
</subtask>

<validation_criteria>
${subtask.validationCriteria}
</validation_criteria>

<available_tools>
${subtask.tools.join(', ')}
</available_tools>

<guidelines>
- Use MCP tools to read/write files, execute commands, query data
- Write production-quality code (types, error handling, tests)
- Log progress and any issues encountered
- Return structured output with files created/modified and validation results
</guidelines>

Execute the subtask and return detailed results.`;

    const response = await modelWithTools.invoke(prompt);

    // Parse tool calls and results
    const toolCalls = response.tool_calls || [];
    const logs: string[] = [];
    const files: string[] = [];

    for (const toolCall of toolCalls) {
      logs.push(`Tool: ${toolCall.name} | Args: ${JSON.stringify(toolCall.args)}`);
      
      // Track file operations
      if (toolCall.name.startsWith('file_')) {
        files.push(toolCall.args.path || 'unknown');
      }
    }

    return {
      subtaskId: subtask.id,
      output: response.content,
      toolCalls,
      logs,
      files,
      timestamp: new Date().toISOString(),
    };
  },
};
