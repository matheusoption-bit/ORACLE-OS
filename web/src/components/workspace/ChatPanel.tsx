'use client';

/**
 * ChatPanel — Painel de chat do ORACLE-OS (Sprint 10)
 *
 * Evolução:
 * - ChatInput agora suporta intervenção via WebSocket (onSendWs)
 * - Mensagens do usuário durante execução são enviadas ao agente em tempo real
 */

import { useEffect, useRef, useCallback } from 'react';
import { useOracleStore } from '@/stores/oracle.store';
import { MessageBubble } from './MessageBubble';
import { PlanView } from './PlanView';
import { SubtaskProgress } from './SubtaskProgress';
import { ChatInput } from './ChatInput';
import type { ChatMessage } from '@/types/oracle.types';

interface ChatPanelProps {
  taskId: string;
  /** Função para enviar mensagem via WebSocket (intervenção) */
  sendUserMessage?: (content: string) => void;
}

export function ChatPanel({ taskId: _taskId, sendUserMessage }: ChatPanelProps) {
  const { messages, subtasks } = useOracleStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll sempre que novas mensagens chegam
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handler para follow-up do ChatInput (quando não está executando)
  const handleSend = useCallback((text: string) => {
    // Adiciona como mensagem do usuário no store
    // Em uma versão futura, pode iniciar nova task via API
    useOracleStore.getState().appendMessage({ role: 'user', content: text });
  }, []);

  // Handler para intervenção via WebSocket (quando está executando)
  const handleSendWs = useCallback((text: string) => {
    if (sendUserMessage) {
      sendUserMessage(text);
    }
  }, [sendUserMessage]);

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: '#080808',
        borderRight: '1px solid var(--glass-border)',
      }}
    >
      {/* Área de mensagens (scroll) */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Mensagens vazias */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
              style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)' }}
            >
              🔮
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              As mensagens do agente aparecerão aqui
            </p>
          </div>
        )}

        {/* Lista de mensagens */}
        <div className="py-2">
          {messages.map((msg: ChatMessage) => (
            <MessageBubble
              key={msg.id}
              role={msg.role as Parameters<typeof MessageBubble>[0]['role']}
              content={msg.content}
              timestamp={msg.timestamp}
              streaming={msg.streaming}
            />
          ))}
        </div>

        {/* PlanView inline (aparece quando subtasks chegam) */}
        {subtasks.length > 0 && <PlanView />}

        {/* Anchor para auto-scroll */}
        <div ref={bottomRef} className="h-2" />
      </div>

      {/* SubtaskProgress (sticky durante execução) */}
      <SubtaskProgress />

      {/* Chat Input (fixo na base) — com suporte a intervenção */}
      <ChatInput onSend={handleSend} onSendWs={handleSendWs} />
    </div>
  );
}
