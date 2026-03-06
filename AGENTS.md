# ORACLE-OS Agent System

> **Multi-agent orchestration design and agent specifications (Sprint 10)**

---

## 🎭 Agent Roles

### 1. PLANNER Agent

**Responsibility:** Task decomposition and orchestration strategy.

**Input (State):**
```typescript
{
  task: string;              // User's high-level request
  context: string[];         // Retrieved from RAG (similar past tasks)
  shortTermMemory: string[]; // Context from previous agents in the same loop
}
```

**Output (State Update):**
```typescript
{
  subtasks: [
    {
      id: string;
      description: string;
      assignedAgent: 'frontend' | 'backend' | 'devops' | ...;
      dependencies: string[];  // IDs of prerequisite subtasks
      validationCriteria: string;
    }
  ];
}
```

**Prompt Snippet:**
```
<task>{user_task}</task>

<similar_tasks>{rag_context}</similar_tasks>

<short_term_memory>
Context from previous agents in this cycle:
[1] [Reviewer] Attempt 1/3 → needs_revision. Notes: The login button is not centered.
</short_term_memory>

Output a JSON plan with subtasks...
```

---

### 2. EXECUTOR Agents

**Responsibility:** Execute a single, atomic subtask using a specialized toolset.

**New Feature: Auto-Correction**

- The `runToolLoop` now intelligently detects common execution errors from `shell_exec` (e.g., `command not found`, `module not found`).
- When a known error is detected, the Executor automatically attempts a corrective action (e.g., `npm install <missing_module>`, `pip install <package>`).
- This process is logged and retried up to 3 times per subtask, reducing failures from simple environment issues.

**Input (State):**
```typescript
{
  subtask: Subtask;          // The specific subtask to execute
  shortTermMemory: string[]; // Context from Planner and previous Executors
}
```

**Output (Result):**
```typescript
{
  subtaskId: string;
  status: 'success' | 'failed';
  output: string;            // Final summary or error message
  toolCallsExecuted: string[];
  filesModified: string[];
  selfCorrectionAttempts?: number; // Number of auto-corrections tried
}
```

---

### 3. REVIEWER Agent

**Responsibility:** Quality assurance, validation, and automated testing.

**New Feature: Unit Test Generation**

- Upon approving the Executor's work (`reviewStatus: 'approved'`), the Reviewer identifies all new or modified code files (`.ts`, `.tsx`, `.py`).
- It then invokes a specialized prompt to generate unit tests for these files using `vitest`.
- The tests are written to `<filename>.test.ts` and executed via `shell_exec`.
- The test run results are appended to the final review notes, providing an automated quality gate.

**Input (State):**
```typescript
{
  task: string;
  subtasks: Subtask[];
  results: Record<string, SubtaskResult>; // All executor results
  shortTermMemory: string[];               // Full context from Planner and all Executors
}
```

**Output (State Update):**
```typescript
{
  reviewStatus: 'approved' | 'rejected' | 'needs_revision';
  revisionNotes?: string; // Feedback for the next iteration
  iterationCount: number;  // Incremented on each review
}
```

---

## 🔀 Agent Coordination (LangGraph)

### State Graph (`OracleState`)

The graph operates on a shared state object. Key fields include:

- `task: string`
- `subtasks: Subtask[]`
- `currentSubtask: number`
- `results: Record<string, SubtaskResult>`
- `reviewStatus: 'pending' | 'approved' | ...`
- `iterationCount: number`
- **`shortTermMemory: string[]`**: A log of high-level actions taken by each agent in the current loop. It's passed to subsequent agents to provide contextual awareness.

### State Transitions

```typescript
const oracleGraph = new StateGraph<OracleState>({
  channels: {
    // ... other channels
    shortTermMemory: { value: (x, y) => x.concat(y), default: () => [] },
  }
});

// 1. START -> planner
// 2. planner -> executor_router (routes to frontend/backend/generic executor)
// 3. executor -> executor_router (loops until all subtasks are done)
// 4. executor_router -> reviewer (when all subtasks are done)
// 5. reviewer -> executor_router (if needs_revision and iterations < 3)
// 6. reviewer -> save_skill (if approved)
// 7. save_skill -> END
```

Each node (Planner, Executor, Reviewer) now appends a summary of its actions to `shortTermMemory`, for example:

- `[Planner] Decomposed task into 5 subtasks: Create UI, Build API...`
- `[Executor/frontend] Subtask "Create UI" → success. Files: Button.tsx, Input.tsx.`
- `[Reviewer] Attempt 1/3 → approved. Generated 2 unit tests.`

---

## 🔮 Future Enhancements

### Human-in-the-Loop

- **Live Intervention:** Allow the user to send messages via the `ChatInput` *during* execution. The active agent can pause and incorporate this feedback in real-time.

### Specialized Agents

- **Data Agent:** Analytics, ETL, data validation.
- **Design Agent:** Figma integration, design system adherence.
- **Security Agent:** OWASP checks, dependency audits.
- **Documentation Agent:** Auto-generate API docs, READMEs from code and execution history.

---

**Last Updated:** 2026-03-06
**Maintained By:** Manus AI
