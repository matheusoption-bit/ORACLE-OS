/**
 * ORACLE-OS Pipeline Guards — Issue #11: Iteration Guards
 *
 * Provides configurable safeguards that prevent infinite loops at every
 * boundary of the Quadripartite pipeline:
 *
 *   • ReviewerAnalystGuard  — caps the Reviewer ↔ Analyst back-and-forth
 *   • ExecutorRetryGuard    — caps per-subtask retry attempts
 *   • ToolCallLoopGuard     — caps the tool-calling loop inside runToolLoop
 *   • SwarmDelegationGuard  — caps recursive agent delegation depth
 *
 * Each guard is a pure function that receives the current counter and the
 * configured limit, and returns a typed decision object so callers can
 * branch without duplicating limit-checking logic.
 *
 * All limits are read from `PipelineGuardConfig` which is merged with
 * `DEFAULT_GUARD_CONFIG` at construction time, making every threshold
 * overridable via environment variables or the central config object.
 */

import { z } from 'zod';

// ─── Guard Configuration Schema ───────────────────────────────────────────────

export const PipelineGuardConfigSchema = z.object({
  /**
   * Maximum number of Reviewer ↔ Analyst cycles before the pipeline
   * forces approval and proceeds to the Executor.
   * @default 3
   */
  maxReviewerAnalystIterations: z.number().int().positive().default(3),

  /**
   * Maximum number of times the Executor will retry a failed subtask
   * before marking it as permanently failed and moving on.
   * @default 3
   */
  maxExecutorRetries: z.number().int().positive().default(3),

  /**
   * Maximum number of tool-call iterations inside a single runToolLoop
   * invocation. Prevents a model from calling tools forever.
   * @default 8
   */
  maxToolCallIterations: z.number().int().positive().default(8),

  /**
   * Maximum depth for recursive swarm / agent delegation chains.
   * A depth of 0 means no sub-delegation is allowed.
   * @default 3
   */
  maxSwarmDelegationDepth: z.number().int().nonnegative().default(3),

  /**
   * Maximum number of self-correction attempts inside runToolLoop when
   * a shell command returns a known error pattern.
   * @default 3
   */
  maxSelfCorrectionAttempts: z.number().int().nonnegative().default(3),

  /**
   * Maximum number of subtasks allowed in a single Execution Blueprint.
   * Prevents the Reviewer from generating an unbounded task list.
   * @default 8
   */
  maxSubtasksPerBlueprint: z.number().int().positive().default(8),
});

export type PipelineGuardConfig = z.infer<typeof PipelineGuardConfigSchema>;

/**
 * Default guard configuration — mirrors the values already present in
 * `config.pipeline` so that existing behaviour is preserved.
 */
export const DEFAULT_GUARD_CONFIG: PipelineGuardConfig = {
  maxReviewerAnalystIterations: 3,
  maxExecutorRetries: 3,
  maxToolCallIterations: 8,
  maxSwarmDelegationDepth: 3,
  maxSelfCorrectionAttempts: 3,
  maxSubtasksPerBlueprint: 8,
};

// ─── Guard Decision Types ─────────────────────────────────────────────────────

export type GuardDecision =
  | { allowed: true }
  | { allowed: false; reason: string; limitReached: number };

// ─── Guard Factory ────────────────────────────────────────────────────────────

/**
 * PipelineGuards — stateless helper class that encapsulates all guard checks.
 *
 * Instantiate once with a merged config and reuse across the pipeline:
 *
 * ```ts
 * const guards = new PipelineGuards({ maxReviewerAnalystIterations: 5 });
 * const decision = guards.checkReviewerAnalyst(state.iterationCount);
 * if (!decision.allowed) { ... force-approve ... }
 * ```
 */
export class PipelineGuards {
  private readonly cfg: PipelineGuardConfig;

  constructor(overrides: Partial<PipelineGuardConfig> = {}) {
    this.cfg = PipelineGuardConfigSchema.parse({
      ...DEFAULT_GUARD_CONFIG,
      ...overrides,
    });
  }

  // ── Reviewer ↔ Analyst guard ────────────────────────────────────────────────

  /**
   * Returns whether another Reviewer → Analyst cycle is permitted.
   *
   * @param currentIterations  Number of completed Reviewer runs so far.
   *                           The first run is iteration 1.
   */
  checkReviewerAnalyst(currentIterations: number): GuardDecision {
    if (currentIterations < this.cfg.maxReviewerAnalystIterations) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason:
        `Maximum Reviewer ↔ Analyst iterations reached ` +
        `(${currentIterations}/${this.cfg.maxReviewerAnalystIterations}). ` +
        `Forcing approval to prevent infinite loop.`,
      limitReached: this.cfg.maxReviewerAnalystIterations,
    };
  }

  // ── Executor retry guard ────────────────────────────────────────────────────

  /**
   * Returns whether the Executor may attempt another retry for a subtask.
   *
   * @param attemptCount  Number of attempts already made (0-based on first try).
   */
  checkExecutorRetry(attemptCount: number): GuardDecision {
    if (attemptCount < this.cfg.maxExecutorRetries) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason:
        `Maximum executor retries reached ` +
        `(${attemptCount}/${this.cfg.maxExecutorRetries}). ` +
        `Marking subtask as permanently failed.`,
      limitReached: this.cfg.maxExecutorRetries,
    };
  }

  // ── Tool-call loop guard ────────────────────────────────────────────────────

  /**
   * Returns whether the tool-calling loop may execute another iteration.
   *
   * @param loopIteration  Current loop index (0-based).
   */
  checkToolCallLoop(loopIteration: number): GuardDecision {
    if (loopIteration < this.cfg.maxToolCallIterations) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason:
        `Maximum tool-call loop iterations reached ` +
        `(${loopIteration}/${this.cfg.maxToolCallIterations}). ` +
        `Interrupting tool loop and returning partial output.`,
      limitReached: this.cfg.maxToolCallIterations,
    };
  }

  // ── Self-correction guard ───────────────────────────────────────────────────

  /**
   * Returns whether another self-correction attempt is permitted inside
   * the tool-calling loop.
   *
   * @param attempts  Number of self-corrections already applied.
   */
  checkSelfCorrection(attempts: number): GuardDecision {
    if (attempts < this.cfg.maxSelfCorrectionAttempts) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason:
        `Maximum self-correction attempts reached ` +
        `(${attempts}/${this.cfg.maxSelfCorrectionAttempts}). ` +
        `Skipping further auto-corrections.`,
      limitReached: this.cfg.maxSelfCorrectionAttempts,
    };
  }

  // ── Swarm delegation guard ──────────────────────────────────────────────────

  /**
   * Returns whether a sub-agent delegation is permitted at the given depth.
   *
   * @param currentDepth  Current delegation depth (0 = top-level supervisor).
   */
  checkSwarmDelegation(currentDepth: number): GuardDecision {
    if (currentDepth < this.cfg.maxSwarmDelegationDepth) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason:
        `Maximum swarm delegation depth reached ` +
        `(${currentDepth}/${this.cfg.maxSwarmDelegationDepth}). ` +
        `Refusing further sub-agent delegation.`,
      limitReached: this.cfg.maxSwarmDelegationDepth,
    };
  }

  // ── Subtask count guard ─────────────────────────────────────────────────────

  /**
   * Clamps a subtask list to the configured maximum, logging a warning if
   * truncation occurs.
   *
   * @param subtasks  The raw subtask array from the Reviewer.
   * @returns         The (possibly truncated) subtask array.
   */
  clampSubtasks<T>(subtasks: T[]): T[] {
    if (subtasks.length <= this.cfg.maxSubtasksPerBlueprint) {
      return subtasks;
    }
    return subtasks.slice(0, this.cfg.maxSubtasksPerBlueprint);
  }

  // ── Config accessor ─────────────────────────────────────────────────────────

  /** Returns a read-only copy of the active guard configuration. */
  getConfig(): Readonly<PipelineGuardConfig> {
    return Object.freeze({ ...this.cfg });
  }
}

// ─── Singleton instance (uses values from config.pipeline at import time) ─────

/**
 * Default singleton PipelineGuards instance.
 *
 * Agents and graph nodes should import this instance unless they need
 * custom limits (e.g., in tests).
 *
 * The singleton is lazily initialised from `config.pipeline` so that
 * environment-variable overrides applied before the first import are
 * respected.
 */
let _defaultGuards: PipelineGuards | null = null;

export function getDefaultGuards(): PipelineGuards {
  if (!_defaultGuards) {
    // Lazy import to avoid circular dependency with config.ts
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { config } = require('../config.js') as { config: { pipeline: Partial<PipelineGuardConfig> } };
      _defaultGuards = new PipelineGuards(config.pipeline ?? {});
    } catch {
      // Fallback to defaults if config is unavailable (e.g., in unit tests)
      _defaultGuards = new PipelineGuards();
    }
  }
  return _defaultGuards;
}

/**
 * Resets the default singleton. Useful in tests to inject a custom config.
 *
 * ```ts
 * resetDefaultGuards(new PipelineGuards({ maxReviewerAnalystIterations: 1 }));
 * ```
 */
export function resetDefaultGuards(guards?: PipelineGuards): void {
  _defaultGuards = guards ?? null;
}
