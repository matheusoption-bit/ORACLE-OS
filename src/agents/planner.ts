/**
 * ORACLE-OS Planner Agent — DEPRECATED
 * 
 * @deprecated Use analystNode from analyst.ts instead.
 * This file is kept for backward compatibility only.
 * The Planner has been replaced by the Analyst in the Quadripartite Architecture.
 */

import { OracleState } from '../state/oracle-state.js';
import { analystNode } from './analyst.js';

/**
 * @deprecated Use analystNode instead.
 * Delegates to analystNode for backward compatibility.
 */
export async function plannerAgent(
  state: OracleState
): Promise<Partial<OracleState>> {
  console.warn('⚠️  plannerAgent is deprecated. Use analystNode instead.');
  return analystNode(state);
}

/**
 * @deprecated Use analystNode instead.
 */
export const plannerAgentLegacy = {
  async run(state: OracleState) {
    return plannerAgent(state);
  },
};
