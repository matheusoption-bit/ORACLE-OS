/**
 * ORACLE-OS — Unit Tests: Iteration Guards (Issue #11)
 *
 * Covers all guard checks in PipelineGuards:
 *   • checkReviewerAnalyst
 *   • checkExecutorRetry
 *   • checkToolCallLoop
 *   • checkSelfCorrection
 *   • checkSwarmDelegation
 *   • clampSubtasks
 *   • Custom configuration via constructor
 *   • Singleton helpers (getDefaultGuards / resetDefaultGuards)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PipelineGuards,
  DEFAULT_GUARD_CONFIG,
  getDefaultGuards,
  resetDefaultGuards,
  PipelineGuardConfigSchema,
} from './guards.js';

// ─── PipelineGuards — default configuration ───────────────────────────────────

describe('PipelineGuards — default configuration', () => {
  let guards: PipelineGuards;

  beforeEach(() => {
    guards = new PipelineGuards();
  });

  // ── checkReviewerAnalyst ──────────────────────────────────────────────────

  describe('checkReviewerAnalyst', () => {
    it('allows iteration when count is below limit', () => {
      const decision = guards.checkReviewerAnalyst(0);
      expect(decision.allowed).toBe(true);
    });

    it('allows iteration at count = limit - 1', () => {
      const decision = guards.checkReviewerAnalyst(DEFAULT_GUARD_CONFIG.maxReviewerAnalystIterations - 1);
      expect(decision.allowed).toBe(true);
    });

    it('blocks iteration when count equals limit', () => {
      const decision = guards.checkReviewerAnalyst(DEFAULT_GUARD_CONFIG.maxReviewerAnalystIterations);
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) {
        expect(decision.limitReached).toBe(DEFAULT_GUARD_CONFIG.maxReviewerAnalystIterations);
        expect(decision.reason).toContain('Reviewer');
      }
    });

    it('blocks iteration when count exceeds limit', () => {
      const decision = guards.checkReviewerAnalyst(DEFAULT_GUARD_CONFIG.maxReviewerAnalystIterations + 5);
      expect(decision.allowed).toBe(false);
    });
  });

  // ── checkExecutorRetry ────────────────────────────────────────────────────

  describe('checkExecutorRetry', () => {
    it('allows retry on first attempt (count = 0)', () => {
      const decision = guards.checkExecutorRetry(0);
      expect(decision.allowed).toBe(true);
    });

    it('blocks retry when attempt count equals limit', () => {
      const decision = guards.checkExecutorRetry(DEFAULT_GUARD_CONFIG.maxExecutorRetries);
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) {
        expect(decision.reason).toContain('executor retries');
      }
    });
  });

  // ── checkToolCallLoop ─────────────────────────────────────────────────────

  describe('checkToolCallLoop', () => {
    it('allows loop iteration at index 0', () => {
      expect(guards.checkToolCallLoop(0).allowed).toBe(true);
    });

    it('allows loop iteration just before limit', () => {
      expect(guards.checkToolCallLoop(DEFAULT_GUARD_CONFIG.maxToolCallIterations - 1).allowed).toBe(true);
    });

    it('blocks loop when iteration index equals limit', () => {
      const decision = guards.checkToolCallLoop(DEFAULT_GUARD_CONFIG.maxToolCallIterations);
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) {
        expect(decision.reason).toContain('tool-call loop');
      }
    });
  });

  // ── checkSelfCorrection ───────────────────────────────────────────────────

  describe('checkSelfCorrection', () => {
    it('allows first self-correction (attempts = 0)', () => {
      expect(guards.checkSelfCorrection(0).allowed).toBe(true);
    });

    it('blocks when self-correction count equals limit', () => {
      const decision = guards.checkSelfCorrection(DEFAULT_GUARD_CONFIG.maxSelfCorrectionAttempts);
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) {
        expect(decision.reason).toContain('self-correction');
      }
    });
  });

  // ── checkSwarmDelegation ──────────────────────────────────────────────────

  describe('checkSwarmDelegation', () => {
    it('allows delegation at depth 0 (top-level)', () => {
      expect(guards.checkSwarmDelegation(0).allowed).toBe(true);
    });

    it('allows delegation just below max depth', () => {
      expect(guards.checkSwarmDelegation(DEFAULT_GUARD_CONFIG.maxSwarmDelegationDepth - 1).allowed).toBe(true);
    });

    it('blocks delegation at max depth', () => {
      const decision = guards.checkSwarmDelegation(DEFAULT_GUARD_CONFIG.maxSwarmDelegationDepth);
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) {
        expect(decision.reason).toContain('delegation depth');
      }
    });
  });

  // ── clampSubtasks ─────────────────────────────────────────────────────────

  describe('clampSubtasks', () => {
    it('returns original array when within limit', () => {
      const arr = Array.from({ length: 5 }, (_, i) => ({ id: `sub-${i}` }));
      expect(guards.clampSubtasks(arr)).toHaveLength(5);
    });

    it('truncates array that exceeds limit', () => {
      const arr = Array.from({ length: 20 }, (_, i) => ({ id: `sub-${i}` }));
      const clamped = guards.clampSubtasks(arr);
      expect(clamped).toHaveLength(DEFAULT_GUARD_CONFIG.maxSubtasksPerBlueprint);
    });

    it('preserves order when truncating', () => {
      const arr = Array.from({ length: 10 }, (_, i) => i);
      const clamped = guards.clampSubtasks(arr);
      expect(clamped[0]).toBe(0);
      expect(clamped[clamped.length - 1]).toBe(DEFAULT_GUARD_CONFIG.maxSubtasksPerBlueprint - 1);
    });
  });

  // ── getConfig ─────────────────────────────────────────────────────────────

  describe('getConfig', () => {
    it('returns a frozen copy of the active configuration', () => {
      const cfg = guards.getConfig();
      expect(cfg.maxReviewerAnalystIterations).toBe(DEFAULT_GUARD_CONFIG.maxReviewerAnalystIterations);
      expect(Object.isFrozen(cfg)).toBe(true);
    });
  });
});

// ─── PipelineGuards — custom configuration ────────────────────────────────────

describe('PipelineGuards — custom configuration', () => {
  it('respects custom maxReviewerAnalystIterations', () => {
    const guards = new PipelineGuards({ maxReviewerAnalystIterations: 1 });
    expect(guards.checkReviewerAnalyst(0).allowed).toBe(true);
    expect(guards.checkReviewerAnalyst(1).allowed).toBe(false);
  });

  it('respects custom maxToolCallIterations', () => {
    const guards = new PipelineGuards({ maxToolCallIterations: 2 });
    expect(guards.checkToolCallLoop(1).allowed).toBe(true);
    expect(guards.checkToolCallLoop(2).allowed).toBe(false);
  });

  it('respects custom maxSubtasksPerBlueprint', () => {
    const guards = new PipelineGuards({ maxSubtasksPerBlueprint: 3 });
    const arr = [1, 2, 3, 4, 5];
    expect(guards.clampSubtasks(arr)).toHaveLength(3);
  });

  it('rejects invalid configuration (non-positive limit)', () => {
    expect(() => new PipelineGuards({ maxReviewerAnalystIterations: 0 })).toThrow();
  });

  it('rejects negative maxSwarmDelegationDepth', () => {
    expect(() => new PipelineGuards({ maxSwarmDelegationDepth: -1 })).toThrow();
  });
});

// ─── PipelineGuardConfigSchema ────────────────────────────────────────────────

describe('PipelineGuardConfigSchema', () => {
  it('applies all default values when given an empty object', () => {
    const result = PipelineGuardConfigSchema.parse({});
    expect(result.maxReviewerAnalystIterations).toBe(3);
    expect(result.maxExecutorRetries).toBe(3);
    expect(result.maxToolCallIterations).toBe(8);
    expect(result.maxSwarmDelegationDepth).toBe(3);
    expect(result.maxSelfCorrectionAttempts).toBe(3);
    expect(result.maxSubtasksPerBlueprint).toBe(8);
  });

  it('accepts partial overrides and keeps other defaults', () => {
    const result = PipelineGuardConfigSchema.parse({ maxExecutorRetries: 5 });
    expect(result.maxExecutorRetries).toBe(5);
    expect(result.maxReviewerAnalystIterations).toBe(3);
  });
});

// ─── Singleton helpers ────────────────────────────────────────────────────────

describe('getDefaultGuards / resetDefaultGuards', () => {
  afterEach(() => {
    // Always reset to avoid polluting other tests
    resetDefaultGuards();
  });

  it('returns a PipelineGuards instance', () => {
    const guards = getDefaultGuards();
    expect(guards).toBeInstanceOf(PipelineGuards);
  });

  it('returns the same instance on repeated calls (singleton)', () => {
    const a = getDefaultGuards();
    const b = getDefaultGuards();
    expect(a).toBe(b);
  });

  it('resetDefaultGuards with a custom instance replaces the singleton', () => {
    const custom = new PipelineGuards({ maxReviewerAnalystIterations: 1 });
    resetDefaultGuards(custom);
    const retrieved = getDefaultGuards();
    expect(retrieved).toBe(custom);
    expect(retrieved.getConfig().maxReviewerAnalystIterations).toBe(1);
  });

  it('resetDefaultGuards with no argument forces re-initialisation on next call', () => {
    const first = getDefaultGuards();
    resetDefaultGuards();
    const second = getDefaultGuards();
    // Different object instances after reset
    expect(second).not.toBe(first);
  });
});
