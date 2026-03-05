# ORACLE-OS Knowledge Base

> **Architectural decisions, patterns, and context for ORACLE-OS multi-agent system**

## 🎯 Vision

OracleOS is a **Manus 1.6 Max-inspired** agentic development platform designed to operate within **Antigravity IDE** with full access to:

- **MCP (Model Context Protocol)** servers (GitHub, filesystem, browser, databases)
- **E2B sandboxes** for code execution and testing
- **RAG pipelines** for codebase understanding and skill retrieval
- **Multi-agent orchestration** with LangGraph state machines

---

## 🏗️ Core Architecture

### Agent Hierarchy

```
┌─────────────────────────────────────────┐
│         PLANNER AGENT                   │
│  - Receives user task                   │
│  - Queries RAG for similar tasks        │
│  - Decomposes into subtasks             │
│  - Assigns to specialized agents        │
└──────────────┬──────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│        EXECUTOR AGENTS                   │
│  ┌────────────┐  ┌────────────┐         │
│  │  Frontend  │  │  Backend   │         │
│  │   Agent    │  │   Agent    │  ...    │
│  └────────────┘  └────────────┘         │
│  - Execute subtasks                      │
│  - Access MCP tools (file, shell, etc)  │
│  - Run code in E2B sandboxes            │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│         REVIEWER AGENT                   │
│  - Validates outputs                     │
│  - Runs tests                            │
│  - Approves or requests iteration        │
└──────────────────────────────────────────┘
```

---

## 🧠 State Machine Design (LangGraph)

### State Schema

```typescript
interface OracleState {
  task: string;
  subtasks: Subtask[];
  currentSubtask: number;
  results: Record<string, any>;
  errors: Error[];
  reviewStatus: 'pending' | 'approved' | 'rejected';
  iterationCount: number;
}
```

### Graph Flow

```
[START] → Planner → (subtasks) → Executor Loop → Reviewer → [END]
                         ↑                            │
                         └────────(rejected)──────────┘
```

---

## 🛠️ Tool Prefixes (MCP Convention)

| Prefix | Category | Examples |
|--------|----------|----------|
| `file_*` | Filesystem | `file_read`, `file_write`, `file_list` |
| `shell_*` | Command execution | `shell_exec`, `shell_npm`, `shell_git` |
| `browser_*` | Web automation | `browser_navigate`, `browser_click`, `browser_screenshot` |
| `github_*` | GitHub API | `github_create_pr`, `github_list_issues` |
| `db_*` | Database | `db_query`, `db_insert` |

**Implementation:** Executor agents select tools by querying RAG with task description + available tool list.

---

## 📚 RAG Pipeline

### Indexing Strategy

1. **Codebase Chunking**
   - Parse files with Docling (PDF, DOCX, code)
   - Chunk at function/class level
   - Embed with `text-embedding-3-large`
   - Store in ChromaDB with metadata (file path, language, timestamps)

2. **Skill Library**
   - Store successful task executions as "skills"
   - Format: `Task → Steps → Tools → Validation → Output`
   - Embed task descriptions for retrieval

3. **Retrieval at Runtime**
   ```python
   query = f"How to {user_task}"
   results = vectorstore.similarity_search(query, k=5)
   context = [r.page_content for r in results]
   ```

---

## 🔒 Security & Sandboxing

### E2B Sandbox Rules

- All code execution happens in **isolated E2B containers**
- Network access restricted to:
  - Package registries (npm, PyPI)
  - User-approved APIs (stored in `config/allowed-domains.json`)
- File writes limited to `/workspace` directory
- Timeout: 5 minutes per execution

### MCP Tool Safety

- `file_*` tools: Limited to `/workspace` and `/src` (no system paths)
- `shell_*` tools: Whitelist commands (no `rm -rf`, `sudo`, etc.)
- `github_*` tools: Require PAT with minimal scopes (repo, read:org)

---

## 📊 Monitoring & Observability

### Metrics Tracked

```typescript
interface Metrics {
  taskCompletionRate: number;      // % of tasks completed without manual intervention
  avgIterations: number;            // Planner → Executor → Reviewer cycles
  toolUsage: Record<string, number>; // Tool call frequency
  errorRate: number;                // % of subtasks that failed
  ragAccuracy: number;              // % of retrieved skills that were used
}
```

### Logging

- All agent decisions logged to `monitoring/logs/agents.jsonl`
- Tool calls logged to `monitoring/logs/tools.jsonl`
- Structured format for analysis with pandas/DuckDB

---

## 🚀 Deployment

### Local Development (Antigravity IDE)

```bash
# 1. Install dependencies
npm install

# 2. Configure MCP servers in Antigravity settings
# Add GitHub MCP, Filesystem MCP, E2B MCP

# 3. Start dev server
npm run dev

# 4. Open Antigravity chat and trigger agents
"Create a Next.js dashboard with real-time data visualization"
```

### Production (Self-Hosted)

- Deploy as Docker container with mounted `/workspace` volume
- Connect to external ChromaDB instance for persistent RAG
- Use Redis for agent state management (multi-instance)
- Expose REST API for task submission (FastAPI or Express)

---

## 📖 References

- **LangGraph Docs:** https://langchain-ai.github.io/langgraph/
- **MCP Specification:** https://modelcontextprotocol.io/
- **E2B Sandboxes:** https://e2b.dev/docs
- **Docling (RAG):** https://github.com/docling-project/docling
- **Manus Inspiration:** https://manus.ai/ (proprietary, used as design reference)

---

## 🔄 Evolution Plan

### Phase 1: Foundation (Current)
- ✅ Bootstrap project structure
- ✅ Define agent hierarchy
- ✅ Implement basic LangGraph state machine
- ⏳ Connect to MCP servers in Antigravity

### Phase 2: Execution
- ⏳ Build executor agents (frontend, backend, devops)
- ⏳ Integrate E2B sandboxes for code execution
- ⏳ Implement tool selection logic (RAG-driven)

### Phase 3: Intelligence
- ⏳ Index codebase with Docling + ChromaDB
- ⏳ Build skill library (successful task → reusable pattern)
- ⏳ Implement reviewer agent with automated testing

### Phase 4: Production
- ⏳ Add monitoring dashboard (metrics + logs)
- ⏳ Deploy as self-hosted service
- ⏳ Build REST API for external integrations

---

**Last Updated:** 2026-03-05  
**Maintained By:** Matheus Petry
