# ORACLE-OS Agents (Sprint 9)

Esta documentação detalha as responsabilidades, prompts e ferramentas de cada agente no ecossistema ORACLE-OS.

## 1. Planner Agent

O **Planner** é o primeiro agente a atuar no ciclo de vida de uma tarefa. Sua principal responsabilidade é a **decomposição da tarefa** em um plano de subtasks executáveis.

-   **Arquivo**: `src/agents/planner.ts`
-   **Modelo de IA Padrão**: `claude-3-5-sonnet` (alta capacidade de raciocínio)
-   **Input**: A tarefa de alto nível fornecida pelo usuário.
-   **Output**: Uma lista (`Subtask[]`) de subtasks, onde cada uma contém:
    -   `id`: Identificador único.
    -   `title`: Título conciso da subtask.
    -   `type`: Categoria da subtask (ex: `api`, `react-component`, `database-migration`). Usado pelo `executor_router`.
    -   `assignedAgent`: Agente sugerido (legado, `type` é preferencial).
    -   `expectedOutput`: Descrição clara do que se espera como resultado.
    -   `dependencies`: Lista de IDs de outras subtasks que devem ser concluídas antes desta.

> **Estratégia de Prompt**: O prompt do Planner (`src/prompts/planner-prompt.ts`) instrui o modelo a pensar passo a passo, considerar as ferramentas disponíveis e criar um plano detalhado e coerente. Ele também utiliza o RAG para buscar "skills" relevantes que possam acelerar o planejamento.

## 2. Executor Agents

Os **Executors** são responsáveis por executar as subtasks individuais geradas pelo Planner. Na Sprint 9, o Executor genérico foi especializado para otimizar a execução de tarefas de frontend e backend.

-   **Arquivos**: `src/agents/executor.ts`, `frontend-executor.ts`, `backend-executor.ts`
-   **Modelo de IA Padrão**: `claude-3-haiku` (rápido e com bom custo-benefício para execução de tarefas)
-   **Input**: Uma única `Subtask`.
-   **Output**: Um objeto de resultado contendo o status (`completed` ou `failed`), o output textual da execução, e uma lista de ferramentas utilizadas e arquivos modificados.

### Roteamento (`executor_router`)

O `oracle-graph.ts` utiliza uma função de roteamento para selecionar o Executor correto com base no campo `type` da subtask:

-   Se `type` contém `react`, `next`, ou `component` → `frontend_executor`
-   Se `type` contém `api`, `node`, ou `python` → `backend_executor`
-   Caso contrário → `executor` (genérico)

### Ferramentas Disponíveis (MCP)

Os executores têm acesso a um conjunto de ferramentas (`DynamicStructuredTool`) para interagir com o ambiente. As ferramentas são registradas no `tool-registry.ts` e atribuídas a cada tipo de agente.

| Ferramenta            | Agentes com Acesso                               |
| --------------------- | ------------------------------------------------ | 
| `file_read`           | Todos                                            |
| `file_write`          | Todos                                            |
| `shell_exec`          | Todos                                            |
| `web_search`          | `frontend`, `backend`, `geral`                   |
| `github_create_file`  | `backend`, `devops`                              |
| `db_migrate` (nova)   | `backend`, `devops`, `data`                      |
| `test_run` (nova)     | `frontend`, `backend`, `security`, `geral`       |
| `deployment_deploy` (nova) | `devops`                                         |

## 3. Reviewer Agent

O **Reviewer** atua como um engenheiro de qualidade de software. Ele analisa o trabalho concluído pelos Executores para garantir que a tarefa original foi cumprida com sucesso.

-   **Arquivo**: `src/agents/reviewer.ts`
-   **Modelo de IA Padrão**: `claude-3-5-sonnet` (alta capacidade de análise crítica)
-   **Input**: O estado completo da tarefa (`OracleState`), incluindo a tarefa original, as subtasks e todos os resultados.
-   **Output**: Um status de revisão (`approved`, `needs_revision`, `rejected`) e notas de revisão (`revisionNotes`).

> **Ciclo de Revisão**: Se o Reviewer retorna `needs_revision`, o grafo de estados reinicia o ciclo de execução a partir da primeira subtask. O `iterationCount` é incrementado, e as `revisionNotes` são fornecidas ao Planner e aos Executores para que possam corrigir o trabalho. O ciclo pode se repetir até 3 vezes antes de ser forçadamente concluído.
ído.

