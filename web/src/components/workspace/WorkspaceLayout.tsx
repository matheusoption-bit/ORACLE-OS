'use client';

import { useEffect, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { motion } from 'framer-motion';
import { Sparkles, ArrowLeft, Timer } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useOracleStore, type TaskStatus } from '@/stores/oracle.store';
import { ChatPanel } from './ChatPanel';
import Workbench from './Workbench';
import { Sidebar } from '../sidebar/Sidebar';

// ─── StatusBadge ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; pulse: boolean }> = {
  idle:      { label: 'Aguardando',   color: 'rgba(107,114,128,0.9)', pulse: false },
  planning:  { label: 'Planejando…',  color: 'rgba(59,130,246,0.9)',  pulse: true  },
  running:   { label: 'Executando…',  color: 'rgba(124,58,237,0.9)', pulse: true  },
  reviewing: { label: 'Revisando…',   color: 'rgba(245,158,11,0.9)', pulse: true  },
  completed: { label: 'Concluído ✓',  color: 'rgba(16,185,129,0.9)', pulse: false },
  error:     { label: 'Erro',         color: 'rgba(239,68,68,0.9)',  pulse: false },
};

function StatusBadge({ status }: { status: TaskStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <div
      className="flex items-center gap-2 rounded-full px-3 py-1"
      style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-border)' }}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{
          background: cfg.color,
          boxShadow: `0 0 6px ${cfg.color}`,
          animation: cfg.pulse ? 'pulse 1.5s ease-in-out infinite' : 'none',
        }}
      />
      <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
        {cfg.label}
      </span>
    </div>
  );
}

// ─── Timer ────────────────────────────────────────────────────────────────

function ElapsedTimer({ startedAt }: { startedAt: string | null }) {
  const [elapsed, setElapsed] = useState('0s');

  useEffect(() => {
    if (!startedAt) return;
    const update = () => {
      const secs = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      if (secs < 60) setElapsed(`${secs}s`);
      else setElapsed(`${Math.floor(secs / 60)}m ${secs % 60}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!startedAt) return null;
  return (
    <span className="font-mono text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
      <Timer size={11} />
      {elapsed}
    </span>
  );
}

// ─── WorkspaceLayout ──────────────────────────────────────────────────────

interface WorkspaceLayoutProps {
  taskId: string;
}

export default function WorkspaceLayout({ taskId }: WorkspaceLayoutProps) {
  const router = useRouter();
  const { taskStatus, taskPrompt, taskStartedAt } = useOracleStore();

  const truncated =
    taskPrompt.length > 48 ? taskPrompt.slice(0, 45) + '…' : taskPrompt || `Task ${taskId}`;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#080808' }}>
      {/* ── Sidebar (Esquerda) ── */}
      <Sidebar />

      {/* ── Conteúdo Principal ── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* ── Header ── */}
        <header
        className="flex items-center gap-3 px-4 h-14 shrink-0 z-10"
        style={{
          background: 'var(--glass-1)',
          backdropFilter: 'blur(var(--blur-md))',
          WebkitBackdropFilter: 'blur(var(--blur-md))',
          borderBottom: '1px solid var(--glass-border)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)' }}
          >
            <Sparkles size={13} style={{ color: '#a78bfa' }} />
          </div>
          <span className="font-mono text-xs font-semibold hidden sm:block" style={{ color: 'var(--text-muted)' }}>
            ORACLE-OS
          </span>
        </div>

        {/* Divider */}
        <div className="h-4 w-px shrink-0" style={{ background: 'var(--glass-border)' }} />

        {/* Prompt truncado */}
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate font-medium" style={{ color: 'var(--text-primary)' }} title={taskPrompt}>
            {truncated}
          </p>
        </div>

        {/* Centro: Status */}
        <StatusBadge status={taskStatus} />

        {/* Timer */}
        <ElapsedTimer startedAt={taskStartedAt} />

        {/* Botão Nova Task */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push('/')}
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-mono shrink-0 transition-colors"
          style={{
            background: 'var(--glass-2)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-secondary)',
          }}
        >
          <ArrowLeft size={12} />
          <span className="hidden sm:inline">Nova Task</span>
        </motion.button>
      </header>

      {/* ── Split Panels ── */}
      <div className="flex-1 overflow-hidden">
        <Group orientation="horizontal" id="oracle-workspace-split" style={{ height: '100%' }}>
          {/* ChatPanel */}
          <Panel defaultSize={42} minSize={28} maxSize={65}>
            <ChatPanel taskId={taskId} />
          </Panel>

          {/* Drag Handle */}
          <Separator>
            <div
              className="w-1.5 h-full relative cursor-col-resize group transition-colors duration-200"
              style={{ background: 'var(--glass-border)' }}
            >
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ background: 'rgba(124,58,237,0.4)' }}
              />
            </div>
          </Separator>

          {/* Workbench (Painel Direito) */}
          <Panel defaultSize={58} minSize={30}>
            <Workbench />
          </Panel>
        </Group>
      </div>
      </div>
    </div>
  );
}
