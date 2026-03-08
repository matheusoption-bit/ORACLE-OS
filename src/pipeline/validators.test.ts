/**
 * ORACLE-OS — Unit Tests: Pipeline Validators (Issue #10)
 *
 * Covers all stage-level input/output validators defined in validators.ts:
 *   • validateAnalystInput / validateAnalystOutput
 *   • validateReviewerInput / validateReviewerOutput
 *   • validateExecutorInput / validateExecutionResult
 *   • validateSynthesisInput / validateSynthesisOutput
 *   • validatePipelineState
 *   • PipelineValidationError shape
 */

import { describe, it, expect } from 'vitest';
import {
  validateAnalystInput,
  validateAnalystOutput,
  validateReviewerInput,
  validateReviewerOutput,
  validateExecutorInput,
  validateExecutionResult,
  validateSynthesisInput,
  validateSynthesisOutput,
  validatePipelineState,
  PipelineValidationError,
} from './validators.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const validSubtask = {
  id: 'sub-001',
  title: 'Implement endpoint',
  description: 'POST /api/users',
  type: 'code',
  priority: 1,
  dependsOn: [],
  assignedAgent: 'backend',
  dependencies: [],
  estimatedDuration: 20,
  tools: [],
  validationCriteria: '',
};

const validAnalystState = {
  taskSummary: 'Build a REST API',
  ragContext: '',
  requirements: ['Endpoint /api/users'],
  relevantFiles: [],
  complexityLevel: 'medium',
  externalDependencies: [],
  initialRisks: [],
  timestamp: new Date().toISOString(),
};

const validBlueprint = {
  status: 'approved',
  subtasks: [validSubtask],
  executionPlan: 'sequential',
  architecturalNotes: '',
  securityRisks: [],
  redundanciesFound: [],
  timestamp: new Date().toISOString(),
};

const validExecutionResult = {
  subtaskId: 'sub-001',
  status: 'success',
  output: 'Done',
  toolCallsExecuted: [],
  filesModified: [],
  timestamp: new Date().toISOString(),
};

const validSynthesisOutput = {
  executiveSummary: 'Task completed.',
  commitMessages: ['feat: add endpoint'],
  changelogEntries: [],
  readmeUpdates: '',
  finalFiles: [],
  qualityMetrics: {
    subtasksCompleted: 1,
    subtasksTotal: 1,
    testsPassRate: 100,
    selfCorrections: 0,
  },
  timestamp: new Date().toISOString(),
};

// ─── PipelineValidationError ──────────────────────────────────────────────────

describe('PipelineValidationError', () => {
  it('has correct name and stage', () => {
    const result = validateAnalystInput({ task: '' });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBeInstanceOf(PipelineValidationError);
      expect(result.error.name).toBe('PipelineValidationError');
      expect(result.error.stage).toBe('Analyst');
    }
  });

  it('message includes field path and description', () => {
    const result = validateAnalystInput({ task: '' });
    if (!result.valid) {
      expect(result.error.message).toContain('task');
    }
  });
});

// ─── Analyst validators ───────────────────────────────────────────────────────

describe('validateAnalystInput', () => {
  it('returns valid: true for a state with a non-empty task', () => {
    const result = validateAnalystInput({ task: 'Build something' });
    expect(result.valid).toBe(true);
  });

  it('returns valid: false for empty task', () => {
    const result = validateAnalystInput({ task: '' });
    expect(result.valid).toBe(false);
  });

  it('returns valid: false for missing task', () => {
    const result = validateAnalystInput({});
    expect(result.valid).toBe(false);
  });
});

describe('validateAnalystOutput', () => {
  it('returns valid: true for a well-formed AnalystState', () => {
    const result = validateAnalystOutput(validAnalystState);
    expect(result.valid).toBe(true);
  });

  it('returns valid: false for missing taskSummary', () => {
    const result = validateAnalystOutput({ ...validAnalystState, taskSummary: '' });
    expect(result.valid).toBe(false);
  });

  it('emits a warning when requirements array is empty', () => {
    // Empty requirements fails the schema (min 1), so this tests the schema rejection
    const result = validateAnalystOutput({ ...validAnalystState, requirements: [] });
    expect(result.valid).toBe(false);
  });

  it('emits a warning when initialRisks is empty (soft check)', () => {
    const result = validateAnalystOutput({ ...validAnalystState, initialRisks: [] });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.warnings.some((w) => w.includes('risk'))).toBe(true);
    }
  });
});

// ─── Reviewer validators ──────────────────────────────────────────────────────

describe('validateReviewerInput', () => {
  it('returns valid: true when contextDocument is present and valid', () => {
    const result = validateReviewerInput({ contextDocument: validAnalystState });
    expect(result.valid).toBe(true);
  });

  it('returns valid: false when contextDocument is null', () => {
    const result = validateReviewerInput({ contextDocument: null });
    expect(result.valid).toBe(false);
  });

  it('returns valid: false when contextDocument is missing', () => {
    const result = validateReviewerInput({});
    expect(result.valid).toBe(false);
  });
});

describe('validateReviewerOutput', () => {
  it('returns valid: true for an approved blueprint', () => {
    const result = validateReviewerOutput(validBlueprint);
    expect(result.valid).toBe(true);
  });

  it('returns valid: true for a needs_revision blueprint', () => {
    const result = validateReviewerOutput({
      ...validBlueprint,
      status: 'needs_revision',
      feedbackToAnalyst: 'Add security analysis',
    });
    expect(result.valid).toBe(true);
  });

  it('returns valid: false for invalid status', () => {
    const result = validateReviewerOutput({ ...validBlueprint, status: 'pending' });
    expect(result.valid).toBe(false);
  });

  it('emits warning when approved blueprint has zero subtasks', () => {
    const result = validateReviewerOutput({ ...validBlueprint, subtasks: [] });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.warnings.some((w) => w.includes('zero subtasks'))).toBe(true);
    }
  });

  it('emits warning when security risks are present', () => {
    const result = validateReviewerOutput({
      ...validBlueprint,
      securityRisks: ['SQL injection possible'],
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.warnings.some((w) => w.includes('security risk'))).toBe(true);
    }
  });
});

// ─── Executor validators ──────────────────────────────────────────────────────

describe('validateExecutorInput', () => {
  it('returns valid: true when executionBlueprint is approved', () => {
    const result = validateExecutorInput({ executionBlueprint: validBlueprint });
    expect(result.valid).toBe(true);
  });

  it('returns valid: false when executionBlueprint is needs_revision', () => {
    const result = validateExecutorInput({
      executionBlueprint: { ...validBlueprint, status: 'needs_revision' },
    });
    expect(result.valid).toBe(false);
  });

  it('returns valid: false when executionBlueprint is missing', () => {
    const result = validateExecutorInput({});
    expect(result.valid).toBe(false);
  });
});

describe('validateExecutionResult', () => {
  it('returns valid: true for a successful result', () => {
    const result = validateExecutionResult(validExecutionResult);
    expect(result.valid).toBe(true);
  });

  it('returns valid: true for a failed result with warning', () => {
    const result = validateExecutionResult({ ...validExecutionResult, status: 'failed' });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.warnings.some((w) => w.includes('failed'))).toBe(true);
    }
  });

  it('emits warning when selfCorrectionAttempts > 0', () => {
    const result = validateExecutionResult({ ...validExecutionResult, selfCorrectionAttempts: 2 });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.warnings.some((w) => w.includes('self-correction'))).toBe(true);
    }
  });

  it('returns valid: false for missing subtaskId', () => {
    const result = validateExecutionResult({ ...validExecutionResult, subtaskId: '' });
    expect(result.valid).toBe(false);
  });
});

// ─── Synthesis validators ─────────────────────────────────────────────────────

describe('validateSynthesisInput', () => {
  it('returns valid: true for a state with a task', () => {
    const result = validateSynthesisInput({ task: 'Build API', executedCode: {} });
    expect(result.valid).toBe(true);
  });

  it('emits warning when executedCode is missing', () => {
    const result = validateSynthesisInput({ task: 'Build API' });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.warnings.some((w) => w.includes('executedCode'))).toBe(true);
    }
  });

  it('returns valid: false for empty task', () => {
    const result = validateSynthesisInput({ task: '' });
    expect(result.valid).toBe(false);
  });
});

describe('validateSynthesisOutput', () => {
  it('returns valid: true for a well-formed synthesis output', () => {
    const result = validateSynthesisOutput(validSynthesisOutput);
    expect(result.valid).toBe(true);
  });

  it('emits warning when testsPassRate is below 50%', () => {
    const result = validateSynthesisOutput({
      ...validSynthesisOutput,
      qualityMetrics: { ...validSynthesisOutput.qualityMetrics, testsPassRate: 30 },
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.warnings.some((w) => w.includes('pass rate'))).toBe(true);
    }
  });

  it('returns valid: false for empty executiveSummary', () => {
    const result = validateSynthesisOutput({ ...validSynthesisOutput, executiveSummary: '' });
    expect(result.valid).toBe(false);
  });
});

// ─── validatePipelineState ────────────────────────────────────────────────────

describe('validatePipelineState', () => {
  const validState = {
    task: 'Build API',
    currentStage: 'analyst',
    contextDocument: null,
    executionBlueprint: null,
    executedCode: null,
    synthesisOutput: null,
    subtasks: [],
    currentSubtask: 0,
    results: {},
    errors: [],
    reviewStatus: 'pending',
    iterationCount: 0,
    shortTermMemory: [],
  };

  it('returns valid: true for a well-formed initial state', () => {
    const result = validatePipelineState(validState);
    expect(result.valid).toBe(true);
  });

  it('returns valid: false for empty task', () => {
    const result = validatePipelineState({ ...validState, task: '' });
    expect(result.valid).toBe(false);
  });

  it('returns valid: false for invalid currentStage', () => {
    const result = validatePipelineState({ ...validState, currentStage: 'unknown' });
    expect(result.valid).toBe(false);
  });
});
