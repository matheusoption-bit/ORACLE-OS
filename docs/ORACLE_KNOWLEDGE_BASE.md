# ORACLE-OS Knowledge Base (Sprint 9)

Esta documentação descreve a arquitetura, componentes e fluxos de trabalho do **ORACLE-OS**, um sistema de agentes autônomos para desenvolvimento de software, atualizado com as melhorias da **Sprint 9**.

## 1. Visão Geral da Arquitetura

O ORACLE-OS opera sobre uma arquitetura de múltiplos agentes orquestrada por um grafo de estados (`LangGraph`). O sistema é projetado para receber uma tarefa de alto nível, decompô-la em subtasks executáveis, executar cada subtask, revisar os resultados e, finalmente, aprender com o processo para otimizar tarefas futuras.

### Principais Componentes:

| Componente          | Tecnologia/Framework | Responsabilidade                                                                                                |
| ------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Orquestração**    | `LangGraph`          | Gerencia o fluxo de estados entre os agentes (Planner, Executor, Reviewer).                                     |
| **Agentes**         | `LangChain` / `TypeScript` | Unidades de IA especializadas (Planner, Executor, Reviewer) que executam partes específicas do fluxo.           |
| **Backend**         | `Node.js` / `TypeScript` | Executa a lógica principal dos agentes, ferramentas MCP e a comunicação via WebSocket.                          |
| **Frontend**        | `Next.js 14` / `React` | Interface de usuário para submissão de tarefas, visualização de progresso, logs e resultados.                   |
| **Memória (RAG)**   | `ChromaDB`           | Armazena e recupera "skills" (padrões de solução) para acelerar e melhorar a resolução de tarefas futuras.    |
| **Comunicação**     | `WebSocket`          | Fornece atualizações em tempo real do backend para o frontend (status, logs, arquivos gerados).               |
| **Ferramentas (MCP)** | `DynamicStructuredTool` | Ações que os agentes podem executar (leitura/escrita de arquivos, comandos shell, deploy, etc.).                |

### Fluxo de Execução (Grafo de Estados)

O fluxo principal é definido no `oracle-graph.ts` e segue os seguintes passos:

1.  **`START`**: Recebe a tarefa do usuário.
2.  **`planner`**: O **Planner Agent** decompõe a tarefa principal em uma lista de subtasks detalhadas.
3.  **`executor_router`**: Um roteador direciona cada subtask para o agente Executor mais apropriado (`frontend_executor`, `backend_executor` ou `executor` genérico) com base no tipo da subtask.
4.  **`executor`**: O **Executor Agent** (ou sua variante especializada) executa a subtask, utilizando as ferramentas MCP disponíveis para interagir com o ambiente (criar arquivos, rodar comandos, etc.).
5.  **`reviewer`**: Após a conclusão de todas as subtasks, o **Reviewer Agent** analisa os resultados em relação à tarefa original. Ele pode:
    *   **Aprovar (`approved`)**: Se os resultados estiverem corretos.
    *   **Solicitar Revisão (`needs_revision`)**: Se encontrar problemas, enviando o ciclo de volta ao `executor` com notas de revisão.
    *   **Rejeitar (`rejected`)**: Em caso de falha grave.
6.  **`save_skill`**: Se aprovado, o estado final da tarefa é processado. O **Skill Generator** (novo na Sprint 9) analisa a solução e, se identificar um padrão reutilizável, gera e salva uma nova "skill" no RAG.
7.  **`END`**: O ciclo é concluído.

## 2. Novas Funcionalidades (Sprint 9)

A Sprint 9 introduziu melhorias significativas em inteligência, observabilidade e robustez.

### 2.1. Geração Inteligente de Skills (`skill-generator`)

Anteriormente, o RAG salvava um snapshot bruto da tarefa concluída. A nova implementação utiliza um LLM para analisar a tarefa, as subtasks e os resultados, e então **abstrai um padrão de solução genérico**.

> O `skill-generator.ts` agora extrai um título semântico, descrição, tags e um trecho de código relevante, criando uma "skill" de alta qualidade e verdadeiramente reutilizável. Ele também evita a criação de skills duplicadas através de uma verificação de similaridade semântica.

### 2.2. Indexação Dinâmica do RAG (`dynamic-indexer`)

Para garantir que o RAG sempre tenha o conhecimento mais atualizado da base de código, o `dynamic-indexer.ts` foi criado. Ele monitora o sistema de arquivos em tempo real (`fs.watch`) e **re-indexa automaticamente qualquer arquivo modificado** no `ChromaDB`. Isso garante que os agentes sempre trabalhem com a versão mais recente do código.

### 2.3. Novas Ferramentas MCP (`extended-tools`)

Três novas ferramentas foram adicionadas para expandir as capacidades dos agentes, especialmente para tarefas de DevOps:

| Ferramenta          | Parâmetros                               | Descrição                                                                                             |
| ------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `db_migrate`        | `tool`, `command`, `cwd`                 | Executa migrações de banco de dados usando Prisma (`deploy`, `reset`) ou scripts SQL.                 |
| `test_run`          | `runner`, `pattern`, `coverage`, `cwd`   | Roda suítes de teste (Vitest, Jest) e retorna um relatório estruturado com resultados e cobertura.    |
| `deployment_deploy` | `target`, `environment`, `customScript`  | Realiza deploy da aplicação em plataformas como Vercel e Railway, ou via scripts customizados.        |

### 2.4. Melhorias no Frontend

-   **Visualização do Grafo (`AgentGraphView.tsx`)**: Um novo componente que renderiza o grafo de estados em tempo real, mostrando qual agente está ativo e o status de cada nó (pendente, ativo, concluído).
-   **Painel de Métricas (`MetricsPanel.tsx`)**: Exibe métricas em tempo real, como custo estimado, duração, progresso das subtasks e, mais importante, a **distribuição de tokens consumidos** por cada tipo de agente (Planner, Executor, Reviewer).
-   **Terminal Aprimorado (`TerminalPanel.tsx`)**: O terminal agora inclui funcionalidades de **busca por texto** e **filtro por nível de log** (Error, Warn, Info, Debug), facilitando a depuração.

### 2.5. Logging Estruturado

O `logger.ts` foi refatorado para emitir logs em **formato JSON estruturado**. Além da mensagem, cada log agora inclui metadados como `timestamp`, `level`, e contexto adicional (`agent`, `tool`, `file`), facilitando a análise e a integração com sistemas de monitoramento como Datadog ou OpenTelemetry.

## 3. Estrutura de Diretórios Relevante

```
/home/ubuntu/oracle-os-correct/
├── src/
│   ├── agents/         # Lógica dos agentes (planner, executor, reviewer)
│   ├── graphs/         # Definição do grafo de estados (oracle-graph.ts)
│   ├── monitoring/     # Logging, métricas e tracking de custos
│   ├── prompts/        # Templates de prompts para os agentes
│   ├── rag/            # Lógica do RAG (skill-generator, dynamic-indexer)
│   ├── state/          # Definição do estado do grafo (oracle-state.ts)
│   └── tools/          # Ferramentas MCP (tool-registry.ts, extended-tools.ts)
├── web/                # Aplicação Frontend (Next.js)
│   ├── src/
│   │   ├── components/ # Componentes React
│   │   └── stores/     # Gerenciamento de estado com Zustand (oracle.store.ts)
└── docs/               # Documentação do projeto (este arquivo)
```
