'use client';

import { motion } from 'framer-motion';
import { useOracleStore } from '@/stores/oracle.store';

export function SubtaskProgress() {
  const { subtasks, currentSubtask, taskStatus } = useOracleStore();

  const isActive = taskStatus === 'running' || taskStatus === 'planning';
  if (!isActive || subtasks.length === 0) return null;

  const current = subtasks[Math.min(currentSubtask, subtasks.length - 1)];
  const progressPct = subtasks.length > 0
    ? (Math.min(currentSubtask, subtasks.length) / subtasks.length) * 100
    : 0;

  return (
    <div
      className="relative shrink-0 mx-4 mb-2 rounded-xl overflow-hidden"
      style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-border)' }}
    >
      {/* Progress bar ultra-fina no topo */}
      <div className="h-0.5 w-full" style={{ background: 'var(--glass-3)' }}>
        <motion.div
          className="h-full"
          style={{
            background: '#7c3aed',
            boxShadow: '0 0 6px rgba(124,58,237,0.6)',
          }}
          animate={{
            width: `${progressPct}%`,
            opacity: taskStatus === 'running' ? [1, 0.6, 1] : 1,
          }}
          transition={{
            width: { duration: 0.5, ease: 'easeOut' },
            opacity: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' },
          }}
        />
      </div>

      {/* Conteúdo do strip */}
      <div className="flex items-center justify-between px-3 h-9">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm shrink-0">⚙️</span>
          <span
            className="text-xs font-mono truncate"
            style={{ color: 'var(--text-secondary)' }}
          >
            {current?.title ?? 'Processando…'}
          </span>
        </div>
        <span
          className="text-xs font-mono shrink-0 ml-2"
          style={{ color: 'var(--text-muted)' }}
        >
          {Math.min(currentSubtask, subtasks.length)} / {subtasks.length}
        </span>
      </div>
    </div>
  );
}
