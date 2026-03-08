/**
 * ORACLE-OS Pipeline Type Helpers
 *
 * Provides type-safe narrowing utilities for discriminated union types used
 * throughout the pipeline (GuardDecision, ValidationResult).
 *
 * These helpers avoid TypeScript errors when accessing properties that only
 * exist on one branch of a discriminated union.
 */

import type { GuardDecision } from './guards.js';
import type { ValidationResult } from './validators.js';

// ─── GuardDecision helpers ────────────────────────────────────────────────────

/**
 * Type guard: narrows GuardDecision to the "not allowed" branch.
 */
export function isGuardBlocked(
  decision: GuardDecision
): decision is { allowed: false; reason: string; limitReached: number } {
  return !decision.allowed;
}

/**
 * Extracts the reason string from a GuardDecision.
 * Returns an empty string if the decision is `allowed: true`.
 */
export function guardReason(decision: GuardDecision): string {
  if (isGuardBlocked(decision)) return decision.reason;
  return '';
}

// ─── ValidationResult helpers ─────────────────────────────────────────────────

/**
 * Type guard: narrows ValidationResult to the "invalid" branch.
 */
export function isValidationFailed<T>(
  result: ValidationResult<T>
): result is { valid: false; error: import('./validators.js').PipelineValidationError; warnings: string[] } {
  return !result.valid;
}

/**
 * Extracts the error message from a ValidationResult.
 * Returns an empty string if the result is `valid: true`.
 */
export function validationErrorMessage<T>(result: ValidationResult<T>): string {
  if (isValidationFailed(result)) return result.error.message;
  return '';
}
