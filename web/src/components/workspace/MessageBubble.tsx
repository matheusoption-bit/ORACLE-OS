'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check } from 'lucide-react';

// ─── Tipos ───────────────────────────────────────────────────────────────

const AGENT_CONFIG = {
  planner: {
    icon: '🧠',
    label: 'Planner',
    bg: 'rgba(59,130,246,0.12)',
    border: 'rgba(59,130,246,0.35)',
    accent: '#93c5fd',
  },
  executor: {
    icon: '⚙️',
    label: 'Executor',
    bg: 'rgba(124,58,237,0.12)',
    border: 'rgba(124,58,237,0.35)',
    accent: '#a78bfa',
  },
  reviewer: {
    icon: '🔍',
    label: 'Reviewer',
    bg: 'rgba(16,185,129,0.12)',
    border: 'rgba(16,185,129,0.35)',
    accent: '#6ee7b7',
  },
  system: {
    icon: '🔮',
    label: 'Sistema',
    bg: 'rgba(255,255,255,0.04)',
    border: 'rgba(255,255,255,0.10)',
    accent: 'rgba(255,255,255,0.45)',
  },
  user: {
    icon: '👤',
    label: 'Você',
    bg: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,255,255,0.12)',
    accent: 'rgba(255,255,255,0.7)',
  },
  error: {
    icon: '❌',
    label: 'Erro',
    bg: 'rgba(239,68,68,0.12)',
    border: 'rgba(239,68,68,0.35)',
    accent: '#fca5a5',
  },
} as const;

// ─── Code block dentro do conteúdo ────────────────────────────────────────

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="rounded-xl overflow-hidden my-2"
      style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-border)' }}
    >
      {/* Header do block */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ borderBottom: '1px solid var(--glass-border)' }}
      >
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
          {lang || 'código'}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-[10px] font-mono transition-colors"
          style={{ color: copied ? '#10b981' : 'var(--text-muted)' }}
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? 'copiado' : 'copiar'}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ─── Renderizador de Markdown simples ────────────────────────────────────

function SimpleMarkdown({ content }: { content: string }) {
  // Divide por blocos de código
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-1 text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const lines = part.slice(3).split('\n');
          const lang = lines[0].trim();
          const code = lines.slice(1).join('\n').replace(/```$/, '').trim();
          return <CodeBlock key={i} lang={lang} code={code} />;
        }
        // Renderiza bold (**text**) e code inline (`text`)
        return (
          <p key={i} className="whitespace-pre-wrap">
            {part.split(/(\*\*.*?\*\*|`[^`]+`)/g).map((seg, j) => {
              if (seg.startsWith('**') && seg.endsWith('**')) {
                return <strong key={j} className="font-semibold text-white">{seg.slice(2, -2)}</strong>;
              }
              if (seg.startsWith('`') && seg.endsWith('`')) {
                return (
                  <code key={j} className="rounded px-1 py-0.5 text-xs font-mono"
                    style={{ background: 'var(--glass-2)', color: '#a78bfa' }}>
                    {seg.slice(1, -1)}
                  </code>
                );
              }
              return <span key={j}>{seg}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}

// ─── Timestamp relativo ───────────────────────────────────────────────────

function RelativeTime({ timestamp }: { timestamp: string }) {
  const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  const label =
    diff < 5   ? 'agora' :
    diff < 60  ? `${diff}s` :
    diff < 3600 ? `${Math.floor(diff / 60)}m` :
    `${Math.floor(diff / 3600)}h`;

  return (
    <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
      {label}
    </span>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────

interface MessageBubbleProps {
  role: keyof typeof AGENT_CONFIG;
  content: string;
  timestamp: string;
  streaming?: boolean;
}

export function MessageBubble({ role, content, timestamp, streaming }: MessageBubbleProps) {
  const cfg = AGENT_CONFIG[role] ?? AGENT_CONFIG.system;
  const isUser = role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`flex gap-3 px-4 py-3 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 mt-0.5"
        style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
      >
        {cfg.icon}
      </div>

      {/* Conteúdo */}
      <div className={`flex flex-col gap-1 max-w-[85%] ${isUser ? 'items-end' : ''}`}>
        {/* Linha de meta */}
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-medium" style={{ color: cfg.accent }}>
            {cfg.label}
          </span>
          <RelativeTime timestamp={timestamp} />
        </div>

        {/* Balão de mensagem */}
        <div
          className="rounded-2xl px-3 py-2.5"
          style={{
            background: isUser ? 'rgba(124,58,237,0.15)' : 'var(--glass-1)',
            border: `1px solid ${isUser ? 'rgba(124,58,237,0.3)' : 'var(--glass-border)'}`,
            borderTopLeftRadius: isUser ? undefined : '4px',
            borderTopRightRadius: isUser ? '4px' : undefined,
          }}
        >
          <SimpleMarkdown content={content} />
          {/* Cursor de streaming */}
          {streaming && (
            <span
              className="inline-block w-0.5 h-3.5 ml-0.5 align-middle"
              style={{
                background: cfg.accent,
                animation: 'blink 800ms ease-in-out infinite',
              }}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}

// CSS para o cursor de streaming
if (typeof document !== 'undefined') {
  const style = document.getElementById('oracle-blink-style') ?? document.createElement('style');
  style.id = 'oracle-blink-style';
  style.textContent = `@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`;
  if (!document.getElementById('oracle-blink-style')) document.head.appendChild(style);
}
