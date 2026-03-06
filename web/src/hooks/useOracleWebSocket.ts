import { useEffect, useRef, useState } from 'react';
import { useOracleStore } from '../stores/oracle.store';
import { OracleEvent } from '../types/oracle';

const getWsUrl = () => {
  if (typeof window !== 'undefined') {
    return `ws://${window.location.hostname}:3001/ws`;
  }
  return 'ws://localhost:3001/ws';
};

export function useOracleWebSocket(taskId?: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const store = useOracleStore();

  const handleEvent = (event: OracleEvent) => {
    switch (event.type) {
      case 'task:started':
        store.setTaskId(event.taskId);
        store.setTaskStatus('running');
        store.appendMessage({
          id: event.taskId,
          role: 'user',
          content: event.task,
          timestamp: new Date().toISOString()
        });
        store.appendMessage({
          id: `sys-${Date.now()}`,
          role: 'system',
          content: 'Processando requisição...',
          timestamp: new Date().toISOString()
        });
        break;

      case 'plan:created':
        store.setSubtasks(event.subtasks);
        store.appendMessage({
          id: `plan-${Date.now()}`,
          role: 'planner',
          content: `Criei um plano com ${event.subtasks.length} subtasks.`,
          timestamp: new Date().toISOString()
        });
        store.appendLog(`[Planner] Plano de execução criado (${event.subtasks.length} subtasks)`);
        break;

      case 'subtask:started':
        store.setCurrentSubtask(event.index);
        store.appendLog(`[Executor] Iniciando: ${event.title}`);
        break;

      case 'subtask:completed':
        store.setCurrentSubtask(event.index + 1); // Passa pra próxima (visualmente a concluida é a index)
        store.appendMessage({
          id: `exec-${Date.now()}`,
          role: 'executor',
          content: event.output,
          timestamp: new Date().toISOString(),
          streaming: false // Fecha fluxo de streaming possível
        });
        store.appendLog(`[Executor] Finalizou: ${event.output.substring(0, 50)}...`);
        break;

      case 'file:created':
        store.updateFile(event.path, event.content);
        store.appendLog(`[System] Arquivo tocado: ${event.path}`);
        break;

      case 'review:started':
        store.appendMessage({
          id: `rev-${Date.now()}`,
          role: 'reviewer',
          content: `Iniciando verificação detalhada da tentativa ${event.attempt}/3...`,
          timestamp: new Date().toISOString()
        });
        break;

      case 'review:approved':
        store.appendMessage({
          id: `rev-app-${Date.now()}`,
          role: 'reviewer',
          content: 'Aprovado! Todos os requisitos foram implementados corretamente e os testes passaram.',
          timestamp: new Date().toISOString()
        });
        break;

      case 'review:rejected':
        store.appendMessage({
          id: `rev-rej-${Date.now()}`,
          role: 'reviewer',
          content: `Encontrei alguns problemas:\n${event.feedback}\n\nVoltando para execução.`,
          timestamp: new Date().toISOString()
        });
        break;

      case 'task:completed':
        store.setTaskStatus('completed');
        store.appendMessage({
          id: `done-${Date.now()}`,
          role: 'system',
          content: '✅ Tarefa concluída com sucesso.',
          timestamp: new Date().toISOString()
        });
        store.appendLog(`[System] Task finalizada.`);
        break;

      case 'error':
        store.setTaskStatus('error');
        store.appendMessage({
          id: `err-${Date.now()}`,
          role: 'error',
          content: event.message,
          timestamp: new Date().toISOString()
        });
        store.appendLog(`[Error] ${event.message}`);
        break;

      case 'token':
        store.appendTokenToLastMessage(event.token);
        break;
    }
  };

  useEffect(() => {
    let reconnectTimer: NodeJS.Timeout;

    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        store.appendLog('[System] WebSocket connected');
      };

      ws.onclose = () => {
        setIsConnected(false);
        store.appendLog('[System] WebSocket disconnected. Retrying in 3s...');
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket Error', err);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as OracleEvent;
          handleEvent(data);
        } catch (e) {
          console.error('Failed to parse WS message', e);
        }
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isConnected };
}
