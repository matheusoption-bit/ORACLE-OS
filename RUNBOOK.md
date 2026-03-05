# ORACLE-OS Runbook

> **Operational procedures and troubleshooting guide**

---

## 🚀 Getting Started

### Prerequisites

- **Node.js:** 20.x or higher
- **npm/pnpm:** Latest version
- **Antigravity IDE:** Latest version with MCP support
- **Environment Variables:**
  ```bash
  ANTHROPIC_API_KEY=sk-ant-...
  E2B_API_KEY=e2b_...
  GITHUB_TOKEN=ghp_...
  ```

### Initial Setup

```bash
# 1. Clone repository
git clone https://github.com/matheusoption-bit/ORACLE-OS.git
cd ORACLE-OS

# 2. Run bootstrap script
node bootstrap/oracle-os-bootstrap.js

# 3. Install dependencies
npm install

# 4. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 5. Start development server
npm run dev
```

---

## 🔧 Configuration

### Antigravity MCP Setup

**Location:** `~/.antigravity/mcp-config.json`

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    },
    "e2b": {
      "command": "npx",
      "args": ["-y", "@e2b/mcp-server"],
      "env": {
        "E2B_API_KEY": "e2b_your_key_here"
      }
    }
  }
}
```

### Agent Configuration

**File:** `src/config.ts`

```typescript
export const config: OracleConfig = {
  agents: {
    planner: { 
      model: 'anthropic/claude-3-7-sonnet',
      temperature: 0.7,  // Higher for creative planning
    },
    executor: { 
      model: 'anthropic/claude-3-7-sonnet',
      temperature: 0.2,  // Lower for deterministic execution
    },
    reviewer: { 
      model: 'anthropic/claude-3-7-sonnet',
      temperature: 0.3,  // Balanced for evaluation
    },
  },
  // ...
};
```

---

## 📝 Usage Patterns

### Running a Task

**In Antigravity IDE:**

```typescript
import { createOracleGraph } from './src/graphs/oracle-graph';
import { createInitialState } from './src/state/oracle-state';
import { config } from './src/config';

const graph = createOracleGraph(config);
const initialState = createInitialState(
  'Create a Next.js dashboard with user authentication'
);

const result = await graph.invoke(initialState);
console.log('Final state:', result);
```

### Task Examples

**Frontend Task:**
```
Create a responsive pricing page with 3 tiers (Basic, Pro, Enterprise) using Tailwind CSS
```

**Backend Task:**
```
Implement a REST API for user management with CRUD operations and JWT authentication
```

**Full-Stack Task:**
```
Build a todo app with Next.js frontend, Supabase backend, and real-time updates
```

**DevOps Task:**
```
Set up Docker containerization and GitHub Actions CI/CD pipeline
```

---

## 🔍 Monitoring

### Logs

**Agent Decisions:**
```bash
tail -f monitoring/logs/agents.jsonl
```

**Tool Calls:**
```bash
tail -f monitoring/logs/tools.jsonl
```

### Metrics Dashboard

```bash
# View metrics (requires pandas)
python scripts/view-metrics.py
```

**Sample Output:**
```
╭─────────────────────────────────────╮
│       ORACLE-OS Metrics             │
├─────────────────────────────────────┤
│ Task Completion Rate:    87.5%      │
│ Avg Iterations:          1.3        │
│ Error Rate:              5.2%       │
│ Most Used Tool:          file_write │
│ RAG Accuracy:            92.1%      │
╰─────────────────────────────────────╯
```

---

## ⚠️ Troubleshooting

### Common Issues

#### 1. "MCP Server Not Found"

**Symptom:** Agents fail with tool call errors.

**Solution:**
```bash
# Check MCP server status in Antigravity
cat ~/.antigravity/mcp-config.json

# Verify server is installed
npx -y @modelcontextprotocol/server-github --version

# Restart Antigravity IDE
```

#### 2. "E2B Sandbox Timeout"

**Symptom:** Code execution hangs or times out.

**Solution:**
```typescript
// Increase timeout in config.ts
export const config = {
  // ...
  e2b: {
    timeout: 600000, // 10 minutes
  },
};
```

#### 3. "Reviewer Rejects All Outputs"

**Symptom:** Infinite iteration loop, never approves.

**Solution:**
```typescript
// Lower reviewer temperature (more lenient)
export const config = {
  agents: {
    reviewer: { 
      model: 'anthropic/claude-3-7-sonnet',
      temperature: 0.1,  // More deterministic, less strict
    },
  },
};
```

#### 4. "RAG Returns Irrelevant Results"

**Symptom:** Planner uses wrong skills/examples.

**Solution:**
```bash
# Re-index codebase
npm run rag:reindex

# Check embedding model
cat src/config.ts | grep embeddingModel

# Use better embeddings (if cost allows)
# text-embedding-3-small → text-embedding-3-large
```

---

## 🐞 Debugging

### Enable Verbose Logging

```typescript
// In src/config.ts
export const config = {
  monitoring: {
    enabled: true,
    logLevel: 'debug',  // Change from 'info' to 'debug'
  },
};
```

### Inspect Agent State

```typescript
import { createOracleGraph } from './src/graphs/oracle-graph';

const graph = createOracleGraph(config);

// Add breakpoint/logging
graph.addNode('debug', (state) => {
  console.log('Current state:', JSON.stringify(state, null, 2));
  return state;
});
```

### Test Individual Agents

```typescript
import { plannerAgent } from './src/agents/planner';
import { createInitialState } from './src/state/oracle-state';

const state = createInitialState('Test task');
const plan = await plannerAgent.run(state, config);
console.log('Planner output:', plan);
```

---

## 💾 Backup & Recovery

### Backup Workspace

```bash
# Create timestamped backup
tar -czf backup-$(date +%Y%m%d-%H%M%S).tar.gz workspace/
```

### Restore from Backup

```bash
# Extract backup
tar -xzf backup-20260305-143000.tar.gz

# Verify integrity
ls -lah workspace/
```

### Export Agent Logs

```bash
# Export last 24 hours
cat monitoring/logs/agents.jsonl | \
  jq 'select(.timestamp > "2026-03-04")' > logs-export.jsonl
```

---

## 🚑 Emergency Procedures

### Kill Runaway Agent

```bash
# Find process
ps aux | grep oracle-os

# Kill gracefully
kill -SIGTERM <PID>

# Force kill if needed
kill -SIGKILL <PID>
```

### Rollback Bad Changes

```bash
# View recent commits
git log --oneline -10

# Rollback to safe state
git reset --hard <commit-sha>

# Or revert specific commit
git revert <commit-sha>
```

### Clear Corrupted State

```bash
# Remove cached state
rm -rf .langgraph/

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

---

## 📊 Performance Tuning

### Optimize for Speed

```typescript
// Use faster models for executor
export const config = {
  agents: {
    executor: { 
      model: 'anthropic/claude-3-haiku',  // Faster, cheaper
      temperature: 0.1,
    },
  },
};
```

### Optimize for Quality

```typescript
// Use best models, increase iterations
export const config = {
  agents: {
    planner: { model: 'anthropic/claude-3-opus', temperature: 0.8 },
    executor: { model: 'anthropic/claude-3-7-sonnet', temperature: 0.2 },
    reviewer: { model: 'anthropic/claude-3-opus', temperature: 0.4 },
  },
  maxIterations: 5,  // Allow more retry attempts
};
```

### Enable Caching

```typescript
import { InMemoryCache } from '@langchain/core/caches';

const cache = new InMemoryCache();

const model = new ChatAnthropic({
  cache,  // Enable response caching
});
```

---

## 📚 Resources

- **LangGraph Docs:** https://langchain-ai.github.io/langgraph/
- **Anthropic API:** https://docs.anthropic.com/
- **MCP Specification:** https://modelcontextprotocol.io/
- **E2B Sandboxes:** https://e2b.dev/docs
- **Project Issues:** https://github.com/matheusoption-bit/ORACLE-OS/issues

---

**Last Updated:** 2026-03-05  
**Maintained By:** Matheus Petry
