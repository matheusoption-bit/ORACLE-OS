/**
 * ORACLE-OS Tool Registry
 * Maps agent types to available MCP/E2B tools
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

// Tool type definitions (these will be replaced with actual MCP tool imports)
type AgentType = 'frontend' | 'backend' | 'devops' | 'data' | 'security';

// Mock tool implementations (replace with actual MCP tools in production)
const createMockTool = (name: string, description: string) => {
  return new DynamicStructuredTool({
    name,
    description,
    schema: z.object({
      input: z.string().describe('Tool input'),
    }),
    func: async ({ input }) => {
      console.log(`[${name}] Executed with: ${input}`);
      return `Mock result from ${name}`;
    },
  });
};

// Tool registry by agent type
const toolRegistry: Record<AgentType, DynamicStructuredTool[]> = {
  frontend: [
    createMockTool('file_read', 'Read file contents'),
    createMockTool('file_write', 'Write file contents'),
    createMockTool('shell_npm', 'Run npm commands'),
    createMockTool('browser_screenshot', 'Take screenshot of webpage'),
  ],
  backend: [
    createMockTool('file_read', 'Read file contents'),
    createMockTool('file_write', 'Write file contents'),
    createMockTool('shell_exec', 'Execute shell command'),
    createMockTool('db_query', 'Query database'),
  ],
  devops: [
    createMockTool('file_write', 'Write file contents'),
    createMockTool('shell_git', 'Run git commands'),
    createMockTool('github_create_pr', 'Create pull request'),
    createMockTool('shell_exec', 'Execute shell command'),
  ],
  data: [
    createMockTool('db_query', 'Query database'),
    createMockTool('file_read', 'Read file contents'),
    createMockTool('file_write', 'Write file contents'),
  ],
  security: [
    createMockTool('file_read', 'Read file contents'),
    createMockTool('shell_exec', 'Execute shell command'),
  ],
};

export function getToolsForAgent(agentType: AgentType): DynamicStructuredTool[] {
  return toolRegistry[agentType] || [];
}

export { toolRegistry };
