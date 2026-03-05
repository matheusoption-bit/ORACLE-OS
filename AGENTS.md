# ORACLE-OS Agent System

> **Multi-agent orchestration design and agent specifications**

---

## 🎭 Agent Roles

### 1. PLANNER Agent

**Responsibility:** Task decomposition and orchestration strategy.

**Input:**
```typescript
{
  task: string;              // User's high-level request
  context: string[];         // Retrieved from RAG (similar past tasks)
  availableAgents: string[]; // Executor agents online
}
```

**Output:**
```typescript
{
  subtasks: [
    {
      id: string;
      description: string;
      assignedAgent: 'frontend' | 'backend' | 'devops' | ...;
      dependencies: string[];  // IDs of prerequisite subtasks
      estimatedDuration: number; // minutes
    }
  ];
  executionPlan: 'sequential' | 'parallel' | 'mixed';
}
```

**Prompt Template:**
```
You are a senior technical architect. Decompose this task:

<task>
{user_task}
</task>

<similar_tasks>
{rag_context}
</similar_tasks>

Output a JSON plan with subtasks, assigned agents, and execution order.
Each subtask should be:
- Atomic (completable in <30 min)
- Testable (has clear success criteria)
- Tool-compatible (uses available MCP/E2B tools)
```

---

### 2. EXECUTOR Agents

#### 2.1 Frontend Agent

**Specialty:** React, Next.js, Tailwind, component libraries.

**Tools:**
- `file_*`: Read/write components
- `shell_npm`: Install dependencies
- `browser_*`: Visual regression testing

**Subtask Example:**
```json
{
  "id": "FE-001",
  "description": "Create a responsive navigation bar with dark mode toggle",
  "tools": ["file_write", "shell_npm"],
  "validation": "Component renders without errors, passes accessibility audit"
}
```

#### 2.2 Backend Agent

**Specialty:** Node.js, Python, APIs, databases.

**Tools:**
- `file_*`: Read/write server code
- `shell_*`: Run migrations, start servers
- `db_*`: Query/modify databases

**Subtask Example:**
```json
{
  "id": "BE-001",
  "description": "Implement POST /api/users endpoint with validation",
  "tools": ["file_write", "shell_exec", "db_query"],
  "validation": "Endpoint returns 201 on valid input, 400 on invalid"
}
```

#### 2.3 DevOps Agent

**Specialty:** Docker, CI/CD, infrastructure.

**Tools:**
- `file_*`: Write Dockerfiles, configs
- `shell_*`: Build images, deploy
- `github_*`: Create workflows

**Subtask Example:**
```json
{
  "id": "DO-001",
  "description": "Set up GitHub Actions CI for automated testing",
  "tools": ["file_write", "github_create_workflow"],
  "validation": "Workflow runs on push and reports status"
}
```

---

### 3. REVIEWER Agent

**Responsibility:** Quality assurance and validation.

**Input:**
```typescript
{
  subtaskResults: {
    id: string;
    output: any;
    logs: string[];
  }[];
  originalTask: string;
}
```

**Checks:**
1. **Functional:** Does output meet task requirements?
2. **Technical:** Code quality (lint, type-check)
3. **Security:** No hardcoded secrets, safe dependencies
4. **Performance:** No obvious bottlenecks

**Output:**
```typescript
{
  status: 'approved' | 'rejected';
  issues: [
    {
      severity: 'critical' | 'major' | 'minor';
      description: string;
      suggestedFix: string;
    }
  ];
  nextAction: 'complete' | 'iterate' | 'escalate';
}
```

**Prompt Template:**
```
You are a code reviewer. Evaluate this work:

<original_task>
{task}
</original_task>

<executor_output>
{results}
</executor_output>

<validation_criteria>
- Meets all requirements
- No security vulnerabilities
- Follows project conventions (see /docs/standards.md)
- Has tests (if applicable)
</validation_criteria>

Provide a JSON review with status and detailed issues.
```

---

## 🔀 Agent Coordination (LangGraph)

### State Transitions

```typescript
const oracleGraph = new StateGraph({
  nodes: {
    planner: plannerAgent,
    executor: executorAgent,
    reviewer: reviewerAgent,
  },
  edges: [
    { from: 'planner', to: 'executor', condition: (state) => state.subtasks.length > 0 },
    { from: 'executor', to: 'reviewer', condition: (state) => state.currentSubtask === state.subtasks.length },
    { from: 'reviewer', to: 'executor', condition: (state) => state.reviewStatus === 'rejected' && state.iterationCount < 3 },
    { from: 'reviewer', to: END, condition: (state) => state.reviewStatus === 'approved' },
  ],
});
```

### Parallel Execution

When subtasks have no dependencies, execute in parallel:

```typescript
const parallelExecutor = async (subtasks: Subtask[]) => {
  const independentSubtasks = subtasks.filter(s => s.dependencies.length === 0);
  
  const results = await Promise.all(
    independentSubtasks.map(subtask => 
      executorAgent.run({ subtask, tools: getToolsForAgent(subtask.assignedAgent) })
    )
  );
  
  return results;
};
```

---

## 🧪 Testing Strategy

### Agent Unit Tests

**Test Planner:**
```typescript
test('planner decomposes complex task into subtasks', async () => {
  const input = { task: 'Build a todo app with auth', context: [] };
  const output = await plannerAgent.run(input);
  
  expect(output.subtasks.length).toBeGreaterThan(3);
  expect(output.subtasks.some(s => s.assignedAgent === 'frontend')).toBe(true);
  expect(output.subtasks.some(s => s.assignedAgent === 'backend')).toBe(true);
});
```

**Test Executor:**
```typescript
test('frontend agent creates React component', async () => {
  const subtask = { description: 'Create Button component', tools: ['file_write'] };
  const output = await frontendAgent.run({ subtask });
  
  expect(output.files).toContain('src/components/Button.tsx');
  expect(output.logs).toContain('Component created successfully');
});
```

### Integration Tests

**End-to-End Task:**
```typescript
test('complete task: create landing page', async () => {
  const task = 'Create a landing page with hero section and CTA button';
  const finalState = await oracleGraph.run({ task });
  
  expect(finalState.reviewStatus).toBe('approved');
  expect(finalState.errors).toHaveLength(0);
  expect(fs.existsSync('src/pages/index.tsx')).toBe(true);
}, 300000); // 5 min timeout
```

---

## 📈 Performance Optimization

### Agent Response Caching

Cache LLM responses for identical subtasks:

```typescript
const cache = new Map<string, any>();

const cachedExecutorAgent = async (input: any) => {
  const cacheKey = hash(input.subtask.description);
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  const result = await executorAgent.run(input);
  cache.set(cacheKey, result);
  
  return result;
};
```

### Streaming Responses

Stream agent progress to Antigravity UI:

```typescript
const streamingExecutor = async (subtask: Subtask, onProgress: (msg: string) => void) => {
  onProgress(`Starting: ${subtask.description}`);
  
  const result = await executorAgent.run({ subtask });
  
  onProgress(`Completed: ${subtask.id}`);
  
  return result;
};
```

---

## 🔮 Future Enhancements

### Self-Improving Agents

- **Feedback Loop:** Capture manual corrections from user → Store as negative examples in RAG
- **A/B Testing:** Run two strategies (conservative vs. aggressive) → Measure which completes faster
- **Skill Evolution:** Automatically promote successful subtask executions to reusable skills

### Specialized Agents

- **Data Agent:** Analytics, ETL, data validation
- **Design Agent:** Figma integration, design system adherence
- **Security Agent:** OWASP checks, dependency audits
- **Documentation Agent:** Auto-generate API docs, READMEs

---

**Last Updated:** 2026-03-05  
**Maintained By:** Matheus Petry
