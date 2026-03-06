'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useOracleStore, type RecentTaskEntry, type TaskStatus } from '@/stores/oracle.store';

// ─── Skeleton ────────────────────────────────────────────────────────────

function SkeletonItem() {
  return (
    <div className="px-3 py-2 rounded-xl flex items-start gap-2 overflow-hidden">
      <div className="w-4 h-4 rounded shrink-0 mt-0.5" style={{ background: 'var(--glass-3)' }} />
      <div className="flex flex-col gap-1.5 flex-1">
        <div className="h-2.5 rounded w-4/5" style={{ background: 'var(--glass-3)', animation: 'shimmer 1.8s infinite' }} />
        <div className="h-2 rounded w-1/2" style={{ background: 'var(--glass-2)', animation: 'shimmer 1.8s 0.2s infinite' }} />
      </div>
    </div>
  );
}

// ─── Ícone por status ──────────────────────────────────────────────────

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === 'completed')
    return <CheckCircle2 size={14} style={{ color: '#10b981', flexShrink: 0 }} />;
  if (status === 'error')
    return <XCircle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />;
  if (status === 'running' || status === 'planning' || status === 'reviewing')
    return <Loader2 size={14} className="animate-spin" style={{ color: '#a78bfa', flexShrink: 0 }} />;
  return <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: 'var(--glass-3)', border: '1px solid var(--glass-border)' }} />;
}

// ─── Agrupamento por data ─────────────────────────────────────────────

function groupByDate(tasks: RecentTaskEntry[]): { label: string; items: RecentTaskEntry[] }[] {
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();

  const groups: Record<string, RecentTaskEntry[]> = {};

  tasks.forEach((t) => {
    const d = new Date(t.createdAt);
    const dStr = d.toDateString();
    const label =
      dStr === today     ? 'Hoje' :
      dStr === yesterday ? 'Ontem' :
      d > new Date(now.getTime() - 7 * 86400000) ? 'Esta semana' :
      d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(t);
  });

  // Ordem: hoje, ontem, esta semana, resto
  const order = ['Hoje', 'Ontem', 'Esta semana'];
  const keys = [...order.filter((k) => groups[k]), ...Object.keys(groups).filter((k) => !order.includes(k))];
  return keys.map((label) => ({ label, items: groups[label] }));
}

// ─── Tempo relativo ───────────────────────────────────────────────────

function relativeTime(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60)   return 'há poucos seg';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  return `há ${Math.floor(diff / 86400)} d`;
}

// ─── Sidebar ─────────────────────────────────────────────────────────

export function Sidebar() {
  const router = useRouter();
  const { taskHistory } = useOracleStore();
  const [open, setOpen] = useState(true);
  const [loading] = useState(false);

  const groups = useMemo(() => groupByDate(taskHistory), [taskHistory]);

  const todayCount = useMemo(() => {
    const today = new Date().toDateString();
    return taskHistory.filter((t) => new Date(t.createdAt).toDateString() === today).length;
  }, [taskHistory]);

  const successRate = useMemo(() => {
    if (!taskHistory.length) return 0;
    return Math.round((taskHistory.filter((t) => t.status === 'completed').length / taskHistory.length) * 100);
  }, [taskHistory]);

  return (
    <>
      {/* Sidebar */}
      <motion.aside
        animate={{ width: open ? 260 : 0 }}
        transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
        className="relative flex-shrink-0 h-full"
        style={{ overflow: 'hidden' }}
      >
        <div
          className="flex flex-col h-full w-[260px]"
          style={{
            background: 'rgba(8,8,8,0.98)',
            backdropFilter: 'blur(var(--blur-lg))',
            WebkitBackdropFilter: 'blur(var(--blur-lg))',
            borderRight: '1px solid var(--glass-border)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 h-14 shrink-0"
            style={{ borderBottom: '1px solid var(--glass-border)' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">🔮</span>
              <span className="font-mono text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                ORACLE-OS
              </span>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.push('/')}
              className="flex items-center gap-1 text-[10px] font-mono px-2.5 py-1 rounded-xl"
              style={{
                background: 'rgba(124,58,237,0.12)',
                border: '1px solid rgba(124,58,237,0.3)',
                color: '#a78bfa',
              }}
            >
              <Plus size={10} />
              Nova
            </motion.button>
          </div>

          {/* Tasks section */}
          <div className="flex-1 overflow-y-auto py-2">
            {loading ? (
              <div className="space-y-1 px-1">
                <SkeletonItem />
                <SkeletonItem />
                <SkeletonItem />
              </div>
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center px-4">
                <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                  Nenhuma task ainda
                </p>
                <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                  Suas pesquisas aparecerão aqui
                </p>
              </div>
            ) : (
              groups.map(({ label, items }) => (
                <div key={label} className="mb-2">
                  {/* Group header */}
                  <div className="px-3 py-1.5 flex items-center gap-2">
                    <span className="font-mono text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                      {label}
                    </span>
                    <span
                      className="font-mono text-[9px] px-1.5 py-0.5 rounded-full"
                      style={{ background: 'var(--glass-2)', color: 'var(--text-muted)' }}
                    >
                      {items.length}
                    </span>
                  </div>

                  {/* Task items */}
                  <div className="px-1 space-y-0.5">
                    {items.map((task) => (
                      <motion.button
                        key={task.id}
                        whileHover={{ backgroundColor: 'var(--glass-2)' }}
                        onClick={() => router.push(`/workspace/${task.id}`)}
                        className="w-full flex items-start gap-2.5 px-3 py-2 rounded-xl text-left transition-colors group"
                        title={task.prompt}
                      >
                        <StatusIcon status={task.status} />
                        <div className="flex-1 min-w-0">
                          <p
                            className="font-mono text-xs truncate"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {task.prompt.length > 38
                              ? task.prompt.slice(0, 35) + '…'
                              : task.prompt}
                          </p>
                          <p className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {relativeTime(task.createdAt)}
                          </p>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div
            className="flex flex-col justify-center px-4 h-14 shrink-0"
            style={{ borderTop: '1px solid var(--glass-border)' }}
          >
            <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
              📊 Hoje: {todayCount} tasks · ✅ {successRate}%
            </p>
          </div>
        </div>
      </motion.aside>

      {/* Toggle button */}
      <motion.button
        onClick={() => setOpen((v) => !v)}
        animate={{ x: open ? 0 : -4 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className="fixed top-1/2 -translate-y-1/2 z-50 w-6 h-10 rounded-r-xl flex items-center justify-center"
        style={{
          left: open ? '260px' : '0',
          background: 'rgba(255,255,255,0.06)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '1px solid var(--glass-border)',
          borderLeft: 'none',
          transition: 'left 0.25s cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ChevronLeft size={12} style={{ color: 'var(--text-muted)' }} />
            </motion.span>
          ) : (
            <motion.span key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </>
  );
}
