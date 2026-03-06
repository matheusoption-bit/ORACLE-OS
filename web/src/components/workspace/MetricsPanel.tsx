'use client';

/**
 * MetricsPanel — Painel de métricas em tempo real do ORACLE-OS
 *
 * Exibe:
 *  - Custo estimado em USD
 *  - Tokens consumidos por agente (planner / executor / reviewer)
 *  - Taxa de sucesso das subtasks
 *  - Número de iterações do Reviewer
 *  - Duração total da tarefa
 */

import { motion } from 'framer-motion';
import { useOracleStore } from '@/stores/oracle.store';
import type { TaskMetrics } from '@/types/oracle.types';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDuration(ms?: number): string {
  if (!ms) return '—';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function formatCost(usd?: number): string {
  if (usd === undefined || usd === null) return '—';
  if (usd < 0.001) return `$${(usd * 1000).toFixed(3)}m`;
  return `$${usd.toFixed(4)}`;
}

// ─── Componente de métrica individual ────────────────────────────────────────
interface MetricCardProps {
  label:    string;
  value:    string | number;
  sub?:     string;
  color?:   string;
  icon?:    string;
}

function MetricCard({ label, value, sub, color = '#a78bfa', icon }: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-0.5 rounded-xl px-3 py-2.5"
      style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-border)' }}
    >
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-xs">{icon}</span>}
        <span className="text-[10px] font-mono uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
      </div>
      <span className="text-base font-mono font-bold" style={{ color }}>
        {value}
      </span>
      {sub && (
        <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
          {sub}
        </span>
      )}
    </motion.div>
  );
}

// ─── Barra de progresso de tokens ────────────────────────────────────────────
interface TokenBarProps {
  label:   string;
  tokens:  number;
  total:   number;
  color:   string;
}

function TokenBar({ label, tokens, total, color }: TokenBarProps) {
  const pct = total > 0 ? Math.min((tokens / total) * 100, 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{tokens.toLocaleString()}</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function MetricsPanel() {
  const { metrics, taskStatus, subtasks, currentSubtask, taskStartedAt } = useOracleStore();

  // Calcula métricas derivadas em tempo real (antes de receber do backend)
  const completedCount = Math.min(currentSubtask, subtasks.length);
  const successRate = subtasks.length > 0
    ? Math.round((completedCount / subtasks.length) * 100)
    : 0;

  const elapsedMs = taskStartedAt
    ? Date.now() - new Date(taskStartedAt).getTime()
    : undefined;

  // Tokens do relatório final (se disponível)
  const m = metrics as (TaskMetrics & {
    tokensPlanner?: number;
    tokensExecutor?: number;
    tokensReviewer?: number;
    iterationCount?: number;
  }) | null;

  const totalTokens = m?.tokensUsed ?? 0;
  const tokensPlanner  = m?.tokensPlanner  ?? 0;
  const tokensExecutor = m?.tokensExecutor ?? 0;
  const tokensReviewer = m?.tokensReviewer ?? 0;

  const isIdle = taskStatus === 'idle';

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-border)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid var(--glass-border)' }}>
        <span className="text-xs">📊</span>
        <span className="text-xs font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
          Métricas
        </span>
        {taskStatus !== 'idle' && taskStatus !== 'completed' && (
          <span
            className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(124,58,237,0.15)', color: '#a78bfa', border: '1px solid rgba(124,58,237,0.3)' }}
          >
            ao vivo
          </span>
        )}
      </div>

      <div className="p-3 space-y-3">
        {isIdle ? (
          <p className="text-[11px] text-center py-4" style={{ color: 'var(--text-muted)' }}>
            Inicie uma tarefa para ver as métricas.
          </p>
        ) : (
          <>
            {/* Grid de métricas */}
            <div className="grid grid-cols-2 gap-2">
              <MetricCard
                icon="⏱️"
                label="Duração"
                value={formatDuration(m?.durationMs ?? elapsedMs)}
                color="#60a5fa"
              />
              <MetricCard
                icon="✅"
                label="Progresso"
                value={`${successRate}%`}
                sub={`${completedCount}/${subtasks.length} subtasks`}
                color="#34d399"
              />
              <MetricCard
                icon="💰"
                label="Custo Est."
                value={formatCost(m?.cost)}
                color="#fbbf24"
              />
              <MetricCard
                icon="🔄"
                label="Iterações"
                value={m?.iterationCount ?? '—'}
                color="#f87171"
              />
            </div>

            {/* Distribuição de tokens */}
            {totalTokens > 0 && (
              <div
                className="rounded-xl p-3 space-y-2"
                style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-border)' }}
              >
                <span className="text-[10px] font-mono uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  Tokens ({totalTokens.toLocaleString()} total)
                </span>
                <TokenBar label="Planner"  tokens={tokensPlanner}  total={totalTokens} color="#a78bfa" />
                <TokenBar label="Executor" tokens={tokensExecutor} total={totalTokens} color="#60a5fa" />
                <TokenBar label="Reviewer" tokens={tokensReviewer} total={totalTokens} color="#34d399" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
