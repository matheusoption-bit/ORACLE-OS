'use client';

import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, Loader2 } from 'lucide-react';
import { useOracleStore } from '@/stores/oracle.store';

interface ChatInputProps {
  onSend: (text: string) => void;
}

export function ChatInput({ onSend }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { taskStatus } = useOracleStore();

  const isDisabled = taskStatus === 'running' || taskStatus === 'planning' || taskStatus === 'reviewing';
  const canSend = value.trim().length > 0 && !isDisabled;

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    }
  };

  const handleSubmit = () => {
    if (!canSend) return;
    onSend(value.trim());
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="px-4 pb-4 shrink-0">
      <AnimatePresence>
        {isDisabled && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="flex items-center gap-2 mb-2 px-3"
          >
            <Loader2 size={11} className="animate-spin" style={{ color: '#a78bfa' }} />
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              Agente em execução — aguarde…
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
          border: canSend
            ? '1px solid rgba(124,58,237,0.5)'
            : '1px solid var(--glass-border)',
          boxShadow: canSend
            ? '0 0 0 3px rgba(124,58,237,0.10)'
            : 'none',
          opacity: isDisabled ? 0.55 : 1,
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
          placeholder="Mensagem de acompanhamento… (Ctrl+Enter)"
          className="w-full bg-transparent border-none outline-none resize-none text-sm leading-relaxed px-4 pt-3 pb-2"
          style={{
            minHeight: '44px',
            maxHeight: '160px',
            color: 'var(--text-primary)',
            caretColor: '#7c3aed',
            cursor: isDisabled ? 'not-allowed' : 'text',
          }}
        />

        {/* Footer */}
        <div
          className="flex items-center justify-between px-3 pb-2"
        >
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
            Ctrl+Enter para enviar
          </span>

          <motion.button
            onClick={handleSubmit}
            disabled={!canSend}
            whileHover={canSend ? { scale: 1.05 } : {}}
            whileTap={canSend ? { scale: 0.95 } : {}}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200"
            style={{
              background: canSend ? '#7c3aed' : 'var(--glass-2)',
              border: `1px solid ${canSend ? 'rgba(124,58,237,0.6)' : 'var(--glass-border)'}`,
              boxShadow: canSend ? '0 0 12px rgba(124,58,237,0.3)' : 'none',
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
