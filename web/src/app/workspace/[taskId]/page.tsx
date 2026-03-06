'use client';

import { use } from 'react';
import WorkspaceLayout from '@/components/workspace/WorkspaceLayout';
import { useOracleWebSocket } from '@/hooks/useOracleWebSocket';

export default function WorkspacePage({ 
  params 
}: { 
  params: Promise<{ taskId: string }> 
}) {
  const resolvedParams = use(params);
  const { taskId } = resolvedParams;
  
  // Inicia conexão websocket
  useOracleWebSocket(taskId);

  return (
    <div className="h-screen w-full bg-[#0a0a0a] text-zinc-100 flex overflow-hidden">
      <WorkspaceLayout taskId={taskId} />
    </div>
  );
}
