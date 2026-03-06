'use client';

import { use } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Wifi, WifiOff } from 'lucide-react';
import WorkspaceLayout from '@/components/workspace/WorkspaceLayout';
import { useOracleWebSocket } from '@/hooks/useOracleWebSocket';

// ─── Loading/Error screens ────────────────────────────────────────────────

function ConnectingScreen() {
  return (
    <div
      className="flex flex-col items-center justify-center h-screen gap-6"
      style={{ background: '#080808' }}
    >
      <div className="aurora-bg" aria-hidden />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center gap-4 relative z-10"
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
          style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)' }}
        >
          🔮
        </div>
        <Loader2 size={20} className="animate-spin" style={{ color: '#a78bfa' }} />
        <p className="font-mono text-sm" style={{ color: 'var(--text-muted)' }}>
          Conectando ao ORACLE-OS…
        </p>
      </motion.div>
    </div>
  );
}

function FailedScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center h-screen gap-6"
      style={{ background: '#080808' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-4 text-center px-6"
      >
        <WifiOff size={40} style={{ color: '#ef4444' }} />
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Sem conexão com o servidor
        </h2>
        <p className="text-sm max-w-sm" style={{ color: 'var(--text-muted)' }}>
          Não foi possível conectar ao ORACLE-OS após 5 tentativas.
          Verifique se o servidor está rodando na porta 3001.
        </p>
        <motion.button
          onClick={onRetry}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-mono text-sm"
          style={{ background: '#7c3aed', color: '#fff', boxShadow: '0 0 20px rgba(124,58,237,0.35)' }}
        >
          <Wifi size={14} />
          Tentar novamente
        </motion.button>
      </motion.div>
    </div>
  );
}

// ─── Página do Workspace ──────────────────────────────────────────────────

export default function WorkspacePage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = use(params);
  const { status, sendUserMessage, reconnect } = useOracleWebSocket(taskId);

  // Loading state enquanto conecta (primeira vez)
  if (status === 'connecting') {
    return <ConnectingScreen />;
  }

  // Estado de falha com botão de retry
  if (status === 'failed') {
    return <FailedScreen onRetry={reconnect} />;
  }

  return (
    <div className="h-screen w-full overflow-hidden">
      <WorkspaceLayout taskId={taskId} sendUserMessage={sendUserMessage} />
    </div>
  );
}
