import { useEffect, useRef, useCallback } from 'react';
import { useOracleStore, type WsStatus } from '@/stores/oracle.store';
import type { OracleEvent } from '@/types/oracle.types';

// ─── Config ────────────────────────────────────────────────────────────────

const WS_BASE_URL =
  typeof window !== 'undefined'
    ? `ws://${window.location.hostname}:3001/ws`
    : 'ws://localhost:3001/ws';

const MAX_RETRIES = 5;
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000]; // exponencial

// ─── Hook ──────────────────────────────────────────────────────────────────

export interface UseOracleWebSocketReturn {
  status: WsStatus;
  send: (data: object) => void;
  reconnect: () => void;
}

export function useOracleWebSocket(taskId: string): UseOracleWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const store = useOracleStore();
  const {
    initTask,
    setPlan,
    startSubtask,
    completeSubtask,
    upsertFile,
    appendToken,
    finalizeStreaming,
    setStatus,
    setError,
    completeTask,
    appendMessage,
    appendLog,
    setWsStatus,
  } = store;

  // ── Mapeamento de eventos → actions ─────────────────────────────────────

  const handleEvent = useCallback(
    (event: OracleEvent) => {
      switch (event.type) {
        case 'task:started':
          initTask(event.taskId, event.task);
          break;

        case 'plan:created':
          setPlan(event.subtasks);
          break;

        case 'subtask:started':
          startSubtask(event.index, event.title);
          break;

        case 'subtask:completed':
          completeSubtask(event.index, event.output);
          break;

        case 'file:created': {
          // O evento file:created tem path e content nos tipos
          const fe = event as Extract<OracleEvent, { type: 'file:created' }>;
          upsertFile(fe.path, fe.content);
          appendLog(`[Sistema] Arquivo: ${fe.path}`);
          break;
        }

        case 'token':
          appendToken(event.token);
          break;

        case 'review:started':
          finalizeStreaming();
          setStatus('reviewing');
          appendMessage({
            role: 'reviewer',
            content: `Verificando resultados (tentativa ${event.attempt})...`,
          });
          break;

        case 'review:approved':
          appendMessage({
            role: 'reviewer',
            content: '✅ Implementação aprovada. Todos os requisitos foram atendidos.',
          });
          break;

        case 'review:rejected':
          appendMessage({
            role: 'reviewer',
            content: `❌ Ajustes necessários:\n${event.feedback}\n\nVoltando para execução...`,
          });
          setStatus('running');
          break;

        case 'task:completed':
          finalizeStreaming();
          completeTask(event.metrics);
          break;

        case 'error':
          finalizeStreaming();
          setError(event.message);
          break;

        case 'skill:saved':
          appendLog(`[Sistema] Skill salva: ${event.skillId}`);
          break;

        default:
          appendLog(`[WS] Evento desconhecido: ${(event as OracleEvent).type}`);
      }
    },
    [
      initTask, setPlan, startSubtask, completeSubtask, upsertFile,
      appendToken, finalizeStreaming, setStatus, setError, completeTask,
      appendMessage, appendLog,
    ]
  );

  // ── Conexão com reconnect exponencial ────────────────────────────────────

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setWsStatus('connecting');
    appendLog('[WS] Conectando...');

    const url = `${WS_BASE_URL}?taskId=${encodeURIComponent(taskId)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMountedRef.current) return;
      retriesRef.current = 0;
      setWsStatus('connected');
      appendLog('[WS] Conectado.');
    };

    ws.onmessage = (evt) => {
      if (!isMountedRef.current) return;
      try {
        const data = JSON.parse(evt.data) as OracleEvent;
        handleEvent(data);
      } catch (e) {
        appendLog(`[WS] Erro ao parsear mensagem: ${String(e)}`);
      }
    };

    ws.onerror = () => {
      appendLog('[WS] Erro de conexão.');
    };

    ws.onclose = () => {
      if (!isMountedRef.current) return;
      const retries = retriesRef.current;

      if (retries >= MAX_RETRIES) {
        setWsStatus('failed');
        appendLog(`[WS] Falha após ${MAX_RETRIES} tentativas.`);
        return;
      }

      const delay = RETRY_DELAYS_MS[Math.min(retries, RETRY_DELAYS_MS.length - 1)];
      retriesRef.current = retries + 1;
      setWsStatus('reconnecting');
      appendLog(`[WS] Desconectado. Reconectando em ${delay / 1000}s (tentativa ${retries + 1}/${MAX_RETRIES})...`);

      reconnectTimerRef.current = setTimeout(connect, delay);
    };
  }, [taskId, handleEvent, setWsStatus, appendLog]);

  // ── Lifecycle ──────────────────────────────────────────────────────────

  useEffect(() => {
    isMountedRef.current = true;
    retriesRef.current = 0;
    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Evita reconectar no unmount
        wsRef.current.close();
      }
      setWsStatus('disconnected');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // ── API pública ────────────────────────────────────────────────────────

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      appendLog('[WS] Tentativa de envio sem conexão ativa.');
    }
  }, [appendLog]);

  const reconnect = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }
    retriesRef.current = 0;
    connect();
  }, [connect]);

  return {
    status: store.wsStatus,
    send,
    reconnect,
  };
}
