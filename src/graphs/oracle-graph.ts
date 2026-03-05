/**
 * ORACLE-OS Main State Graph
 * Implements Planner → Executor → Reviewer workflow using LangGraph
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { OracleState } from '../state/oracle-state.js';
import { plannerAgent } from '../agents/planner.js';
import { executorAgent } from '../agents/executor.js';
import { reviewerAgent } from '../agents/reviewer.js';
import { OracleConfig } from '../config.js';

export function createOracleGraph(config: OracleConfig) {
  // Define state transitions
  const workflow = new StateGraph<OracleState>({
    channels: {
      task: null,
      subtasks: null,
      currentSubtask: null,
      results: null,
      errors: null,
      reviewStatus: null,
      iterationCount: null,
    },
  });

  // Add nodes
  // Sprint 2: plannerAgent agora é uma função LangGraph nativa — não precisa de wrapper
  workflow.addNode('planner', async (state: OracleState) => {
    console.log('🧠 Planner: Decompondo tarefa...');
    return plannerAgent(state);
  });

  workflow.addNode('executor', async (state: OracleState) => {
    const subtask = state.subtasks[state.currentSubtask];
    const label = subtask ? `${state.currentSubtask + 1}/${state.subtasks.length} — ${subtask.title}` : 'concluído';
    console.log(`⚙️  Executor: ${label}`);
    // Sprint 3: executorAgent é uma função LangGraph nativa com tool-calling loop
    return executorAgent(state);
  });

  workflow.addNode('reviewer', async (state: OracleState) => {
    console.log('✅ Reviewer: Validating outputs...');
    const review = await reviewerAgent.run(state, config);
    
    return {
      ...state,
      reviewStatus: review.status,
      errors: review.issues.filter(i => i.severity === 'critical'),
      iterationCount: state.iterationCount + 1,
    };
  });

  // Define edges
  workflow.addEdge(START, 'planner');
  
  workflow.addConditionalEdges(
    'planner',
    (state) => {
      if (state.subtasks.length === 0) return END;
      return 'executor';
    }
  );
  
  workflow.addConditionalEdges(
    'executor',
    (state) => {
      // If all subtasks complete, go to reviewer
      if (state.currentSubtask >= state.subtasks.length) {
        return 'reviewer';
      }
      // Otherwise, continue executing
      return 'executor';
    }
  );
  
  workflow.addConditionalEdges(
    'reviewer',
    (state) => {
      // If approved or max iterations reached, end
      if (state.reviewStatus === 'approved' || state.iterationCount >= 3) {
        return END;
      }
      // If rejected and iterations remain, retry execution
      return 'executor';
    }
  );

  return workflow.compile();
}
