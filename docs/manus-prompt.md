# Prompt Otimizado para Evolução do ORACLE-OS por Manus

**Contexto:** O projeto ORACLE-OS é um sistema de agentes de IA autônomos, com backend em Node.js/TypeScript + LangGraph e frontend em Next.js 14. Ele visa automatizar o ciclo de desenvolvimento de software, orquestrando agentes (Planner, Executor, Reviewer) que utilizam RAG para compreensão da base de código e um conjunto de ferramentas para interagir com o ambiente.

**Objetivo da Sessão Futura:** Evoluir o projeto ORACLE-OS, tanto no backend quanto no frontend, com foco em aprimorar a inteligência dos agentes, a experiência do usuário e a robustez do sistema. O orçamento para esta sessão futura é de aproximadamente 1800 créditos.

---

## Arquitetura Atual (Análise do Repositório)

### Backend (Node.js/TypeScript + LangGraph)

- **Orquestração de Agentes:** Utiliza `@langchain/langgraph` para gerenciar o fluxo de estado (`OracleState`) entre os agentes. O grafo principal (`oracle-graph.ts`) define a sequência: `Planner` → `executor_router` → `Executor` (especializado) → `Reviewer`. O ciclo pode se repetir até 3 vezes (`iterationCount`) se o `Reviewer` solicitar revisões (`needs_revision`).

- **Agentes:**
    - **Planner (`planner.ts`):** Decompõe a tarefa do usuário em `subtasks` estruturadas (schema Zod). Utiliza um `PromptEnhancer` para refinar a tarefa inicial e o `rag-pipeline.ts` para buscar *skills* (soluções passadas) relevantes, que são injetadas no prompt como contexto.
    - **Executors (`executor.ts`, `frontend-executor.ts`, `backend-executor.ts`):** Agentes especializados que recebem uma `subtask` e a executam através de um loop de chamadas de ferramentas (`runToolLoop`). Um `executor_router` no grafo principal direciona a `subtask` para o executor correto com base em palavras-chave no tipo da tarefa (ex: 'react', 'api').
    - **Reviewer (`reviewer.ts`):** Avalia os resultados consolidados de todas as `subtasks` em relação à tarefa original. Pode aprovar a solução, rejeitá-la ou solicitar uma nova iteração com notas de revisão (`revisionNotes`).

- **RAG (Retrieval-Augmented Generation):**
    - **Gerenciamento de Skills (`skill-manager.ts`):** Salva tarefas bem-sucedidas como arquivos JSON no diretório `rag/skills/`.
    - **Vector Store (`vector-store.ts`):** Utiliza ChromaDB para indexar e buscar *skills* por similaridade semântica.
    - **Pipeline (`rag-pipeline.ts`):** Orquestra a busca e formatação das *skills* para serem usadas pelo `Planner`.

- **Ferramentas (Tools):** O `tool-registry.ts` define um conjunto de `DynamicStructuredTool` do LangChain para interações com o ambiente, como `file_read`, `file_write`, e `shell_exec`. As ferramentas são atribuídas a cada tipo de agente (frontend, backend, etc.).

- **API e Comunicação:** Um servidor Express (`api/server.ts`) expõe um endpoint `/api/task` para iniciar novas tarefas. A classe `OracleBridge` atua como um `EventEmitter`, traduzindo os eventos do grafo LangGraph para eventos que são enviados ao frontend via WebSocket (`ws`).

- **Monitoramento:** Inclui um `CostTracker` para rastrear o consumo de tokens e o custo em USD por agente e um sistema de `logger` para registrar as operações.

### Frontend (Next.js 14 + Zustand)

- **Estrutura:** Aplicação Next.js 14 com App Router, TypeScript, e Tailwind CSS.

- **Gerenciamento de Estado:** Utiliza Zustand (`stores/oracle.store.ts`) para gerenciar o estado global da aplicação, incluindo o status da tarefa, mensagens do chat, arquivos gerados, logs e métricas. O estado é persistido parcialmente no `localStorage`.

- **Comunicação com Backend:**
    - A submissão inicial da tarefa é feita via uma rota de API proxy (`/api/proxy/route.ts`) que repassa a requisição para o backend Express.
    - O hook `useOracleWebSocket.ts` estabelece uma conexão WebSocket para receber atualizações em tempo real do `OracleBridge` do backend. Ele mapeia os eventos recebidos (ex: `plan:created`, `subtask:completed`) para as actions do store Zustand, atualizando a UI reativamente.

- **Componentes da UI (`components/`):
    - **Layout:** A página de workspace (`workspace/[taskId]/page.tsx`) usa um `WorkspaceLayout` com painéis redimensionáveis (`react-resizable-panels`).
    - **Workbench:** O painel principal (`Workbench.tsx`) contém abas para diferentes visualizações: `Preview` (para HTML), `Code` (com Monaco Editor), `Terminal`, `Files` (árvore de arquivos), `Grafo` (visualização do `AgentGraphView`) e `Métricas` (`MetricsPanel`).
    - **Interação:** O `ChatPanel` exibe o fluxo de mensagens e o `PlanView` mostra o plano de subtasks. O `SubtaskProgress` exibe a subtarefa atual.

---

## Diretrizes e Áreas de Evolução para a Próxima Sessão

### 1. Evolução do Backend

- **Inteligência de Auto-Correção no Executor:**
    - **Tarefa:** Modifique o `runToolLoop` no `executor.ts`. Após uma chamada de ferramenta (`shell_exec`, por exemplo) falhar, em vez de desistir, o agente deve ler a mensagem de erro (`stderr`), e se for um erro conhecido (ex: `command not found`, `missing dependency`), ele deve tentar uma ação corretiva, como instalar a dependência com `npm install` ou `pip install`.
    - **Justificativa:** Aumenta a autonomia e a taxa de sucesso, reduzindo a necessidade de intervenção manual ou ciclos de revisão por erros simples.

- **Memória de Curto Prazo no Grafo:**
    - **Tarefa:** Adicione um novo campo ao `OracleState`, como `shortTermMemory: string[]`. A cada passo do grafo (Planner, Executor, Reviewer), adicione um resumo da decisão ou do resultado a este array. O conteúdo desta memória deve ser injetado nos prompts dos agentes subsequentes.
    - **Justificativa:** Melhora a consciência contextual entre os agentes, permitindo que o Reviewer saiba o que o Executor tentou e que o Executor saiba o porquê de uma revisão ter sido solicitada, além das `revisionNotes`.

- **Geração de Testes Unitários pelo Reviewer:**
    - **Tarefa:** Expanda a lógica do `reviewer.ts`. Se o `Reviewer` aprovar um código (`.ts`, `.tsx`, `.py`), ele deve, como um passo final antes de concluir, gerar um arquivo de teste unitário correspondente (ex: `component.test.tsx`) usando Vitest ou Jest, e executá-lo via `shell_exec`.
    - **Justificativa:** Garante a qualidade e a robustez do código gerado, automatizando a criação de uma suíte de testes e prevenindo regressões futuras.

### 2. Evolução do Frontend

- **Visualização Interativa da Árvore de Arquivos (`FileTree`):
    - **Tarefa:** Transforme o `FileTree.tsx` de uma simples lista para um componente interativo. Ao clicar em um arquivo, ele deve ser aberto na aba `Code` (atualizando o `activeFile` no `oracle.store`). Adicione ícones para indicar o tipo de arquivo.
    - **Justificativa:** Melhora drasticamente a usabilidade, permitindo que o usuário navegue e inspecione o código gerado de forma intuitiva, similar a um IDE.

- **Conectar o Painel de Métricas em Tempo Real:**
    - **Tarefa:** Atualmente, o `MetricsPanel.tsx` só exibe dados completos no final. Crie novos eventos no `OracleBridge` (backend) para emitir o custo parcial após cada chamada de agente (ex: `agent:cost`). No frontend, crie uma action no `oracle.store` para receber esses eventos e atualizar as métricas em tempo real.
    - **Justificativa:** Fornece feedback imediato sobre o consumo de recursos, permitindo que o usuário monitore os custos e a eficiência da tarefa enquanto ela está em execução.

- **Implementar o `ChatInput` para Intervenção do Usuário:**
    - **Tarefa:** Atualmente, o `ChatInput` é um mock. Implemente a lógica para que, ao enviar uma mensagem, ela seja enviada ao backend via WebSocket. No backend, o `OracleBridge` deve capturar essa mensagem e, potencialmente, pausar o grafo e apresentar a mensagem ao agente ativo para que ele possa pedir esclarecimentos ou receber novas instruções.
    - **Justificativa:** Habilita a colaboração humano-agente, uma capacidade essencial para resolver ambiguidades e guiar o sistema em tarefas complexas.

### 3. Diretrizes Gerais para a Execução

- **Foco na Modularidade:** Implemente novas funcionalidades em módulos ou componentes bem definidos.
- **Atualização da Documentação:** Ao final, atualize os arquivos `AGENTS.md` e `RUNBOOK.md` para refletir as novas capacidades.
- **Commits Atômicos:** Faça commits pequenos e focados para cada funcionalidade implementada (ex: `feat(backend): implement self-correction in executor`, `feat(frontend): make file tree interactive`).
- **Gerenciamento de Orçamento:** Monitore o consumo de créditos e priorize as tarefas de maior impacto. Use modelos de linguagem mais baratos para tarefas mais simples, se aplicável.

## Entregáveis Esperados

1.  Código-fonte atualizado no repositório com as funcionalidades de backend e frontend implementadas.
2.  Arquivo `docs/manus-prompt.md` atualizado com este novo conteúdo.
3.  Arquivos `AGENTS.md` e `RUNBOOK.md` atualizados.
4.  Um commit final com a mensagem `feat: evolve oracle-os with enhanced agent intelligence and UX` `interactive UI` `UX` `UI`.
