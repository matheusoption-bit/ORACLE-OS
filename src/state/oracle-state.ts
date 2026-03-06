/**
 * ORACLE-OS State Schema — Quadripartite Architecture
 * 
 * Defines the shared state passed between the 4 specialized agents:
 *   Analyst → Reviewer (Architect) → Executor → Synthesis
 * 
 * Each stage produces a typed output document that flows into the next.
 * The state machine supports conditional routing with max 3 iteration guard.
 */

// ─── Subtask Types (preserved from Sprint 10) ────────────────────────────────

export type SubtaskType = "code" | "file" | "search" | "review" | "other";

export interface Subtask {
  id: string;
  title: string;
  description: string;
  type: SubtaskType;
  priority: number; // 1 (crítico) a 5 (baixo)
  dependsOn: string[]; // IDs de subtasks pré-requisito
  assignedAgent: "frontend" | "backend" | "devops" | "data" | "security" | "geral";
  dependencies: string[]; // alias retrocompatível com executor/reviewer
  estimatedDuration: number; // minutos
  tools: string[]; // nomes de ferramentas MCP
  validationCriteria: string;
}

// ─── Stage Output Types (Quadripartite) ──────────────────────────────────────

/**
 * Output do Analyst Node — "Context Document"
 * Contém a análise do codebase, requisitos extraídos e contexto RAG.
 */
export interface ContextDocument {
  /** Resumo da tarefa analisada */
  taskSummary: string;
  /** Contexto RAG recuperado do codebase (ChromaDB/Docling) */
  ragContext: string;
  /** Requisitos funcionais identificados */
  requirements: string[];
  /** Arquivos relevantes identificados no codebase */
  relevantFiles: string[];
  /** Nível de complexidade estimado */
  complexityLevel: 'low' | 'medium' | 'high';
  /** Dependências externas identificadas */
  externalDependencies: string[];
  /** Riscos iniciais identificados */
  initialRisks: string[];
  /** Timestamp da análise */
  timestamp: string;
}

/**
 * Output do Reviewer Node — "Execution Blueprint"
 * Contém o plano aprovado com subtasks, após revisão arquitetural e de segurança.
 */
export interface ExecutionBlueprint {
  /** Status da revisão do blueprint */
  status: 'approved' | 'rejected' | 'needs_revision';
  /** Subtasks decompostas e aprovadas para execução */
  subtasks: Subtask[];
  /** Plano de execução (sequencial, paralelo ou misto) */
  executionPlan: 'sequential' | 'parallel' | 'mixed';
  /** Notas de revisão arquitetural */
  architecturalNotes: string;
  /** Riscos de segurança identificados */
  securityRisks: string[];
  /** Redundâncias identificadas e removidas */
  redundanciesFound: string[];
  /** Feedback para o Analyst (se needs_revision) */
  feedbackToAnalyst?: string;
  /** Timestamp da revisão */
  timestamp: string;
}

/**
 * Output do Executor Node — "Executed Code"
 * Contém os resultados da execução no E2B Sandbox.
 */
export interface ExecutedCode {
  /** Resultados por subtask */
  results: Record<string, ExecutorResult>;
  /** Arquivos modificados no total */
  allFilesModified: string[];
  /** Resultados de testes executados */
  testResults: TestResult[];
  /** Pacotes instalados durante execução */
  packagesInstalled: string[];
  /** Erros capturados durante execução */
  executionErrors: ExecutionError[];
  /** Timestamp da execução */
  timestamp: string;
}

export interface ExecutorResult {
  subtaskId: string;
  status: 'success' | 'partial' | 'failed';
  output: string;
  toolCallsExecuted: string[];
  filesModified: string[];
  timestamp: string;
  parsedTags?: {
    thinking?: string;
    writes: Array<{ content: string; path?: string }>;
    deletes: Array<{ content: string; path?: string }>;
    success?: string;
    error?: string;
  };
  selfCorrectionAttempts?: number;
}

export interface TestResult {
  testFile: string;
  passed: boolean;
  output: string;
  duration?: number;
}

export interface ExecutionError {
  subtaskId: string;
  error: string;
  recoverable: boolean;
  attemptCount: number;
}

/**
 * Output do Synthesis Node — "Final Output"
 * Contém a documentação final, commit messages e changelog.
 */
export interface SynthesisOutput {
  /** Resumo executivo do que foi feito */
  executiveSummary: string;
  /** Mensagens de commit semânticas geradas */
  commitMessages: string[];
  /** Changelog entries geradas */
  changelogEntries: string[];
  /** README updates sugeridas */
  readmeUpdates: string;
  /** Arquivos finais limpos e formatados */
  finalFiles: Array<{ path: string; description: string }>;
  /** Métricas de qualidade */
  qualityMetrics: {
    subtasksCompleted: number;
    subtasksTotal: number;
    testsPassRate: number;
    selfCorrections: number;
  };
  /** Timestamp da síntese */
  timestamp: string;
}

// ─── Pipeline Stage Tracking ─────────────────────────────────────────────────

export type PipelineStage = 'analyst' | 'reviewer' | 'executor' | 'synthesis' | 'completed';

// ─── Main Oracle State (Quadripartite) ───────────────────────────────────────

export interface OracleState {
  /** Tarefa original do usuário */
  task: string;

  /** Estágio atual do pipeline quadripartite */
  currentStage: PipelineStage;

  // ── Stage Outputs ──────────────────────────────────────────────────────────

  /** Output do Analyst Node */
  contextDocument: ContextDocument | null;

  /** Output do Reviewer Node */
  executionBlueprint: ExecutionBlueprint | null;

  /** Output do Executor Node */
  executedCode: ExecutedCode | null;

  /** Output do Synthesis Node */
  synthesisOutput: SynthesisOutput | null;

  // ── Legacy fields (mantidos para retrocompatibilidade) ─────────────────────

  /** Subtasks decompostas (populadas pelo Reviewer via blueprint) */
  subtasks: Subtask[];

  /** Índice da subtask atual sendo executada */
  currentSubtask: number;

  /** Resultados por subtask (populados pelo Executor) */
  results: Record<string, unknown>;

  /** Erros capturados ao longo do pipeline */
  errors: Error[];

  /** Status da revisão (do Reviewer) */
  reviewStatus: 'pending' | 'approved' | 'rejected' | 'needs_revision';

  /** Notas de revisão do Reviewer */
  revisionNotes?: string;

  /** Contador de iterações (guard contra loops infinitos, max 3) */
  iterationCount: number;

  /**
   * Memória de curto prazo compartilhada entre agentes.
   * Cada agente adiciona um resumo de sua decisão ou resultado.
   * Injetado nos prompts dos agentes subsequentes.
   */
  shortTermMemory: string[];
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export const createInitialState = (task: string): OracleState => ({
  task,
  currentStage: 'analyst',

  // Stage outputs
  contextDocument: null,
  executionBlueprint: null,
  executedCode: null,
  synthesisOutput: null,

  // Legacy fields
  subtasks: [],
  currentSubtask: 0,
  results: {},
  errors: [],
  reviewStatus: 'pending',
  iterationCount: 0,
  shortTermMemory: [],
});
