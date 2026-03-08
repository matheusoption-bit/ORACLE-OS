/**
 * ORACLE-OS State Schema — Quadripartite Architecture
 *
 * Defines the shared state passed between the 4 specialized agents:
 *   Analyst → Reviewer (Architect) → Executor → Synthesis
 *
 * Each stage produces a typed output document that flows into the next.
 * The state machine supports conditional routing with configurable iteration
 * guards (see src/pipeline/guards.ts).
 *
 * ── Backward Compatibility ────────────────────────────────────────────────────
 * All interfaces that existed before Issue #10 are preserved.  The canonical
 * Zod-validated types now live in `./schemas.ts`; this file re-exports them
 * under the original names so that existing imports continue to work without
 * modification.
 */

// ─── Re-export canonical types from schemas (Issue #10) ──────────────────────

export type {
  Subtask,
  AnalystState as ContextDocument,
  ExecutionBlueprint,
  ExecutionResult as ExecutorResult,
  ExecutedCode,
  TestResult,
  ExecutionError,
  SynthesisOutput,
  QualityMetrics,
  SupervisorState as OracleState,
} from './schemas.js';

export {
  SubtaskSchema,
  AnalystStateSchema as ContextDocumentSchema,
  ExecutionBlueprintSchema,
  ExecutionResultSchema as ExecutorResultSchema,
  ExecutedCodeSchema,
  SynthesisOutputSchema,
  SupervisorStateSchema as OracleStateSchema,
  validateAnalystState,
  validateExecutionBlueprint,
  validateExecutionResult,
  validateSynthesisOutput,
  validateSupervisorState,
  safeValidateSupervisorState,
} from './schemas.js';

// ─── Subtask Types (preserved from Sprint 10) ────────────────────────────────

export type SubtaskType = 'code' | 'file' | 'search' | 'review' | 'other';

// ─── Pipeline Stage Tracking ─────────────────────────────────────────────────

export type PipelineStage = 'analyst' | 'reviewer' | 'executor' | 'synthesis' | 'completed';

// ─── Factory ─────────────────────────────────────────────────────────────────

import type { SupervisorState } from './schemas.js';

/**
 * createInitialState — factory function that returns a valid initial
 * SupervisorState for a given task string.
 *
 * Preserved for backward compatibility; callers that previously imported
 * `createInitialState` from this module continue to work unchanged.
 */
export const createInitialState = (task: string): SupervisorState => ({
  task,
  currentStage: 'analyst',

  // Stage outputs
  contextDocument: null,
  executionBlueprint: null,
  executedCode: null,
  synthesisOutput: null,

  // Legacy fields
  subtasks: [],
  currentSubtask: 0,
  results: {},
  errors: [],
  reviewStatus: 'pending',
  iterationCount: 0,
  shortTermMemory: [],
});
