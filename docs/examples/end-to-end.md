# Fluxo End-to-End — ORACLE-OS Sprint 4

> Exemplo completo do fluxo `START → Planner → Executor → Reviewer → END`

---

## Task: `"Create a Button component in React"`

### 1. Inicialização (START)

```
╔══════════════════════════════════════╗
║         ORACLE-OS  v0.1.0            ║
╚══════════════════════════════════════╝
🧠 Planner  : claude-3-7-sonnet
⚙️  Executor : llama-3.3-70b
✅ Reviewer : gemini-2.0-flash

🚀 Task recebida: "Create a Button component in React"
```

---

### 2. Planner (Decomposição)

O Planner decompõe a task em subtasks atômicas:

```json
{
  "subtasks": [
    {
      "id": "FE-001",
      "title": "Criar componente Button.tsx",
      "description": "Criar componente React tipado com variantes (primary, secondary, danger) e props size (sm/md/lg)",
      "type": "code",
      "priority": 1,
      "dependsOn": [],
      "assignedAgent": "frontend",
      "estimatedDuration": 15,
      "tools": ["file_write"],
      "validationCriteria": "Componente renderiza sem erros, aceita props variant e size"
    },
    {
      "id": "FE-002",
      "title": "Criar stories Storybook para Button",
      "description": "Documentar as variantes do Button com Storybook CSF3",
      "type": "file",
      "priority": 2,
      "dependsOn": ["FE-001"],
      "assignedAgent": "frontend",
      "estimatedDuration": 10,
      "tools": ["file_write"],
      "validationCriteria": "Stories renderizam no Storybook sem erro"
    },
    {
      "id": "FE-003",
      "title": "Escrever testes unitários do Button",
      "description": "Testes com Vitest + Testing Library cobrindo click, disabled, variantes",
      "type": "code",
      "priority": 2,
      "dependsOn": ["FE-001"],
      "assignedAgent": "frontend",
      "estimatedDuration": 15,
      "tools": ["file_write", "shell_exec"],
      "validationCriteria": "100% de cobertura dos props, todos os testes passando"
    }
  ],
  "executionPlan": "mixed"
}
```

---

### 3. Executor Router

O grafo roteia com base em `assignedAgent`:

```
planner → (FE-001: frontend) → frontend_executor
```

O `frontendExecutorAgent` executa o tool-calling loop:

```
🧠 MODEL: "Vou criar Button.tsx com variantes e TypeScript..."
→ file_write: src/components/Button.tsx
```

**Arquivo criado (`src/components/Button.tsx`):**
```tsx
import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger';
type ButtonSize   = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center rounded font-medium transition-colors';
  const variants: Record<ButtonVariant, string> = {
    primary:   'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
    danger:    'bg-red-600 text-white hover:bg-red-700',
  };
  const sizes: Record<ButtonSize, string> = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default Button;
```

---

### 4. Loop de Subtasks

```
⚙️  Executing [frontend] 1/3 — Criar componente Button.tsx     → ✅ success
⚙️  Executing [frontend] 2/3 — Criar stories Storybook         → ✅ success
⚙️  Executing [frontend] 3/3 — Escrever testes unitários       → ✅ success
```

Quando `currentSubtask >= subtasks.length` → vai para `reviewer`.

---

### 5. Reviewer (Validação)

```
✅ Reviewing... (tentativa 1/3)
```

O Reviewer analisa `state.results` e decide:

```json
{
  "status": "approved",
  "issues": [],
  "summary": "Button.tsx criado com TypeScript correto, variantes implementadas, testes passando. Stories documentadas."
}
```

---

### 6. Resultado Final (END)

```
══════════════════════════════════════════
✅ STATUS FINAL: APPROVED
══════════════════════════════════════════

📋 Subtasks executadas: 3
  ✅ [FE-001] Criar componente Button.tsx
  ✅ [FE-002] Criar stories Storybook para Button
  ✅ [FE-003] Escrever testes unitários do Button

🔁 Iterações: 1
══════════════════════════════════════════
```

---

## Cenário com `needs_revision`

Se na primeira revisão o Reviewer encontrar um problema:

```json
{
  "status": "needs_revision",
  "revisionNotes": "Em Button.tsx: export default está faltando. Adicionar na última linha.",
  "summary": "Implementação quase completa, 1 problema menor."
}
```

O grafo volta ao `frontend_executor` com `currentSubtask = 0` e `revisionNotes` disponível no estado.
O Executor lê `state.revisionNotes` no próximo ciclo e corrige o problema.

---

## Diagrama do Fluxo

```
START
  │
  ▼
┌─────────┐   sem subtasks   END
│ Planner │─────────────────▶
└────┬────┘
     │ roteia por assignedAgent
     ▼
┌────────────────────┐
│  executor_router   │
│  frontend / backend│
│  / genérico        │
└────────┬───────────┘
         │ subtask por subtask
         ▼
┌──────────────┐   currentSubtask < length
│   Executor   │◀──────────────────────────┐
└──────┬───────┘                           │
       │ currentSubtask >= length          │
       ▼                                   │
┌──────────────┐  needs_revision + iter<3  │
│   Reviewer   │───────────────────────────┘
└──────┬───────┘
       │ approved / rejected / iter>=3
       ▼
      END
```

---

*Gerado pelo ORACLE-OS — Sprint 4*
*Data: 2026-03-05*
