# ORACLE-OS Runbook (Sprint 9)

Este runbook fornece instruções para configuração, execução e troubleshooting do sistema ORACLE-OS.

## 1. Configuração do Ambiente

### Pré-requisitos

-   Node.js v20.x ou superior
-   npm / pnpm
-   Docker (para ChromaDB)
-   Credenciais de API para os modelos de IA (Anthropic, OpenAI, etc.)

### Passos de Instalação

1.  **Clonar o Repositório**:
    ```bash
    git clone https://github.com/matheusoption-bit/ORACLE-OS.git
    cd ORACLE-OS
    ```

2.  **Instalar Dependências**:
    O projeto é um monorepo. Instale as dependências da raiz e do workspace `web`.
    ```bash
    npm install
    npm install --prefix web
    ```

3.  **Configurar Variáveis de Ambiente**:
    Crie um arquivo `.env` na raiz do projeto a partir do `.env.example` e preencha as chaves de API:
    ```env
    # .env
    ANTHROPIC_API_KEY="sk-ant-xxxxxxxx"
    # OPENAI_API_KEY="sk-xxxxxxxx"
    # ... outras chaves

    # URL do ChromaDB (se rodando localmente com Docker)
    CHROMA_URL="http://localhost:8000"
    ```

4.  **Iniciar o ChromaDB com Docker**:
    Para persistência do RAG, inicie o container do ChromaDB.
    ```bash
    docker run -d -p 8000:8000 chromadb/chroma
    ```

## 2. Executando o Sistema

O sistema consiste em dois processos principais: o **backend dos agentes** e o **frontend da web**.

1.  **Iniciar o Backend**:
    Em um terminal, inicie o servidor principal que executa o grafo de agentes e o WebSocket.
    ```bash
    npm run dev
    ```
    Isso iniciará o processo com `tsx` para recarregamento automático em caso de alterações.

2.  **Iniciar o Frontend**:
    Em outro terminal, inicie a aplicação Next.js.
    ```bash
    npm run web:dev
    ```

3.  **Acessar a Interface**:
    Abra seu navegador e acesse `http://localhost:3000`.

## 3. Troubleshooting

### Problemas Comuns

-   **Erro `ChromaDB offline` ou `fetch failed`**:
    -   **Causa**: O backend não consegue se conectar ao container do ChromaDB.
    -   **Solução**: Verifique se o container Docker do ChromaDB está em execução (`docker ps`). Certifique-se de que a `CHROMA_URL` no arquivo `.env` está correta e acessível a partir do seu ambiente de desenvolvimento.

-   **Agente travado em um loop de revisão (`needs_revision`)**:
    -   **Causa**: O Reviewer está consistentemente insatisfeito com o trabalho do Executor, e o Executor não consegue atender às solicitações de revisão.
    -   **Solução**: Analise os logs no **Terminal Panel** do frontend. As `revisionNotes` do Reviewer darão uma pista do problema. Pode ser necessário ajustar o prompt do Executor ou fornecer um exemplo mais claro na tarefa inicial.

-   **Alto consumo de tokens/custo**:
    -   **Causa**: Tarefas muito complexas ou mal definidas podem levar a um planejamento excessivo ou a múltiplos ciclos de revisão.
    -   **Solução**: Utilize o **Metrics Panel** para identificar qual agente está consumindo mais tokens. Se for o Planner, tente quebrar a tarefa em partes menores. Se for o Reviewer, o problema pode estar na qualidade da execução.

### Logs e Monitoramento (Sprint 9)

Com o logging estruturado, a depuração ficou mais fácil. Todos os logs são emitidos como JSON para o console. Para uma visualização mais amigável, utilize o **Terminal Panel** no frontend, que oferece:

-   **Filtro por Nível**: Isole `ERROR`, `WARN`, `INFO` ou `DEBUG` para focar nos eventos relevantes.
-   **Busca**: Procure por termos específicos (ex: nome de um arquivo, ID de uma subtask) para rastrear o fluxo de uma operação.

### Re-indexação Manual do RAG

Após um `git pull` ou uma grande alteração manual na base de código, o `dynamic-indexer` pode não capturar todas as mudanças. Para forçar uma re-indexação completa:

> Esta funcionalidade ainda não está exposta via API, mas pode ser acionada programaticamente chamando a função `reindexDirectory(rootDir)` no backend.
