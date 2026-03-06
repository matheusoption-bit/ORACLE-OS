import { EventEmitter } from 'events';
import { createOracleGraph } from '../graphs/oracle-graph.js';
import { OracleState } from '../state/oracle-state.js';
import { BaseMessage } from '@langchain/core/messages';

/**
 * Adapter que conecta o modelo do ORACLE-OS (LangGraph) a um sistema de eventos
 * que o servidor Express envia para o frontend via WebSocket.
 */
export class OracleBridge extends EventEmitter {
  private graph: ReturnType<typeof createOracleGraph>;

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
      files: {} // Depende de como a store de métricas é populada
    };

    // Para streaming token a token a partir dos agentes (do llm), isso pode exigir
    // configuração nos modelos. Por enquanto, escutamos on-node-start/end
    
    try {
      // Como a stream do langgraph funciona
      const stream = await this.graph.stream(initialState, {
        configurable: { thread_id: taskId },
        streamMode: "values"
      });

      for await (const stateData of stream) {
        // Intercepta e despacha as mudanças no state (ex: step do planner, executor etc.)
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
      }

      this.emit('task:completed', { metrics: {} });
    } catch (e) {
      console.error(e);
      this.emit('error', { message: e instanceof Error ? e.message : String(e) });
    }
  }

  // Helper para simular streaming token-by-token de um agente específico
  // (Para implementação ideal requer Injected Callbacks no ChatModel)
  emitToken(token: string) {
    this.emit('token', { token });
  }

  emitFileUpdate(path: string, content: string) {
    this.emit('file:created', { path, content });
  }
}
