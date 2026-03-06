'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Terminal } from 'lucide-react';
import { useOracleStore } from '@/stores/oracle.store';

// Coloração por prefixo de log
function colorizeLog(line: string): { timestamp: string; message: string; color: string } {
  // Extrai o timestamp do final: linha vem como "[HH:MM:SS] mensagem"
  const match = line.match(/^\[([^\]]+)\]\s+([\s\S]*)$/);
  const timestamp = match ? `[${match[1]}]` : '';
  const message = match ? match[2] : line;

  const upper = message.toUpperCase();
  const color =
    upper.includes('[ERROR]') || upper.startsWith('ERROR')   ? '#ef4444' :
    upper.includes('[WARN]')  || upper.startsWith('WARN')    ? '#f59e0b' :
    upper.includes('[SUCCESS]') || upper.startsWith('SUCCESS') ? '#10b981' :
    upper.includes('[ORACLE]') || upper.startsWith('[WS]')   ? '#8b5cf6' :
    upper.includes('[PLANNER]')                               ? '#93c5fd' :
    upper.includes('[EXECUTOR]')                              ? '#a78bfa' :
    upper.includes('[SISTEMA]') || upper.includes('[SYSTEM]') ? '#6ee7b7' :
                                                                '#22c55e';
  return { timestamp, message, color };
}

export function TerminalPanel() {
  const { logs } = useOracleStore();
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const clearLogs = () => useOracleStore.setState({ logs: [] });

  // Auto-scroll quando chegam novos logs
  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  return (
    <div className="flex flex-col h-full" style={{ background: '#000' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 h-9 shrink-0"
        style={{ borderBottom: '1px solid var(--glass-border)', background: 'var(--glass-1)' }}
      >
        <div className="flex items-center gap-2">
          <Terminal size={12} style={{ color: 'var(--text-muted)' }} />
          <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>Terminal</span>
          {logs.length > 0 && (
            <span
              className="font-mono text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--glass-2)', color: 'var(--text-muted)' }}
            >
              {logs.length}
            </span>
          )}
        </div>

        <button
          onClick={clearLogs}
          className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-lg transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <Trash2 size={10} />
          Limpar
        </button>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs" style={{ background: '#000' }}>
        {logs.length === 0 ? (
          <span style={{ color: '#27272a' }}>Aguardando logs do sistema…</span>
        ) : (
          <AnimatePresence initial={false}>
            {logs.map((line, i) => {
              const { timestamp, message, color } = colorizeLog(line);
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex gap-2 mb-0.5 leading-5"
                >
                  <span style={{ color: '#3f3f46', flexShrink: 0 }}>{timestamp}</span>
                  <span style={{ color, wordBreak: 'break-all' }}>{message}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer: auto-scroll toggle */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 shrink-0"
        style={{ borderTop: '1px solid var(--glass-border)', background: 'var(--glass-1)' }}
      >
        <input
          id="autoscroll"
          type="checkbox"
          checked={autoScroll}
          onChange={(e) => setAutoScroll(e.target.checked)}
          className="w-3 h-3 accent-purple-500"
        />
        <label htmlFor="autoscroll" className="font-mono text-[10px] cursor-pointer" style={{ color: 'var(--text-muted)' }}>
          Auto-scroll
        </label>
      </div>
    </div>
  );
}
