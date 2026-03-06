'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Code2, Terminal, FolderOpen, GitBranch, BarChart2 } from 'lucide-react';
import { useOracleStore } from '@/stores/oracle.store';
import { PreviewPanel } from './PreviewPanel';
import { CodeEditor } from './CodeEditor';
import { TerminalPanel } from './TerminalPanel';
import { FileTree } from './FileTree';
import { AgentGraphView } from './AgentGraphView';
import { MetricsPanel } from './MetricsPanel';

// ─── Tipos ────────────────────────────────────────────────────────────────────────────────

type WorkbenchTab = 'preview' | 'code' | 'terminal' | 'files' | 'graph' | 'metrics';

const TABS: {
  id: WorkbenchTab;
  label: string;
  icon: typeof Eye;
}[] = [
  { id: 'preview',  label: 'Preview',  icon: Eye        },
  { id: 'code',     label: 'Code',     icon: Code2      },
  { id: 'terminal', label: 'Terminal', icon: Terminal   },
  { id: 'files',    label: 'Files',    icon: FolderOpen },
  { id: 'graph',    label: 'Grafo',    icon: GitBranch  },
  { id: 'metrics',  label: 'Métricas', icon: BarChart2  },
];

// ─── Workbench ────────────────────────────────────────────────────────────

export default function Workbench() {
  const { files, logs, taskStatus } = useOracleStore();
  const [activeTab, setActiveTab] = useWorkbenchTab();

  const fileCount = Object.keys(files).length;
  const hasPreview = !!files['index.html'];

  return (
    <div className="flex flex-col h-full" style={{ background: '#080808' }}>
      {/* ── Tab Bar glass ── */}
      <div
        className="flex items-center px-3 h-11 shrink-0 gap-1"
        style={{ borderBottom: '1px solid var(--glass-border)', background: 'var(--glass-1)' }}
      >
        <div
          className="flex items-center gap-0.5 rounded-2xl p-1"
          style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-border)' }}
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;

            // Badges
            const badge =
              id === 'files' && fileCount > 0 ? String(fileCount) :
              id === 'terminal' && logs.length > 0 ? String(logs.length) :
              null;

            const liveBadge = id === 'preview' && hasPreview;

            return (
              <motion.button
                key={id}
                onClick={() => setActiveTab(id)}
                className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-xs transition-all duration-150"
                style={{
                  background: isActive ? 'var(--glass-3)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: isActive ? '1px solid rgba(124,58,237,0.3)' : '1px solid transparent',
                  boxShadow: isActive ? '0 0 10px rgba(124,58,237,0.15)' : 'none',
                }}
                whileHover={{ backgroundColor: isActive ? undefined : 'rgba(255,255,255,0.05)' }}
              >
                <Icon size={13} />
                <span className="hidden sm:inline">{label}</span>

                {/* Badge numérico */}
                {badge && (
                  <span
                    className="text-[9px] font-mono px-1.5 rounded-full"
                    style={{ background: 'rgba(124,58,237,0.2)', color: '#a78bfa' }}
                  >
                    {badge}
                  </span>
                )}

                {/* Badge LIVE */}
                {liveBadge && (
                  <span
                    className="text-[9px] font-mono px-1.5 rounded-full"
                    style={{
                      background: 'rgba(16,185,129,0.15)',
                      color: '#10b981',
                      animation: 'pulse 2s ease-in-out infinite',
                    }}
                  >
                    ●
                  </span>
                )}

                {/* Indicador de lock na aba Code quando executa */}
                {id === 'code' && (taskStatus === 'running' || taskStatus === 'planning') && (
                  <span style={{ fontSize: '9px' }}>🔒</span>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute inset-0"
          >
            {activeTab === 'preview'  && <PreviewPanel />}
            {activeTab === 'code'     && <CodeEditor />}
            {activeTab === 'terminal' && <TerminalPanel />}
            {activeTab === 'files'    && <FileTree />}
            {activeTab === 'graph'    && (
              <div className="h-full overflow-y-auto p-3">
                <AgentGraphView />
              </div>
            )}
            {activeTab === 'metrics'  && (
              <div className="h-full overflow-y-auto p-3">
                <MetricsPanel />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Hook de tab com sync no store ───────────────────────────────────────

import { useState } from 'react';

function useWorkbenchTab(): [WorkbenchTab, (tab: WorkbenchTab) => void] {
  const [tab, setTab] = useState<WorkbenchTab>('preview');
  const storeSetTab = useOracleStore((s) => s.setActiveTab);

  const set = (t: WorkbenchTab) => {
    setTab(t);
    storeSetTab(t as Parameters<typeof storeSetTab>[0]);
  };

  return [tab, set];
}
