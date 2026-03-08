/**
 * ORACLE-OS — Unit Tests: State Contracts (Issue #10)
 *
 * Covers runtime validation of every Zod schema defined in schemas.ts:
 *   • SubtaskSchema
 *   • AnalystStateSchema
 *   • ExecutionBlueprintSchema
 *   • ExecutionResultSchema
 *   • SynthesisOutputSchema
 *   • SupervisorStateSchema
 *   • Validation helper functions
 */

import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  SubtaskSchema,
  AnalystStateSchema,
  ExecutionBlueprintSchema,
  ExecutionResultSchema,
  SynthesisOutputSchema,
  SupervisorStateSchema,
  validateAnalystState,
  validateExecutionBlueprint,
  validateExecutionResult,
  validateSynthesisOutput,
  validateSupervisorState,
  safeValidateSupervisorState,
} from './schemas.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const validSubtask = {
  id: 'sub-001',
  title: 'Implement login endpoint',
  description: 'POST /auth/login with JWT',
  type: 'code' as const,
  priority: 1,
  dependsOn: [],
  assignedAgent: 'backend' as const,
  dependencies: [],
  estimatedDuration: 20,
  tools: ['file_write', 'shell_exec'],
  validationCriteria: 'Returns 200 on valid credentials',
};

const validAnalystState = {
  taskSummary: 'Build a REST API with JWT auth',
  ragContext: 'No prior context',
  requirements: ['Endpoint /auth/login', 'JWT token generation'],
  relevantFiles: ['src/routes/auth.ts'],
  complexityLevel: 'medium' as const,
  externalDependencies: ['jsonwebtoken'],
  initialRisks: ['Token expiry not handled'],
  timestamp: new Date().toISOString(),
};

const validBlueprint = {
  status: 'approved' as const,
  subtasks: [validSubtask],
  executionPlan: 'sequential' as const,
  architecturalNotes: 'Solid design',
  securityRisks: [],
  redundanciesFound: [],
  timestamp: new Date().toISOString(),
};

const validExecutionResult = {
  subtaskId: 'sub-001',
  status: 'success' as const,
  output: 'Endpoint created',
  toolCallsExecuted: ['file_write'],
  filesModified: ['src/routes/auth.ts'],
  timestamp: new Date().toISOString(),
};

const validSynthesisOutput = {
  executiveSummary: 'JWT auth API implemented successfully.',
  commitMessages: ['feat(auth): add JWT login endpoint'],
  changelogEntries: ['### Added\n- JWT login endpoint'],
  readmeUpdates: '',
  finalFiles: [{ path: 'src/routes/auth.ts', description: 'Login route' }],
  qualityMetrics: {
    subtasksCompleted: 1,
    subtasksTotal: 1,
    testsPassRate: 100,
    selfCorrections: 0,
  },
  timestamp: new Date().toISOString(),
};

// ─── SubtaskSchema ────────────────────────────────────────────────────────────

describe('SubtaskSchema', () => {
  it('parses a valid subtask', () => {
    const result = SubtaskSchema.safeParse(validSubtask);
    expect(result.success).toBe(true);
  });

  it('rejects a subtask with empty id', () => {
    const result = SubtaskSchema.safeParse({ ...validSubtask, id: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('id');
    }
  });

  it('rejects priority outside 1-5 range', () => {
    const result = SubtaskSchema.safeParse({ ...validSubtask, priority: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid assignedAgent value', () => {
    const result = SubtaskSchema.safeParse({ ...validSubtask, assignedAgent: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('applies default values for optional fields', () => {
    const minimal = {
      id: 'sub-min',
      title: 'Minimal subtask',
      description: '',
      type: 'other',
      priority: 3,
    };
    const result = SubtaskSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dependsOn).toEqual([]);
      expect(result.data.assignedAgent).toBe('geral');
      expect(result.data.estimatedDuration).toBe(15);
    }
  });
});

// ─── AnalystStateSchema ───────────────────────────────────────────────────────

describe('AnalystStateSchema', () => {
  it('parses a valid AnalystState', () => {
    const result = AnalystStateSchema.safeParse(validAnalystState);
    expect(result.success).toBe(true);
  });

  it('rejects empty taskSummary', () => {
    const result = AnalystStateSchema.safeParse({ ...validAnalystState, taskSummary: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty requirements array', () => {
    const result = AnalystStateSchema.safeParse({ ...validAnalystState, requirements: [] });
    expect(result.success).toBe(false);
  });

  it('rejects invalid complexityLevel', () => {
    const result = AnalystStateSchema.safeParse({ ...validAnalystState, complexityLevel: 'extreme' });
    expect(result.success).toBe(false);
  });

  it('validateAnalystState throws ZodError on invalid data', () => {
    expect(() => validateAnalystState({ taskSummary: '', requirements: [] })).toThrow(ZodError);
  });
});

// ─── ExecutionBlueprintSchema ─────────────────────────────────────────────────

describe('ExecutionBlueprintSchema', () => {
  it('parses a valid approved blueprint', () => {
    const result = ExecutionBlueprintSchema.safeParse(validBlueprint);
    expect(result.success).toBe(true);
  });

  it('parses a needs_revision blueprint with feedbackToAnalyst', () => {
    const blueprint = {
      ...validBlueprint,
      status: 'needs_revision',
      feedbackToAnalyst: 'Missing security analysis',
    };
    const result = ExecutionBlueprintSchema.safeParse(blueprint);
    expect(result.success).toBe(true);
  });

  it('rejects invalid status value', () => {
    const result = ExecutionBlueprintSchema.safeParse({ ...validBlueprint, status: 'pending' });
    expect(result.success).toBe(false);
  });

  it('validateExecutionBlueprint throws on invalid data', () => {
    expect(() => validateExecutionBlueprint({ status: 'invalid' })).toThrow(ZodError);
  });
});

// ─── ExecutionResultSchema ────────────────────────────────────────────────────

describe('ExecutionResultSchema', () => {
  it('parses a valid execution result', () => {
    const result = ExecutionResultSchema.safeParse(validExecutionResult);
    expect(result.success).toBe(true);
  });

  it('parses a failed execution result', () => {
    const result = ExecutionResultSchema.safeParse({
      ...validExecutionResult,
      status: 'failed',
      output: 'Error: module not found',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status value', () => {
    const result = ExecutionResultSchema.safeParse({ ...validExecutionResult, status: 'error' });
    expect(result.success).toBe(false);
  });

  it('rejects empty subtaskId', () => {
    const result = ExecutionResultSchema.safeParse({ ...validExecutionResult, subtaskId: '' });
    expect(result.success).toBe(false);
  });

  it('validateExecutionResult throws on invalid data', () => {
    expect(() => validateExecutionResult({ status: 'success' })).toThrow(ZodError);
  });
});

// ─── SynthesisOutputSchema ────────────────────────────────────────────────────

describe('SynthesisOutputSchema', () => {
  it('parses a valid synthesis output', () => {
    const result = SynthesisOutputSchema.safeParse(validSynthesisOutput);
    expect(result.success).toBe(true);
  });

  it('rejects empty executiveSummary', () => {
    const result = SynthesisOutputSchema.safeParse({ ...validSynthesisOutput, executiveSummary: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty commitMessages array', () => {
    const result = SynthesisOutputSchema.safeParse({ ...validSynthesisOutput, commitMessages: [] });
    expect(result.success).toBe(false);
  });

  it('rejects testsPassRate > 100', () => {
    const result = SynthesisOutputSchema.safeParse({
      ...validSynthesisOutput,
      qualityMetrics: { ...validSynthesisOutput.qualityMetrics, testsPassRate: 150 },
    });
    expect(result.success).toBe(false);
  });

  it('validateSynthesisOutput throws on invalid data', () => {
    expect(() => validateSynthesisOutput({ executiveSummary: '' })).toThrow(ZodError);
  });
});

// ─── SupervisorStateSchema ────────────────────────────────────────────────────

describe('SupervisorStateSchema', () => {
  const validState = {
    task: 'Build a REST API',
    currentStage: 'analyst' as const,
    contextDocument: null,
    executionBlueprint: null,
    executedCode: null,
    synthesisOutput: null,
    subtasks: [],
    currentSubtask: 0,
    results: {},
    errors: [],
    reviewStatus: 'pending' as const,
    iterationCount: 0,
    shortTermMemory: [],
  };

  it('parses a valid initial state', () => {
    const result = SupervisorStateSchema.safeParse(validState);
    expect(result.success).toBe(true);
  });

  it('rejects empty task string', () => {
    const result = SupervisorStateSchema.safeParse({ ...validState, task: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid currentStage', () => {
    const result = SupervisorStateSchema.safeParse({ ...validState, currentStage: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('rejects negative iterationCount', () => {
    const result = SupervisorStateSchema.safeParse({ ...validState, iterationCount: -1 });
    expect(result.success).toBe(false);
  });

  it('accepts state with populated contextDocument', () => {
    const result = SupervisorStateSchema.safeParse({
      ...validState,
      contextDocument: validAnalystState,
      currentStage: 'reviewer',
    });
    expect(result.success).toBe(true);
  });

  it('validateSupervisorState throws on invalid data', () => {
    expect(() => validateSupervisorState({ task: '' })).toThrow(ZodError);
  });

  it('safeValidateSupervisorState returns success: false on invalid data', () => {
    const result = safeValidateSupervisorState({ task: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ZodError);
    }
  });

  it('safeValidateSupervisorState returns success: true on valid data', () => {
    const result = safeValidateSupervisorState(validState);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.task).toBe('Build a REST API');
    }
  });
});
