# Exemplos de Decomposição de Tarefas — ORACLE-OS Planner

> Exemplos reais de como o Planner Agent transforma requisitos de alto nível em subtasks executáveis.

---

## Exemplo 1: "Create a REST API endpoint for user registration"

**Contexto:** Sistema backend Node.js + Express + PostgreSQL.  
**Plano de execução:** `sequential`

| ID | Título | Tipo | Agente | Prioridade | Dependências |
|----|--------|------|--------|------------|--------------|
| BE-001 | Definir schema de validação | `code` | `backend` | 1 | — |
| BE-002 | Implementar POST /api/users | `code` | `backend` | 1 | BE-001 |
| BE-003 | Hash de senha com bcrypt | `code` | `backend` | 1 | BE-001 |
| BE-004 | Salvar usuário no banco | `code` | `backend` | 2 | BE-002, BE-003 |
| BE-005 | Escrever testes unitários | `code` | `backend` | 2 | BE-004 |
| SEC-001 | Revisar endpoint para vulnerabilidades | `review` | `security` | 3 | BE-004 |

```json
{
  "subtasks": [
    {
      "id": "BE-001",
      "title": "Definir schema de validação do usuário",
      "description": "Criar schema Zod para validar nome (min 2 chars), email (formato válido) e senha (min 8 chars, 1 número)",
      "type": "code",
      "priority": 1,
      "dependsOn": [],
      "assignedAgent": "backend",
      "estimatedDuration": 10,
      "tools": ["file_write"],
      "validationCriteria": "Schema rejeita email inválido e senha fraca, aceita dados corretos"
    },
    {
      "id": "BE-002",
      "title": "Implementar rota POST /api/users",
      "description": "Criar controller Express com middleware de validação e tratamento de erros (409 para email duplicado)",
      "type": "code",
      "priority": 1,
      "dependsOn": ["BE-001"],
      "assignedAgent": "backend",
      "estimatedDuration": 20,
      "tools": ["file_write", "file_read"],
      "validationCriteria": "Rota retorna 201 para input válido, 400 para validação falha, 409 para email duplicado"
    },
    {
      "id": "BE-003",
      "title": "Implementar hash de senha com bcrypt",
      "description": "Instalar bcrypt, criar utility hashPassword(), definir saltRounds=12",
      "type": "code",
      "priority": 1,
      "dependsOn": ["BE-001"],
      "assignedAgent": "backend",
      "estimatedDuration": 10,
      "tools": ["file_write", "shell_npm"],
      "validationCriteria": "Senha nunca salva em plain text, bcrypt.compare() funciona corretamente"
    },
    {
      "id": "BE-004",
      "title": "Integrar persistência no PostgreSQL",
      "description": "Criar INSERT na tabela users usando Prisma/pg, retornar usuário criado sem o campo password",
      "type": "code",
      "priority": 2,
      "dependsOn": ["BE-002", "BE-003"],
      "assignedAgent": "backend",
      "estimatedDuration": 15,
      "tools": ["file_write", "db_insert"],
      "validationCriteria": "Usuário salvo no banco, resposta 201 com id e email (sem senha)"
    },
    {
      "id": "BE-005",
      "title": "Escrever testes unitários do endpoint",
      "description": "Criar testes Vitest cobrindo: registro válido, email duplicado, validação de senha fraca, campos obrigatórios ausentes",
      "type": "code",
      "priority": 2,
      "dependsOn": ["BE-004"],
      "assignedAgent": "backend",
      "estimatedDuration": 20,
      "tools": ["file_write", "shell_npm"],
      "validationCriteria": "Cobertura ≥ 80%, todos os testes passando com mocks do banco"
    },
    {
      "id": "SEC-001",
      "title": "Code review de segurança do endpoint",
      "description": "Checar: rate limiting, SQL injection (se raw queries), exposição de dados sensíveis no response, headers de segurança",
      "type": "review",
      "priority": 3,
      "dependsOn": ["BE-004"],
      "assignedAgent": "security",
      "estimatedDuration": 15,
      "tools": ["file_read"],
      "validationCriteria": "Nenhuma vulnerabilidade crítica encontrada (OWASP Top 10)"
    }
  ],
  "executionPlan": "mixed"
}
```

---

## Exemplo 2: "Fix bug in authentication — users getting logged out randomly"

**Contexto:** Aplicação Next.js com JWT e refresh tokens.  
**Plano de execução:** `sequential`

| ID | Título | Tipo | Agente | Prioridade | Dependências |
|----|--------|------|--------|------------|--------------|
| SEC-001 | Reproduzir e diagnosticar bug | `search` | `backend` | 1 | — |
| SEC-002 | Corrigir expiração do JWT | `code` | `backend` | 1 | SEC-001 |
| SEC-003 | Adicionar refresh token silencioso | `code` | `backend` | 1 | SEC-002 |
| SEC-004 | Revisão de segurança da correção | `review` | `security` | 2 | SEC-003 |
| BE-001 | Escrever testes de regressão | `code` | `backend` | 2 | SEC-003 |

```json
{
  "subtasks": [
    {
      "id": "SEC-001",
      "title": "Diagnosticar causa do logout aleatório",
      "description": "Analisar logs de auth, checar configuração de expiração do JWT (ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY), verificar cliente Next.js para erros 401 não tratados",
      "type": "search",
      "priority": 1,
      "dependsOn": [],
      "assignedAgent": "backend",
      "estimatedDuration": 20,
      "tools": ["file_read", "shell_exec"],
      "validationCriteria": "Causa raiz identificada, hipótese documentada"
    },
    {
      "id": "SEC-002",
      "title": "Corrigir configuração de expiração do token",
      "description": "Ajustar ACCESS_TOKEN_EXPIRY para 15m e REFRESH_TOKEN_EXPIRY para 7d, garantir que variáveis de ambiente estejam corretas",
      "type": "code",
      "priority": 1,
      "dependsOn": ["SEC-001"],
      "assignedAgent": "backend",
      "estimatedDuration": 10,
      "tools": ["file_write", "file_read"],
      "validationCriteria": "Tokens com tempo de expiração correto validados via jwt.verify()"
    },
    {
      "id": "SEC-003",
      "title": "Implementar refresh token silencioso no cliente",
      "description": "Criar interceptor Axios/fetch que detecta 401 e tenta refresh automático antes de redirecionar para login",
      "type": "code",
      "priority": 1,
      "dependsOn": ["SEC-002"],
      "assignedAgent": "backend",
      "estimatedDuration": 25,
      "tools": ["file_write"],
      "validationCriteria": "Usuário permanece logado após expiração do access token, sessão renovada automaticamente"
    },
    {
      "id": "SEC-004",
      "title": "Revisão de segurança — token rotation e CSRF",
      "description": "Verificar: rotation de refresh tokens, proteção CSRF no endpoint de refresh, blacklist de tokens inválidos",
      "type": "review",
      "priority": 2,
      "dependsOn": ["SEC-003"],
      "assignedAgent": "security",
      "estimatedDuration": 15,
      "tools": ["file_read"],
      "validationCriteria": "Token rotation implementado, sem vulnerabilidade de CSRF"
    }
  ],
  "executionPlan": "sequential"
}
```

---

## Exemplo 3: "Build a real-time dashboard with charts for sales data"

**Contexto:** Stack React + Node.js + WebSocket + PostgreSQL.  
**Plano de execução:** `mixed` (backend e frontend em paralelo após setup)

| ID | Título | Tipo | Agente | Prioridade | Dependências |
|----|--------|------|--------|------------|--------------|
| BE-001 | Criar API de dados de vendas | `code` | `backend` | 1 | — |
| BE-002 | Implementar WebSocket server | `code` | `backend` | 1 | BE-001 |
| FE-001 | Estruturar layout do dashboard | `code` | `frontend` | 1 | — |
| FE-002 | Integrar Recharts com dados mockados | `code` | `frontend` | 2 | FE-001 |
| FE-003 | Conectar WebSocket ao frontend | `code` | `frontend` | 2 | FE-002, BE-002 |
| DO-001 | Configurar pipeline CI/CD | `code` | `devops` | 3 | — |

```json
{
  "subtasks": [
    {
      "id": "BE-001",
      "title": "Criar endpoint GET /api/sales com filtros",
      "description": "Query no PostgreSQL com filtros de período (startDate, endDate) e agrupamento por dia/semana/mês. Retornar array de { date, revenue, units }",
      "type": "code",
      "priority": 1,
      "dependsOn": [],
      "assignedAgent": "backend",
      "estimatedDuration": 25,
      "tools": ["file_write", "db_query"],
      "validationCriteria": "Endpoint retorna dados corretos para range de datas, performance < 200ms"
    },
    {
      "id": "BE-002",
      "title": "Implementar WebSocket server para updates em tempo real",
      "description": "Configurar Socket.io no servidor Express. Emitir evento 'sales-update' a cada nova venda registrada. Gerenciar rooms por usuário.",
      "type": "code",
      "priority": 1,
      "dependsOn": ["BE-001"],
      "assignedAgent": "backend",
      "estimatedDuration": 20,
      "tools": ["file_write", "shell_npm"],
      "validationCriteria": "Dashboard atualiza em tempo real ao receber nova venda (latência < 500ms)"
    },
    {
      "id": "FE-001",
      "title": "Criar layout base do dashboard",
      "description": "Estruturar página com: header com filtros de data, grid de KPI cards (revenue, units, growth), área de gráficos. Usar CSS Grid + Recharts.",
      "type": "code",
      "priority": 1,
      "dependsOn": [],
      "assignedAgent": "frontend",
      "estimatedDuration": 20,
      "tools": ["file_write", "shell_npm"],
      "validationCriteria": "Layout responsivo em 1440px e 768px, sem erros no console"
    },
    {
      "id": "FE-002",
      "title": "Integrar Recharts com dados mockados",
      "description": "Criar LineChart (revenue por dia), BarChart (units por produto), PieChart (vendas por categoria). Usar dados mock para validação visual.",
      "type": "code",
      "priority": 2,
      "dependsOn": ["FE-001"],
      "assignedAgent": "frontend",
      "estimatedDuration": 25,
      "tools": ["file_write"],
      "validationCriteria": "3 gráficos renderizados corretamente com animação e tooltips"
    },
    {
      "id": "FE-003",
      "title": "Conectar WebSocket e API real ao dashboard",
      "description": "Substituir dados mock pela API real, configurar Socket.io client para updates em tempo real, adicionar loading states e error boundaries",
      "type": "code",
      "priority": 2,
      "dependsOn": ["FE-002", "BE-002"],
      "assignedAgent": "frontend",
      "estimatedDuration": 20,
      "tools": ["file_write"],
      "validationCriteria": "Dashboard carrega dados reais e atualiza automaticamente sem refresh"
    },
    {
      "id": "DO-001",
      "title": "Configurar GitHub Actions para CI/CD",
      "description": "Criar workflow: lint + test no PR, build + deploy para staging no merge em main",
      "type": "code",
      "priority": 3,
      "dependsOn": [],
      "assignedAgent": "devops",
      "estimatedDuration": 15,
      "tools": ["file_write", "github_create_workflow"],
      "validationCriteria": "Workflow executa com sucesso no primeiro PR após configuração"
    }
  ],
  "executionPlan": "mixed"
}
```

---

*Gerado pelo ORACLE-OS Planner Agent — Sprint 2*  
*Última atualização: 2026-03-05*
