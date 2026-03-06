'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, CheckCircle2, Loader2, Clock } from 'lucide-react';
import { useOracleStore } from '@/stores/oracle.store';

export function PlanView() {
  const { subtasks, currentSubtask, isPlanExpanded, togglePlan, taskStartedAt } = useOracleStore();
  const [startedAt] = useState(taskStartedAt ?? new Date().toISOString());

  if (subtasks.length === 0) return null;

  const completedCount = Math.min(currentSubtask, subtasks.length);
  const progressPct = subtasks.length > 0 ? (completedCount / subtasks.length) * 100 : 0;

  const elapsed = taskStartedAt
    ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
    : 0;
  const elapsedLabel = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

  return (
    <div
      className="mx-4 my-3 rounded-2xl overflow-hidden"
      style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-border)' }}
    >
      {/* Header clicável */}
      <button
        onClick={togglePlan}
        className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-white/5"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">📋</span>
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Plano de Execução
          </span>
          <span
            className="text-[10px] font-mono px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(124,58,237,0.15)', color: '#a78bfa', border: '1px solid rgba(124,58,237,0.3)' }}
          >
            {subtasks.length} subtasks
          </span>
        </div>
        <motion.div animate={{ rotate: isPlanExpanded ? 0 : -90 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
        </motion.div>
      </button>

      {/* Body colapsável */}
      <AnimatePresence initial={false}>
        {isPlanExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div
              className="px-4 pb-1"
              style={{ borderTop: '1px solid var(--glass-border)' }}
            >
              {/* Lista de subtasks */}
              <div className="space-y-0.5 py-3">
                {subtasks.map((task, idx) => {
                  const isDone    = idx < completedCount;
                  const isRunning = idx === completedCount && completedCount < subtasks.length;
                  const isPending = !isDone && !isRunning;

                  return (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="flex items-start gap-2.5 py-1.5"
                    >
                      {/* Ícone de estado */}
                      <div className="mt-0.5 shrink-0">
                        {isDone && <CheckCircle2 size={14} style={{ color: '#10b981' }} />}
                        {isRunning && <Loader2 size={14} className="animate-spin" style={{ color: '#a78bfa' }} />}
                        {isPending && <Clock size={14} style={{ color: 'var(--text-muted)' }} />}
                      </div>

                      {/* Título */}
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm"
                          style={{
                            color: isDone    ? 'var(--text-muted)' :
                                   isRunning ? '#a78bfa' :
                                               'var(--text-secondary)',
                            textDecoration: isDone ? 'line-through' : 'none',
                          }}
                        >
                          {task.title}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Progress bar + label */}
              <div className="pb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    {completedCount} / {subtasks.length} subtasks · {elapsedLabel}
                  </span>
                  <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    {Math.round(progressPct)}%
                  </span>
                </div>
                <div
                  className="h-1 rounded-full overflow-hidden"
                  style={{ background: 'var(--glass-3)' }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: 'linear-gradient(90deg, #7c3aed, #3b82f6)' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPct}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
