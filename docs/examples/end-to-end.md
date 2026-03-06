# Fluxo End-to-End ORACLE-OS (Sprint 4)
Aqui detalhamos como ocorre uma iteração completa no ORACLE-OS, desde o recebimento do input do usuário até a aprovação final.

## 1. Input do Usuário
O usuário executa o comando via CLI para inciar a tarefa. 
```bash
npm run dev -- "Create a Button component in React"
```

O arquivo `src/index.ts` inicializa o ambiente, instancia o `OracleState` e invoca o `OracleGraph`.

## 2. Planning (Planner Agent)
O nó Planner recebe o seguinte estado:
```json
{
  "task": "Create a Button component in React",
  "subtasks": [],
  "currentSubtask": 0,
  "results": {},
  "errors": [],
  "reviewStatus": "pending",
  "iterationCount": 0
}
```

O `plannerAgent` (`src/agents/planner.ts`) decompõe a solicitação e retorna uma subtask com `type: "react"` e `assignedAgent: "frontend"`.

## 3. Roteamento e Execução (Executor Agents)
Como o projeto está utilizando o Sprint 4, existe o `executor_router` (`src/graphs/oracle-graph.ts`) que analisa o `subtask.type`. Ao identificar a keyword "react", ele roteia a tarefa diretamente para o **Frontend Executor** (`frontend_executor`). 

O LLM do Executor é invocado contendo apenas suas especialidades via system prompt (foco total em UI, Componentes TSX e Tailwind), bem como as ferramentas de manipulação de arquivo e shell vinculadas. Ele cria o arquivo em `src/components/Button.tsx`. O loop do LangGraph avança a `currentSubtask`. Ao finalizarem todas as subtasks, a transição encaminha o fluxo para o **Reviewer**.

## 4. Revisão e Refinamento (Reviewer Agent)
O **Reviewer Agent** (`src/agents/reviewer.ts`) atua como auditor de QA.

### Cenário A: Falha ou Código Incompleto
O Reviewer verifica que faltou tratamento de erro ou validação visual do componente, e sinaliza uma recusa:
- `reviewStatus = 'needs_revision'`
- `revisionNotes = 'Faltou tratar os paddings corretamente para o Button.tsx e adicionar prop Types.'`

O grafo verifica `reviewStatus`, o `iterationCount` vai para `1`, e o processo retorna resetando `currentSubtask = 0`. O Router encaminha para o Frontend Executor, informando a nota de revisão no Prompt para corrigir os problemas apontados.

### Cenário B: Aprovação Automática Limite (iterationCount >= 3)
Caso o revisor insista após 3 tentativas na falha da API ou código que não funciona:
O Reviewer Agent detecta `iterationCount` batendo o limite configurado (3).
- `reviewStatus` é forçado como `'approved'` e a execução encerra gerando um warning de intervenção manual no `revisionNotes`.

### Cenário C: Aprovação Primária ou Sucesso após Ajustes
A implementação atende aos critérios do `reviewer-prompt.md`:
- Todos os subtasks deram sucessos.
- Sem *secrets*.
- Código tipado corretamente.

- `reviewStatus = 'approved'`
- Fim da Execução.

## 5. Status Final (Terminal Output)
A conclusão é recebida por `src/index.ts` (ou a função chamadora), e um resumo consolidado de sucesso e possíveis notas é impresso em terminal para o operador.
