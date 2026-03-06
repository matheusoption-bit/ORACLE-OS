'use client';

/**
 * ChatInput — Input de chat com intervenção do usuário (Sprint 10)
 *
 * Evolução:
 * - Permite envio de mensagens DURANTE execução (intervenção humano-agente)
 * - Mensagens são enviadas via WebSocket (user:message) para o backend
 * - Indicador visual diferenciado quando em modo intervenção vs. follow-up
 * - Suporte a Ctrl+Enter e Enter para envio
 * - Textarea auto-resize com limite de altura
 */

import { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, Loader2, MessageCircle, AlertCircle } from 'lucide-react';
import { useOracleStore } from '@/stores/oracle.store';

interface ChatInputProps {
  /** Callback para envio de mensagem (follow-up ou nova task) */
  onSend: (text: string) => void;
  /** Callback para envio via WebSocket (intervenção durante execução) */
  onSendWs?: (text: string) => void;
}

export function ChatInput({ onSend, onSendWs }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { taskStatus, appendMessage } = useOracleStore();

  // Determina o modo do input
  const isExecuting = taskStatus === 'running' || taskStatus === 'planning' || taskStatus === 'reviewing';
  const isIdle = taskStatus === 'idle' || taskStatus === 'completed' || taskStatus === 'error';

  // Em modo intervenção, o input fica habilitado mesmo durante execução
  const canType = true; // Sempre pode digitar
  const canSend = value.trim().length > 0;

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    }
  };

  const handleSubmit = useCallback(() => {
    if (!canSend) return;
    const text = value.trim();

    if (isExecuting && onSendWs) {
      // Modo intervenção: envia via WebSocket para o agente em execução
      onSendWs(text);
      appendMessage({
        role: 'user',
        content: `💬 [Intervenção] ${text}`,
      });
    } else {
      // Modo follow-up: envia como mensagem normal
      onSend(text);
      appendMessage({
        role: 'user',
        content: text,
      });
    }

    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [canSend, value, isExecuting, onSendWs, onSend, appendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter ou Cmd+Enter para enviar
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
      return;
    }
    // Enter simples também envia (sem Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Placeholder e estilo dinâmico baseado no modo
  const placeholder = isExecuting
    ? 'Enviar instrução ao agente em execução… (Enter)'
    : 'Mensagem de acompanhamento… (Enter)';

  const borderColor = isExecuting
    ? canSend
      ? 'rgba(245,158,11,0.5)'  // Amarelo para intervenção
      : 'rgba(245,158,11,0.2)'
    : canSend
      ? 'rgba(124,58,237,0.5)'  // Roxo para follow-up
      : 'var(--glass-border)';

  const glowColor = isExecuting
    ? canSend ? '0 0 0 3px rgba(245,158,11,0.10)' : 'none'
    : canSend ? '0 0 0 3px rgba(124,58,237,0.10)' : 'none';

  const buttonColor = isExecuting
    ? canSend ? '#f59e0b' : 'var(--glass-2)'
    : canSend ? '#7c3aed' : 'var(--glass-2)';

  const buttonBorder = isExecuting
    ? canSend ? 'rgba(245,158,11,0.6)' : 'var(--glass-border)'
    : canSend ? 'rgba(124,58,237,0.6)' : 'var(--glass-border)';

  return (
    <div className="px-4 pb-4 shrink-0">
      {/* Status indicator */}
      <AnimatePresence>
        {isExecuting && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="flex items-center gap-2 mb-2 px-3"
          >
            <Loader2 size={11} className="animate-spin" style={{ color: '#a78bfa' }} />
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              Agente em execução
            </span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full ml-auto"
              style={{
                background: 'rgba(245,158,11,0.12)',
                color: '#f59e0b',
                border: '1px solid rgba(245,158,11,0.25)',
              }}
            >
              <MessageCircle size={9} className="inline mr-1" style={{ verticalAlign: 'middle' }} />
              intervenção ativa
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="rounded-2xl overflow-hidden transition-all duration-200"
        style={{
          background: 'rgba(255,255,255,0.05)',
          backdropFilter: 'blur(var(--blur-xl))',
          WebkitBackdropFilter: 'blur(var(--blur-xl))',
          border: `1px solid ${borderColor}`,
          boxShadow: glowColor,
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-transparent border-none outline-none resize-none text-sm leading-relaxed px-4 pt-3 pb-2"
          style={{
            minHeight: '44px',
            maxHeight: '160px',
            color: 'var(--text-primary)',
            caretColor: isExecuting ? '#f59e0b' : '#7c3aed',
            cursor: 'text',
          }}
        />

        {/* Footer */}
        <div className="flex items-center justify-between px-3 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
              {isExecuting ? 'Enter para intervir' : 'Enter para enviar'}
            </span>
            {isExecuting && (
              <span className="text-[10px] font-mono flex items-center gap-1" style={{ color: '#f59e0b' }}>
                <AlertCircle size={9} />
                modo intervenção
              </span>
            )}
          </div>

          <motion.button
            onClick={handleSubmit}
            disabled={!canSend}
            whileHover={canSend ? { scale: 1.05 } : {}}
            whileTap={canSend ? { scale: 0.95 } : {}}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200"
            style={{
              background: buttonColor,
              border: `1px solid ${buttonBorder}`,
              boxShadow: canSend
                ? `0 0 12px ${isExecuting ? 'rgba(245,158,11,0.3)' : 'rgba(124,58,237,0.3)'}`
                : 'none',
              cursor: canSend ? 'pointer' : 'not-allowed',
            }}
          >
            <ArrowUp size={13} style={{ color: canSend ? '#fff' : 'var(--text-muted)' }} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
