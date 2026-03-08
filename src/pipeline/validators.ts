/**
 * ORACLE-OS Pipeline Validators — Issue #10: State Contracts
 *
 * Provides input-validation wrappers that every pipeline stage MUST call
 * before processing its inputs.  Each validator uses the canonical Zod
 * schemas from `../state/schemas.ts` and returns a typed, validated value
 * or throws a descriptive `PipelineValidationError`.
 *
 * Design goals:
 *   1. Every stage validates its expected inputs before doing any work.
 *   2. Validation errors are distinguishable from runtime errors.
 *   3. Fallback / partial data is accepted with warnings (soft validation)
 *      so that the pipeline can degrade gracefully rather than crashing.
 */

import { z } from 'zod';
import {
  AnalystStateSchema,
  ExecutionBlueprintSchema,
  ExecutionResultSchema,
  SynthesisOutputSchema,
  SupervisorStateSchema,
  type AnalystState,
  type ExecutionBlueprint,
  type ExecutionResult,
  type SynthesisOutput,
  type SupervisorState,
} from '../state/schemas.js';

// ─── Custom error class ───────────────────────────────────────────────────────

export class PipelineValidationError extends Error {
  public readonly stage: string;
  public readonly zodError: z.ZodError;
  public readonly field?: string;

  constructor(stage: string, zodError: z.ZodError, field?: string) {
    const issues = zodError.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    super(`[${stage}] Input validation failed:\n${issues}`);
    this.name = 'PipelineValidationError';
    this.stage = stage;
    this.zodError = zodError;
    this.field = field;
    Object.setPrototypeOf(this, PipelineValidationError.prototype);
  }
}

// ─── Validation result type ───────────────────────────────────────────────────

export type ValidationResult<T> =
  | { valid: true; data: T; warnings: string[] }
  | { valid: false; error: PipelineValidationError; warnings: string[] };

// ─── Stage 1: Analyst input validator ────────────────────────────────────────

/**
 * Validates that the incoming state has a non-empty `task` string before
 * the Analyst node begins processing.
 *
 * @throws PipelineValidationError if `task` is missing or empty.
 */
export function validateAnalystInput(state: unknown): ValidationResult<{ task: string }> {
  const schema = z.object({ task: z.string().min(1, 'task cannot be empty') });
  const result = schema.safeParse(state);
  if (!result.success) {
    return {
      valid: false,
      error: new PipelineValidationError('Analyst', result.error, 'task'),
      warnings: [],
    };
  }
  return { valid: true, data: { task: result.data.task }, warnings: [] };
}

/**
 * Validates the Context Document produced by the Analyst node before it
 * is stored in state and forwarded to the Reviewer.
 *
 * @throws PipelineValidationError on hard schema violations.
 */
export function validateAnalystOutput(data: unknown): ValidationResult<AnalystState> {
  const warnings: string[] = [];
  const result = AnalystStateSchema.safeParse(data);

  if (!result.success) {
    return {
      valid: false,
      error: new PipelineValidationError('Analyst', result.error),
      warnings,
    };
  }

  // Soft warnings (non-blocking)
  if (result.data.requirements.length === 0) {
    warnings.push('[Analyst] No requirements identified — pipeline may produce low-quality output.');
  }
  if (result.data.initialRisks.length === 0) {
    warnings.push('[Analyst] No initial risks identified — consider a more thorough risk analysis.');
  }

  return { valid: true, data: result.data, warnings };
}

// ─── Stage 2: Reviewer input / output validators ──────────────────────────────

/**
 * Validates that the Reviewer has access to a valid Context Document before
 * starting its architectural review.
 *
 * @throws PipelineValidationError if contextDocument is null or malformed.
 */
export function validateReviewerInput(state: unknown): ValidationResult<{ contextDocument: AnalystState }> {
  const schema = z.object({
    contextDocument: AnalystStateSchema,
  });
  const result = schema.safeParse(state);
  if (!result.success) {
    return {
      valid: false,
      error: new PipelineValidationError('Reviewer', result.error, 'contextDocument'),
      warnings: [],
    };
  }
  return { valid: true, data: { contextDocument: result.data.contextDocument as AnalystState }, warnings: [] };
}

/**
 * Validates the Execution Blueprint produced by the Reviewer node.
 *
 * @throws PipelineValidationError on hard schema violations.
 */
export function validateReviewerOutput(data: unknown): ValidationResult<ExecutionBlueprint> {
  const warnings: string[] = [];
  const result = ExecutionBlueprintSchema.safeParse(data);

  if (!result.success) {
    return {
      valid: false,
      error: new PipelineValidationError('Reviewer', result.error),
      warnings,
    };
  }

  if (result.data.status === 'approved' && result.data.subtasks.length === 0) {
    warnings.push('[Reviewer] Blueprint approved with zero subtasks — Executor will have nothing to do.');
  }
  if (result.data.securityRisks.length > 0) {
    warnings.push(`[Reviewer] ${result.data.securityRisks.length} security risk(s) identified — review before proceeding.`);
  }

  return { valid: true, data: result.data, warnings };
}

// ─── Stage 3: Executor input / output validators ──────────────────────────────

/**
 * Validates that the Executor has a valid, approved blueprint and a non-empty
 * subtask list before it begins execution.
 *
 * @throws PipelineValidationError if executionBlueprint is missing or not approved.
 */
export function validateExecutorInput(state: unknown): ValidationResult<{
  executionBlueprint: ExecutionBlueprint;
}> {
  const schema = z.object({
    executionBlueprint: ExecutionBlueprintSchema.refine(
      (bp) => bp.status === 'approved',
      { message: 'Executor can only run an approved blueprint' }
    ),
  });

  const result = schema.safeParse(state);
  if (!result.success) {
    return {
      valid: false,
      error: new PipelineValidationError('Executor', result.error, 'executionBlueprint'),
      warnings: [],
    };
  }
  return { valid: true, data: { executionBlueprint: result.data.executionBlueprint as ExecutionBlueprint }, warnings: [] };
}

/**
 * Validates a single ExecutionResult produced for one subtask.
 */
export function validateExecutionResult(data: unknown): ValidationResult<ExecutionResult> {
  const warnings: string[] = [];
  const result = ExecutionResultSchema.safeParse(data);

  if (!result.success) {
    return {
      valid: false,
      error: new PipelineValidationError('Executor', result.error),
      warnings,
    };
  }

  if (result.data.status === 'failed') {
    warnings.push(`[Executor] Subtask ${result.data.subtaskId} failed — check executionErrors.`);
  }
  if ((result.data.selfCorrectionAttempts ?? 0) > 0) {
    warnings.push(`[Executor] Subtask ${result.data.subtaskId} required ${result.data.selfCorrectionAttempts} self-correction(s).`);
  }

  return { valid: true, data: result.data, warnings };
}

// ─── Stage 4: Synthesis input / output validators ─────────────────────────────

/**
 * Validates that the Synthesis node has access to the executed code output
 * before generating documentation.
 *
 * Uses a lenient check — executedCode may be null if the Executor was skipped
 * (e.g., after a force-approve with zero subtasks), in which case a warning
 * is emitted but validation still passes.
 */
export function validateSynthesisInput(state: unknown): ValidationResult<{ task: string }> {
  const schema = z.object({ task: z.string().min(1) });
  const warnings: string[] = [];

  const result = schema.safeParse(state);
  if (!result.success) {
    return {
      valid: false,
      error: new PipelineValidationError('Synthesis', result.error, 'task'),
      warnings,
    };
  }

  // Soft check: warn if executedCode is missing
  const stateObj = state as Record<string, unknown>;
  if (!stateObj.executedCode) {
    warnings.push('[Synthesis] executedCode is null — documentation will be based on partial data.');
  }

  return { valid: true, data: { task: result.data.task }, warnings };
}

/**
 * Validates the SynthesisOutput produced by the Synthesis node.
 */
export function validateSynthesisOutput(data: unknown): ValidationResult<SynthesisOutput> {
  const warnings: string[] = [];
  const result = SynthesisOutputSchema.safeParse(data);

  if (!result.success) {
    return {
      valid: false,
      error: new PipelineValidationError('Synthesis', result.error),
      warnings,
    };
  }

  if (result.data.qualityMetrics.testsPassRate < 50) {
    warnings.push(`[Synthesis] Low test pass rate: ${result.data.qualityMetrics.testsPassRate.toFixed(1)}%.`);
  }

  return { valid: true, data: result.data, warnings };
}

// ─── Full state validator ─────────────────────────────────────────────────────

/**
 * Validates the complete SupervisorState.  Used at pipeline entry points
 * (e.g., OracleBridge.runTask) to catch malformed inputs early.
 */
export function validatePipelineState(state: unknown): ValidationResult<SupervisorState> {
  const result = SupervisorStateSchema.safeParse(state);
  if (!result.success) {
    return {
      valid: false,
      error: new PipelineValidationError('Supervisor', result.error),
      warnings: [],
    };
  }
  return { valid: true, data: result.data, warnings: [] };
}
