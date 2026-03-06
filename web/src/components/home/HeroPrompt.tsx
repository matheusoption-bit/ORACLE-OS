'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Loader2 } from 'lucide-react';

const PLACEHOLDERS = [
  'Crie um dashboard de analytics com gráficos interativos...',
  'Construa uma landing page responsiva para meu SaaS...',
  'Refatore o módulo de autenticação para usar JWT...',
  'Gere documentação técnica completa do projeto...',
  'Analise este codebase e identifique code smells...',
];

interface HeroPromptProps {
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
}

export function HeroPrompt({ onSubmit, isLoading }: HeroPromptProps) {
  const [value, setValue] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholderVisible, setPlaceholderVisible] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Placeholder rotativo com fade
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderVisible(false);
      setTimeout(() => {
        setPlaceholderIndex((i) => (i + 1) % PLACEHOLDERS.length);
        setPlaceholderVisible(true);
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Auto-resize textarea
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 240) + 'px';
    }
  };

  const handleSubmit = useCallback(() => {
    if (!value.trim() || isLoading) return;
    onSubmit(value.trim());
  }, [value, isLoading, onSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const charCount = value.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-2xl mx-auto mb-6"
    >
      <div
        className="glass-heavy rounded-3xl overflow-hidden"
        style={{
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.06), 0 32px 64px rgba(0,0,0,0.5)',
        }}
      >
        {/* Textarea com placeholder customizado */}
        <div className="relative px-6 pt-5 pb-3">
          {/* Placeholder animado (só visível quando vazio) */}
          {!value && (
            <AnimatePresence mode="wait">
              <motion.span
                key={placeholderIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: placeholderVisible ? 1 : 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="absolute top-5 left-6 right-6 pointer-events-none font-mono text-base leading-relaxed select-none"
                style={{ color: 'var(--text-muted)' }}
              >
                {PLACEHOLDERS[placeholderIndex]}
              </motion.span>
            </AnimatePresence>
          )}

          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent border-none outline-none resize-none text-base leading-relaxed"
            style={{
              minHeight: '80px',
              maxHeight: '240px',
              color: 'var(--text-primary)',
              caretColor: '#7c3aed',
            }}
            spellCheck={false}
            disabled={isLoading}
          />
        </div>

        {/* Footer do card */}
        <div
          className="flex items-center justify-between px-6 py-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          {/* Contador de caracteres */}
          <span
            className="font-mono text-xs select-none"
            style={{ color: 'var(--text-muted)' }}
          >
            {charCount > 0 ? `${charCount} caracteres` : 'Cmd+Enter para enviar'}
          </span>

          {/* Botão Submit */}
          <motion.button
            onClick={handleSubmit}
            disabled={!value.trim() || isLoading}
            whileHover={value.trim() && !isLoading ? { scale: 1.04 } : {}}
            whileTap={value.trim() && !isLoading ? { scale: 0.97 } : {}}
            className="flex items-center gap-2 px-5 py-2 rounded-xl font-medium text-sm transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            style={
              value.trim() && !isLoading
                ? {
                    background: '#7c3aed',
                    color: '#fff',
                    boxShadow: '0 0 20px rgba(124,58,237,0.35)',
                  }
                : {
                    background: 'var(--glass-2)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--glass-border)',
                  }
            }
          >
            {isLoading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Processando...</span>
              </>
            ) : (
              <>
                <span>Enviar</span>
                <ArrowRight size={14} />
              </>
            )}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
