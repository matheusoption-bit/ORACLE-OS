/**
 * ORACLE-OS Main State Graph
 * Implements Planner → Executor → Reviewer workflow using LangGraph
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { OracleState, Subtask } from '../state/oracle-state';
import { plannerAgent } from '../agents/planner';
import { executorAgent } from '../agents/executor';
import { reviewerAgent } from '../agents/reviewer';
import { OracleConfig } from '../config';

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
  workflow.addNode('planner', async (state: OracleState) => {
    console.log('🧠 Planner: Decomposing task...');
    const plan = await plannerAgent.run(state, config);
    return {
      ...state,
      subtasks: plan.subtasks,
      currentSubtask: 0,
    };
  });

  workflow.addNode('executor', async (state: OracleState) => {
    console.log(`⚙️  Executor: Running subtask ${state.currentSubtask + 1}/${state.subtasks.length}`);
    const subtask = state.subtasks[state.currentSubtask];
    const result = await executorAgent.run(subtask, config);
    
    const newResults = { ...state.results, [subtask.id]: result };
    const nextSubtask = state.currentSubtask + 1;
    
    return {
      ...state,
      results: newResults,
      currentSubtask: nextSubtask,
    };
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
