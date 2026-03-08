/**
 * ORACLE-OS State Schemas — Issue #10: State Contracts
 *
 * Defines strongly-typed, runtime-validated Zod schemas for every data
 * structure that flows through the Quadripartite pipeline:
 *
 *   SupervisorState  — top-level pipeline envelope
 *   AnalystState     — output of Stage 1 (Context Document)
 *   ReviewerState    — output of Stage 2 (Execution Blueprint)
 *   ExecutionBlueprint — approved plan with decomposed subtasks
 *   ExecutionResult  — per-subtask execution result
 *   SynthesisOutput  — final documentation and metrics
 *
 * Every schema is exported both as a Zod validator and as a TypeScript type
 * so that callers can use `parse()` / `safeParse()` for runtime validation
 * and the inferred types for static type-checking.
 *
 * Backward compatibility: the existing interfaces in oracle-state.ts are
 * preserved; these schemas are the authoritative source of truth and the
 * interfaces are re-derived from them via `z.infer<>`.
 */

import { z } from 'zod';

// ─── Primitive / shared schemas ───────────────────────────────────────────────

export const SubtaskTypeSchema = z.enum(['code', 'file', 'search', 'review', 'other']);

export const AssignedAgentSchema = z.enum([
  'frontend',
  'backend',
  'devops',
  'data',
  'security',
  'geral',
]);

export const ComplexityLevelSchema = z.enum(['low', 'medium', 'high']);

export const PipelineStageSchema = z.enum([
  'analyst',
  'reviewer',
  'executor',
  'synthesis',
  'completed',
]);

export const ReviewStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'needs_revision',
]);

// ─── Subtask Schema ───────────────────────────────────────────────────────────

export const SubtaskSchema = z.object({
  id: z.string().min(1, 'Subtask id cannot be empty'),
  title: z.string().min(1, 'Subtask title cannot be empty'),
  description: z.string(),
  type: SubtaskTypeSchema,
  priority: z.number().int().min(1).max(5),
  dependsOn: z.array(z.string()).default([]),
  assignedAgent: AssignedAgentSchema.default('geral'),
  /** Alias kept for backward compatibility with executor/reviewer */
  dependencies: z.array(z.string()).default([]),
  estimatedDuration: z.number().nonnegative().default(15),
  tools: z.array(z.string()).default([]),
  validationCriteria: z.string().default(''),
});

export type Subtask = z.infer<typeof SubtaskSchema>;

// ─── Stage 1: AnalystState ────────────────────────────────────────────────────

/**
 * AnalystState — validated output produced by the Analyst node.
 * Corresponds to the "Context Document" that flows into the Reviewer.
 */
export const AnalystStateSchema = z.object({
  taskSummary: z.string().min(1, 'taskSummary cannot be empty'),
  ragContext: z.string().default(''),
  requirements: z.array(z.string()).min(1, 'At least one requirement must be identified'),
  relevantFiles: z.array(z.string()).default([]),
  complexityLevel: ComplexityLevelSchema,
  externalDependencies: z.array(z.string()).default([]),
  initialRisks: z.array(z.string()).default([]),
  timestamp: z.string().datetime({ offset: true }).or(z.string().min(1)),
});

export type AnalystState = z.infer<typeof AnalystStateSchema>;

// ─── Stage 2: ReviewerState & ExecutionBlueprint ──────────────────────────────

/**
 * ExecutionBlueprint — the approved plan produced by the Reviewer node.
 * Contains decomposed subtasks and architectural decisions.
 */
export const ExecutionBlueprintSchema = z.object({
  status: z.enum(['approved', 'rejected', 'needs_revision']),
  subtasks: z.array(SubtaskSchema).default([]),
  executionPlan: z.enum(['sequential', 'parallel', 'mixed']).default('sequential'),
  architecturalNotes: z.string().default(''),
  securityRisks: z.array(z.string()).default([]),
  redundanciesFound: z.array(z.string()).default([]),
  feedbackToAnalyst: z.string().optional(),
  timestamp: z.string().min(1),
});

export type ExecutionBlueprint = z.infer<typeof ExecutionBlueprintSchema>;

/**
 * ReviewerState — full state snapshot produced by the Reviewer node.
 * Wraps the ExecutionBlueprint with pipeline routing metadata.
 */
export const ReviewerStateSchema = z.object({
  executionBlueprint: ExecutionBlueprintSchema,
  reviewStatus: ReviewStatusSchema,
  revisionNotes: z.string().optional(),
  iterationCount: z.number().int().nonnegative(),
});

export type ReviewerState = z.infer<typeof ReviewerStateSchema>;

// ─── Stage 3: ExecutionResult ─────────────────────────────────────────────────

export const ParsedTagsSchema = z.object({
  thinking: z.string().optional(),
  writes: z.array(
    z.object({
      content: z.string(),
      path: z.string().optional(),
    })
  ).default([]),
  deletes: z.array(
    z.object({
      content: z.string(),
      path: z.string().optional(),
    })
  ).default([]),
  success: z.string().optional(),
  error: z.string().optional(),
});

export type ParsedTags = z.infer<typeof ParsedTagsSchema>;

/**
 * ExecutionResult — the result of executing a single subtask.
 * Produced by the Executor node for each subtask in the blueprint.
 */
export const ExecutionResultSchema = z.object({
  subtaskId: z.string().min(1),
  status: z.enum(['success', 'partial', 'failed']),
  output: z.string(),
  toolCallsExecuted: z.array(z.string()).default([]),
  filesModified: z.array(z.string()).default([]),
  timestamp: z.string().min(1),
  parsedTags: ParsedTagsSchema.optional(),
  selfCorrectionAttempts: z.number().int().nonnegative().optional(),
});

export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

export const TestResultSchema = z.object({
  testFile: z.string(),
  passed: z.boolean(),
  output: z.string(),
  duration: z.number().nonnegative().optional(),
});

export type TestResult = z.infer<typeof TestResultSchema>;

export const ExecutionErrorSchema = z.object({
  subtaskId: z.string(),
  error: z.string(),
  recoverable: z.boolean(),
  attemptCount: z.number().int().nonnegative(),
});

export type ExecutionError = z.infer<typeof ExecutionErrorSchema>;

export const ExecutedCodeSchema = z.object({
  results: z.record(z.string(), ExecutionResultSchema),
  allFilesModified: z.array(z.string()).default([]),
  testResults: z.array(TestResultSchema).default([]),
  packagesInstalled: z.array(z.string()).default([]),
  executionErrors: z.array(ExecutionErrorSchema).default([]),
  timestamp: z.string().min(1),
});

export type ExecutedCode = z.infer<typeof ExecutedCodeSchema>;

// ─── Stage 4: SynthesisOutput ─────────────────────────────────────────────────

export const QualityMetricsSchema = z.object({
  subtasksCompleted: z.number().int().nonnegative(),
  subtasksTotal: z.number().int().nonnegative(),
  testsPassRate: z.number().min(0).max(100),
  selfCorrections: z.number().int().nonnegative(),
});

export type QualityMetrics = z.infer<typeof QualityMetricsSchema>;

/**
 * SynthesisOutput — final documentation and metrics produced by the Synthesis node.
 */
export const SynthesisOutputSchema = z.object({
  executiveSummary: z.string().min(1, 'executiveSummary cannot be empty'),
  commitMessages: z.array(z.string()).min(1, 'At least one commit message is required'),
  changelogEntries: z.array(z.string()).default([]),
  readmeUpdates: z.string().default(''),
  finalFiles: z.array(
    z.object({
      path: z.string(),
      description: z.string(),
    })
  ).default([]),
  qualityMetrics: QualityMetricsSchema,
  timestamp: z.string().min(1),
});

export type SynthesisOutput = z.infer<typeof SynthesisOutputSchema>;

// ─── Top-level: SupervisorState ───────────────────────────────────────────────

/**
 * SupervisorState — the complete shared state envelope passed between all
 * pipeline nodes. This is the single source of truth for the LangGraph
 * StateGraph channels.
 *
 * Validation is intentionally lenient for optional stage outputs (they start
 * as `null` and are populated progressively), but required fields are strict.
 */
export const SupervisorStateSchema = z.object({
  // ── Required core fields ──────────────────────────────────────────────────
  task: z.string().min(1, 'task cannot be empty'),
  currentStage: PipelineStageSchema,

  // ── Stage outputs (nullable until each stage runs) ────────────────────────
  contextDocument: AnalystStateSchema.nullable().default(null),
  executionBlueprint: ExecutionBlueprintSchema.nullable().default(null),
  executedCode: ExecutedCodeSchema.nullable().default(null),
  synthesisOutput: SynthesisOutputSchema.nullable().default(null),

  // ── Legacy / compatibility fields ─────────────────────────────────────────
  subtasks: z.array(SubtaskSchema).default([]),
  currentSubtask: z.number().int().nonnegative().default(0),
  results: z.record(z.string(), z.unknown()).default({}),
  errors: z.array(z.instanceof(Error)).or(z.array(z.unknown())).default([]),
  reviewStatus: ReviewStatusSchema.default('pending'),
  revisionNotes: z.string().optional(),

  // ── Iteration tracking ────────────────────────────────────────────────────
  iterationCount: z.number().int().nonnegative().default(0),
  shortTermMemory: z.array(z.string()).default([]),
});

export type SupervisorState = z.infer<typeof SupervisorStateSchema>;

// ─── Validation helpers ───────────────────────────────────────────────────────

/**
 * Validates an AnalystState object at runtime.
 * Throws a ZodError with descriptive messages if validation fails.
 */
export function validateAnalystState(data: unknown): AnalystState {
  return AnalystStateSchema.parse(data);
}

/**
 * Validates an ExecutionBlueprint object at runtime.
 */
export function validateExecutionBlueprint(data: unknown): ExecutionBlueprint {
  return ExecutionBlueprintSchema.parse(data);
}

/**
 * Validates an ExecutionResult object at runtime.
 */
export function validateExecutionResult(data: unknown): ExecutionResult {
  return ExecutionResultSchema.parse(data);
}

/**
 * Validates a SynthesisOutput object at runtime.
 */
export function validateSynthesisOutput(data: unknown): SynthesisOutput {
  return SynthesisOutputSchema.parse(data);
}

/**
 * Validates the full SupervisorState at runtime.
 */
export function validateSupervisorState(data: unknown): SupervisorState {
  return SupervisorStateSchema.parse(data);
}

/**
 * Safe (non-throwing) variant of validateSupervisorState.
 * Returns `{ success: true, data }` or `{ success: false, error }`.
 */
export function safeValidateSupervisorState(
  data: unknown
): { success: true; data: SupervisorState } | { success: false; error: z.ZodError } {
  const result = SupervisorStateSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
