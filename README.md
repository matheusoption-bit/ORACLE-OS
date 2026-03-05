# ORACLE-OS

> **Multi-Agent Development Operating System inspired by Manus 1.6 Max**

Plataforma de agentes autônomos para desenvolvimento de software com orquestração LangGraph, integração MCP, e sandboxes E2B. Projetado para funcionar nativamente no **Antigravity IDE**.

---

## 🎯 Vision

OracleOS automatiza o ciclo completo de desenvolvimento:

```
User Task → [Planner] → [Executors] → [Reviewer] → Production Code
```

**Key Features:**
- 🧠 **Multi-Agent Orchestration** (LangGraph state machines)
- 🛠️ **MCP Integration** (GitHub, filesystem, browser, database tools)
- 📦 **E2B Sandboxes** (isolated code execution)
- 📚 **RAG Pipeline** (codebase understanding + skill library)
- 📊 **Monitoring** (metrics, logs, debugging)

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+ and **npm/pnpm**
- **Antigravity IDE** with MCP support
- **API Keys:** Anthropic, E2B, GitHub

### Installation

```bash
# 1. Clone repository
git clone https://github.com/matheusoption-bit/ORACLE-OS.git
cd ORACLE-OS

# 2. Run bootstrap
node bootstrap/oracle-os-bootstrap.js

# 3. Install dependencies
npm install

# 4. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 5. Start development
npm run dev
```

---

## 🏗️ Architecture

### Agent Hierarchy

```
PLANNER → EXECUTOR → REVIEWER
```

See [ORACLE_KNOWLEDGE_BASE.md](./ORACLE_KNOWLEDGE_BASE.md) for detailed architecture.

---

## 📚 Documentation

| File | Description |
|------|-------------|
| [ORACLE_KNOWLEDGE_BASE.md](./ORACLE_KNOWLEDGE_BASE.md) | Architecture & patterns |
| [AGENTS.md](./AGENTS.md) | Agent specifications |
| [RUNBOOK.md](./RUNBOOK.md) | Operations & troubleshooting |
| [skills/](./skills/) | Reusable task patterns |

---

## 🛠️ Technology Stack

- **Orchestration:** [LangGraph](https://langchain-ai.github.io/langgraph/)
- **LLMs:** [Anthropic Claude](https://www.anthropic.com/)
- **Tools:** [MCP](https://modelcontextprotocol.io/)
- **Sandboxes:** [E2B](https://e2b.dev/)
- **RAG:** ChromaDB + Docling

---

## 📝 License

MIT © 2026 Matheus Petry

---

**Built with ❤️ for Antigravity IDE**
