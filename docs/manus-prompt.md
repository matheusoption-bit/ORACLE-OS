## Prompt Otimizado para Evolução do ORACLE-OS

**Contexto:** O projeto ORACLE-OS é um sistema de agentes de IA autônomos inspirado no Manus 1.6 Max, com backend em Node.js/TypeScript + LangGraph e frontend em Next.js 14. Ele visa automatizar o ciclo completo de desenvolvimento de software, desde a tarefa do usuário até o código de produção, utilizando uma orquestração de agentes (Planner → Executor → Reviewer), integração com MCP (Model Context Protocol), sandboxes E2B para execução de código isolada e um pipeline RAG para compreensão da base de código e recuperação de habilidades.

**Objetivo da Sessão Futura:** Evoluir o projeto ORACLE-OS, tanto no backend quanto no frontend, com foco em aprimorar a inteligência dos agentes, a experiência do usuário e a robustez do sistema. O orçamento para esta sessão futura é de aproximadamente 1800 créditos.

## Arquitetura Atual (Resumo)

### Backend (Node.js/TypeScript + LangGraph)

*   **Orquestração de Agentes:** Utiliza LangGraph para gerenciar o fluxo de trabalho entre os agentes Planner, Executor (genérico, frontend, backend) e Reviewer. O fluxo inclui re-execução de subtarefas em caso de `needs_revision` e um limite de iterações.
*   **Agentes:**
    *   **Planner:** Recebe a tarefa do usuário, consulta o RAG para tarefas similares, decompõe em subtarefas e as atribui a executores especializados.
    *   **Executors (Frontend/Backend/Genérico):** Executam as subtarefas, acessam ferramentas MCP (filesystem, shell, browser, GitHub, database) e executam código em sandboxes E2B.
    *   **Reviewer:** Valida as saídas, executa testes e aprova ou solicita iteração.
*   **RAG Pipeline:** Indexa a base de código (Docling + ChromaDB) e uma biblioteca de habilidades (tarefas bem-sucedidas) para fornecer contexto aos agentes.
*   **Ferramentas MCP:** Abstração para interação com o ambiente (ex: `file_*`, `shell_*`, `browser_*`, `github_*`, `db_*`).
*   **Monitoramento:** `CostTracker` para estimativa e rastreamento de tokens/custo, `logger` para decisões de agentes e chamadas de ferramentas, `metrics` para taxa de conclusão e iterações.
*   **Segurança:** Sandboxes E2B isoladas, acesso restrito à rede e sistema de arquivos, whitelist de comandos shell, PATs com escopo mínimo para GitHub.

### Frontend (Next.js 14)

*   **Interface:** Construído com React, Next.js 14, TailwindCSS e Shadcn/UI.
*   **Componentes:** `HeroTitle`, `HeroPrompt`, `ModeSelector`, `ModelSelector` na página inicial. Componentes de workspace como `ChatInput`, `FileTree`, `CodeEditor`, `TerminalPanel`, `PlanView`, `PreviewPanel`, `SubtaskProgress`, `Workbench`.
*   **Comunicação:** Utiliza `/api/proxy` para interagir com o backend e WebSockets (`useOracleWebSocket.ts`) para atualizações em tempo real.
*   **Estado:** Gerenciamento de estado com `zustand` (`oracle.store.ts`).
*   **Visualização:** Exibe tarefas recentes (atualmente mockadas), status e permite a entrada de novas tarefas.

## Áreas de Evolução Propostas

### Backend (Node.js/TypeScript + LangGraph)

1.  **Aprimoramento da Inteligência dos Agentes:**
    *   **Planner:** Melhorar a capacidade de decomposição de tarefas complexas em subtarefas mais granulares e a atribuição inteligente aos executores corretos, considerando o contexto e as habilidades disponíveis. Explorar o uso de modelos de linguagem mais avançados para o planejamento.
    *   **Executors:** Aumentar a robustez dos executores para lidar com erros de forma mais graciosa, realizar depuração autônoma e aprender com execuções anteriores. Implementar mecanismos para que os executores possam solicitar esclarecimentos ao Planner ou ao usuário quando necessário.
    *   **Reviewer:** Aprimorar a capacidade do Reviewer de validar o código gerado, incluindo a execução de testes mais sofisticados (unitários, integração, e2e) e a análise de qualidade de código (linting, padrões). Permitir que o Reviewer forneça feedback mais detalhado para as iterações.

2.  **RAG Pipeline e Gerenciamento de Habilidades:**
    *   **Indexação Dinâmica:** Implementar a indexação dinâmica de novos arquivos e modificações na base de código em tempo real, garantindo que o RAG esteja sempre atualizado com o estado mais recente do projeto.
    *   **Geração de Habilidades:** Desenvolver um mecanismo para que o sistema possa gerar novas habilidades a partir de tarefas concluídas com sucesso, além de apenas salvá-las. Isso pode envolver a abstração de padrões de solução.

3.  **Monitoramento e Observabilidade:**
    *   **Integração de Métricas em Tempo Real:** Conectar as métricas de custo e desempenho (`CostTracker`, `metrics.ts`) a um sistema de monitoramento mais visual (ex: Prometheus/Grafana, ou um painel simples no frontend), permitindo que o usuário acompanhe o progresso e o custo das tarefas em tempo real.
    *   **Logging Estruturado Aprimorado:** Garantir que todos os logs (agentes, ferramentas, erros) sejam emitidos em um formato estruturado (JSON) consistente, facilitando a análise e depuração.

4.  **Expansão de Ferramentas MCP:**
    *   **Novas Ferramentas:** Propor e implementar novas ferramentas MCP que possam ser úteis para os agentes, como `db_migrate` (para migrações de banco de dados), `test_run` (para execução de testes unitários/integração), ou `deployment_deploy` (para deploy em ambientes específicos).

### Frontend (Next.js 14)

1.  **Experiência do Usuário (UX) e Visualização:**
    *   **Visualização do Grafo de Estados:** Desenvolver um componente interativo que visualize o estado atual do LangGraph, mostrando qual agente está ativo, quais subtarefas foram concluídas e o caminho percorrido. Isso pode ser feito usando bibliotecas como React Flow ou D3.js.
    *   **Feedback em Tempo Real:** Implementar atualizações em tempo real no frontend sobre o progresso das subtarefas, chamadas de ferramentas e resultados parciais, utilizando WebSockets (`useOracleWebSocket.ts`).
    *   **Painel de Métricas:** Criar um painel simples para exibir as métricas de monitoramento (custo, taxa de conclusão, iterações) de forma clara e compreensível.

2.  **Funcionalidades do Workspace:**
    *   **Integração do Editor de Código:** Aprimorar a integração do Monaco Editor (`CodeEditor.tsx`) para permitir que os agentes (ou o usuário) possam visualizar e editar arquivos diretamente no frontend, com destaque de sintaxe e, se possível, sugestões básicas.
    *   **Visualização da Árvore de Arquivos:** Melhorar o componente `FileTree.tsx` para ser mais interativo, permitindo navegação, criação/exclusão de arquivos/pastas e visualização de status (modificado, novo).
    *   **Terminal Interativo:** Desenvolver um componente de terminal (`TerminalPanel.tsx`) que exiba a saída dos comandos executados pelos agentes nas sandboxes E2B, e que permita ao usuário interagir (opcionalmente) com o ambiente da sandbox.

3.  **Gerenciamento de Estado:**
    *   **Persistência de Tarefas:** Implementar a persistência das tarefas recentes (`MOCK_TASKS` em `page.tsx`) no armazenamento local do navegador ou em uma API de backend, para que o usuário não perca o histórico ao recarregar a página.

## Diretrizes para o Manus

*   **Priorize a Modularidade:** Todas as novas funcionalidades devem ser implementadas de forma modular, com componentes e serviços bem definidos, facilitando a manutenção e futuras expansões.
*   **Testabilidade:** Escreva testes unitários e de integração para as novas funcionalidades, garantindo a estabilidade do sistema.
*   **Documentação:** Atualize a documentação relevante (`ORACLE_KNOWLEDGE_BASE.md`, `AGENTS.md`, `RUNBOOK.md`) com as mudanças arquiteturais e novas funcionalidades.
*   **Revisão de Código:** O Manus deve realizar uma auto-revisão do código, buscando otimizações, clareza e aderência aos padrões de código existentes.
*   **Comunicação:** Em caso de dúvidas ou necessidade de decisões arquiteturais significativas, o Manus deve comunicar-se claramente, apresentando as opções e suas implicações.
*   **Orçamento:** Mantenha o orçamento de ~1800 créditos em mente, priorizando as tarefas de maior impacto e valor. Evite execuções desnecessárias de código ou instalações de dependências que não contribuam diretamente para o objetivo.

## Entregáveis Esperados

*   Código-fonte atualizado no repositório, com as novas funcionalidades implementadas.
*   Testes unitários e de integração para as novas funcionalidades.
*   Documentação atualizada, incluindo diagramas se necessário.
*   Um resumo das mudanças implementadas e os benefícios esperados.

---

**Observação:** Este prompt serve como um guia. O Manus tem autonomia para refinar as tarefas e propor soluções alternativas que melhor atendam ao objetivo de evolução do ORACLE-OS, sempre justificando suas decisões.
