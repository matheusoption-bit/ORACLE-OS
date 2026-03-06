import { EventEmitter } from 'events';
import { createOracleGraph, costTracker } from '../graphs/oracle-graph.js';
import { OracleState } from '../state/oracle-state.js';
import { BaseMessage } from '@langchain/core/messages';

/**
 * Adapter que conecta o modelo do ORACLE-OS (LangGraph) a um sistema de eventos
 * que o servidor Express envia para o frontend via WebSocket.
 *
 * Sprint 10: Emite eventos agent:cost para métricas em tempo real
 *            e suporta mensagens do usuário via user:message
 */
export class OracleBridge extends EventEmitter {
  private graph: ReturnType<typeof createOracleGraph>;
  private pendingUserMessage: string | null = null;
  private userMessageResolver: ((msg: string) => void) | null = null;

  constructor() {
    super();
    this.graph = createOracleGraph();
  }

  /**
   * Inicia uma task no ORACLE-OS, roteando todos os eventos pra esse bridge
   */
  async startTask(taskId: string, prompt: string, mode: string = 'Desenvolver app') {
    this.emit('task:started', { taskId, task: prompt });

    const initialState = {
      task: prompt,
      subtasks: [],
      currentSubtask: 0,
      results: {},
      errors: [],
      reviewStatus: 'pending',
      revisionNotes: '',
      iterationCount: 0,
      shortTermMemory: [],
      files: {}
    };

    // Rastreia custos parciais e emite eventos em tempo real
    let lastEmittedCost = 0;
    const costInterval = setInterval(() => {
      try {
        const report = costTracker.getTaskReport(taskId) ?? costTracker.getTaskReport('current');
        if (report && report.totalCostUSD !== lastEmittedCost) {
          lastEmittedCost = report.totalCostUSD;
          this.emit('agent:cost', {
            taskId,
            totalCostUSD: report.totalCostUSD,
            tokensPlanner: report.planner?.tokens ?? 0,
            tokensExecutor: report.executor?.tokens ?? 0,
            tokensReviewer: report.reviewer?.tokens ?? 0,
            totalTokens: (report.planner?.tokens ?? 0) + (report.executor?.tokens ?? 0) + (report.reviewer?.tokens ?? 0),
          });
        }
      } catch {
        // Ignora erros de relatório parcial
      }
    }, 2000); // Emite a cada 2 segundos
    
    try {
      const stream = await this.graph.stream(initialState, {
        configurable: { thread_id: taskId },
        streamMode: "values"
      });

      for await (const stateData of stream) {
        const state = stateData as OracleState;
        
        // Se temos novos subtasks vindo do planner (primeira iteracao)
        if (state.subtasks && state.subtasks.length > 0 && state.currentSubtask === 0) {
          this.emit('plan:created', { subtasks: state.subtasks });
        }

        // Se uma task atualizou
        if (state.currentSubtask > 0 && state.subtasks[state.currentSubtask - 1]) {
           const sub = state.subtasks[state.currentSubtask - 1];
           const output = (state.results[sub.id] as any)?.output || 'Concluído';
           this.emit('subtask:completed', { 
             index: state.currentSubtask - 1, 
             output
           });
        }
        
        // Se estamos em processo de review
        if (state.reviewStatus === 'approved') {
          this.emit('review:approved');
        } else if (state.reviewStatus === 'rejected') {
          this.emit('review:rejected', { feedback: state.revisionNotes });
        }

        // Emite custo parcial após cada mudança de estado
        try {
          const report = costTracker.getTaskReport(taskId) ?? costTracker.getTaskReport('current');
          if (report) {
            this.emit('agent:cost', {
              taskId,
              totalCostUSD: report.totalCostUSD,
              tokensPlanner: report.planner?.tokens ?? 0,
              tokensExecutor: report.executor?.tokens ?? 0,
              tokensReviewer: report.reviewer?.tokens ?? 0,
              totalTokens: (report.planner?.tokens ?? 0) + (report.executor?.tokens ?? 0) + (report.reviewer?.tokens ?? 0),
            });
          }
        } catch {
          // Ignora
        }
      }

      // Emite custo final
      try {
        const finalReport = costTracker.getTaskReport(taskId) ?? costTracker.getTaskReport('current');
        if (finalReport) {
          this.emit('agent:cost', {
            taskId,
            totalCostUSD: finalReport.totalCostUSD,
            tokensPlanner: finalReport.planner?.tokens ?? 0,
            tokensExecutor: finalReport.executor?.tokens ?? 0,
            tokensReviewer: finalReport.reviewer?.tokens ?? 0,
            totalTokens: (finalReport.planner?.tokens ?? 0) + (finalReport.executor?.tokens ?? 0) + (finalReport.reviewer?.tokens ?? 0),
            isFinal: true,
          });
        }
      } catch {
        // Ignora
      }

      this.emit('task:completed', { metrics: {} });
    } catch (e) {
      console.error(e);
      this.emit('error', { message: e instanceof Error ? e.message : String(e) });
    } finally {
      clearInterval(costInterval);
    }
  }

  /**
   * Recebe uma mensagem do usuário via WebSocket.
   * Pode ser usada para intervenção durante a execução.
   */
  handleUserMessage(message: string) {
    this.pendingUserMessage = message;
    if (this.userMessageResolver) {
      this.userMessageResolver(message);
      this.userMessageResolver = null;
    }
    this.emit('user:message:received', { message });
  }

  /**
   * Aguarda uma mensagem do usuário (para intervenção).
   * Retorna a mensagem quando recebida ou null após timeout.
   */
  async waitForUserMessage(timeoutMs: number = 60000): Promise<string | null> {
    if (this.pendingUserMessage) {
      const msg = this.pendingUserMessage;
      this.pendingUserMessage = null;
      return msg;
    }

    return new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        this.userMessageResolver = null;
        resolve(null);
      }, timeoutMs);

      this.userMessageResolver = (msg: string) => {
        clearTimeout(timer);
        resolve(msg);
      };
    });
  }

  // Helper para simular streaming token-by-token de um agente específico
  emitToken(token: string) {
    this.emit('token', { token });
  }

  emitFileUpdate(path: string, content: string) {
    this.emit('file:created', { path, content });
  }
}
