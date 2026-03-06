'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Terminal, Search, X } from 'lucide-react';
import { useOracleStore } from '@/stores/oracle.store';

// ─── Tipos de nível de log ────────────────────────────────────────────────────
type LogLevel = 'all' | 'error' | 'warn' | 'info' | 'debug';

const LEVEL_COLORS: Record<string, string> = {
  error:    '#ef4444',
  warn:     '#f59e0b',
  success:  '#10b981',
  oracle:   '#8b5cf6',
  ws:       '#8b5cf6',
  planner:  '#93c5fd',
  executor: '#a78bfa',
  sistema:  '#6ee7b7',
  system:   '#6ee7b7',
  reviewer: '#34d399',
  default:  '#22c55e',
};

// ─── Coloração por prefixo de log ─────────────────────────────────────────────
function colorizeLog(line: string): { timestamp: string; message: string; color: string; level: LogLevel } {
  const match = line.match(/^\[([^\]]+)\]\s+([\s\S]*)$/);
  const timestamp = match ? `[${match[1]}]` : '';
  const message   = match ? match[2] : line;
  const upper     = message.toUpperCase();

  let color: string = LEVEL_COLORS.default;
  let level: LogLevel = 'info';

  if (upper.includes('[ERROR]') || upper.startsWith('ERROR')) {
    color = LEVEL_COLORS.error; level = 'error';
  } else if (upper.includes('[WARN]') || upper.startsWith('WARN')) {
    color = LEVEL_COLORS.warn; level = 'warn';
  } else if (upper.includes('[SUCCESS]') || upper.startsWith('SUCCESS')) {
    color = LEVEL_COLORS.success;
  } else if (upper.includes('[ORACLE]') || upper.includes('[WS]')) {
    color = LEVEL_COLORS.oracle;
  } else if (upper.includes('[PLANNER]')) {
    color = LEVEL_COLORS.planner;
  } else if (upper.includes('[EXECUTOR]')) {
    color = LEVEL_COLORS.executor;
  } else if (upper.includes('[REVIEWER]')) {
    color = LEVEL_COLORS.reviewer;
  } else if (upper.includes('[SISTEMA]') || upper.includes('[SYSTEM]')) {
    color = LEVEL_COLORS.system;
  } else if (upper.includes('[DEBUG]')) {
    color = '#71717a'; level = 'debug';
  }

  return { timestamp, message, color, level };
}

// ─── Botão de filtro de nível ─────────────────────────────────────────────────
function LevelButton({
  label, active, color, onClick,
}: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[9px] font-mono px-1.5 py-0.5 rounded-full transition-all"
      style={{
        background: active ? `${color}22` : 'transparent',
        color:      active ? color : 'var(--text-muted)',
        border:     `1px solid ${active ? color + '55' : 'transparent'}`,
      }}
    >
      {label}
    </button>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function TerminalPanel() {
  const { logs } = useOracleStore();
  const [autoScroll, setAutoScroll]   = useState(true);
  const [levelFilter, setLevelFilter] = useState<LogLevel>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const clearLogs = () => useOracleStore.setState({ logs: [] });

  // Filtragem e busca
  const filteredLogs = useMemo(() => {
    return logs.filter((line) => {
      const { level, message } = colorizeLog(line);
      if (levelFilter !== 'all' && level !== levelFilter) return false;
      if (searchQuery && !line.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [logs, levelFilter, searchQuery]);

  // Auto-scroll quando chegam novos logs
  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs, autoScroll]);

  // Foca o campo de busca ao abrir
  useEffect(() => {
    if (showSearch) searchRef.current?.focus();
  }, [showSearch]);

  return (
    <div className="flex flex-col h-full" style={{ background: '#000' }}>

      {/* ── Header ── */}
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
              {filteredLogs.length}/{logs.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Botão de busca */}
          <button
            onClick={() => setShowSearch((v) => !v)}
            className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-lg transition-colors"
            style={{ color: showSearch ? '#a78bfa' : 'var(--text-muted)' }}
          >
            <Search size={10} />
          </button>

          {/* Botão limpar */}
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
      </div>

      {/* ── Barra de busca ── */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="shrink-0 overflow-hidden"
            style={{ borderBottom: '1px solid var(--glass-border)', background: 'var(--glass-1)' }}
          >
            <div className="flex items-center gap-2 px-3 py-1.5">
              <Search size={10} style={{ color: 'var(--text-muted)' }} />
              <input
                ref={searchRef}
                type="text"
                placeholder="Filtrar logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent font-mono text-[11px] outline-none"
                style={{ color: 'var(--text-primary)' }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}>
                  <X size={10} style={{ color: 'var(--text-muted)' }} />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Filtros de nível ── */}
      <div
        className="flex items-center gap-1 px-3 py-1 shrink-0"
        style={{ borderBottom: '1px solid var(--glass-border)', background: 'var(--glass-1)' }}
      >
        {([
          { id: 'all',   label: 'Todos',  color: '#a78bfa' },
          { id: 'error', label: 'Error',  color: '#ef4444' },
          { id: 'warn',  label: 'Warn',   color: '#f59e0b' },
          { id: 'info',  label: 'Info',   color: '#22c55e' },
          { id: 'debug', label: 'Debug',  color: '#71717a' },
        ] as { id: LogLevel; label: string; color: string }[]).map(({ id, label, color }) => (
          <LevelButton
            key={id}
            label={label}
            active={levelFilter === id}
            color={color}
            onClick={() => setLevelFilter(id)}
          />
        ))}
      </div>

      {/* ── Logs ── */}
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs" style={{ background: '#000' }}>
        {filteredLogs.length === 0 ? (
          <span style={{ color: '#27272a' }}>
            {logs.length === 0 ? 'Aguardando logs do sistema…' : 'Nenhum log corresponde ao filtro.'}
          </span>
        ) : (
          <AnimatePresence initial={false}>
            {filteredLogs.map((line, i) => {
              const { timestamp, message, color } = colorizeLog(line);
              // Destaca o termo buscado
              const highlighted = searchQuery
                ? message.replace(
                    new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                    '<mark style="background:rgba(167,139,250,0.3);color:#e9d5ff;border-radius:2px">$1</mark>'
                  )
                : message;

              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.12 }}
                  className="flex gap-2 mb-0.5 leading-5"
                >
                  <span style={{ color: '#3f3f46', flexShrink: 0 }}>{timestamp}</span>
                  <span
                    style={{ color, wordBreak: 'break-all' }}
                    dangerouslySetInnerHTML={{ __html: highlighted }}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Footer: auto-scroll toggle ── */}
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
        <span className="ml-auto font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {filteredLogs.length} linha{filteredLogs.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}
