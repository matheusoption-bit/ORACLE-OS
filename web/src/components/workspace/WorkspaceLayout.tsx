'use client';

import { useState } from 'react';
import ChatPanel from './ChatPanel';
import Workbench from './Workbench';
import { useOracleStore } from '@/stores/oracle.store';

export default function WorkspaceLayout({ taskId }: { taskId: string }) {
  const [splitRatio, setSplitRatio] = useState(40); // 40% Chat, 60% Workbench
  const { taskStatus } = useOracleStore();

  return (
    <div className="flex h-full w-full">
      {/* Esquerda: ChatPanel */}
      <div 
        style={{ width: `${splitRatio}%` }} 
        className="h-full border-r border-[#1f1f1f] bg-[#0a0a0a] flex flex-col min-w-[300px]"
      >
        <ChatPanel taskId={taskId} />
      </div>

      {/* Resize Handle (Drag to resize - mantendo simples por clique/drag) */}
      <div 
        className="w-1 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500 transition-colors bg-[#1f1f1f]"
        onDrag={(e) => {
          if (e.clientX > 0) {
            const ratio = (e.clientX / window.innerWidth) * 100;
            setSplitRatio(Math.min(Math.max(ratio, 20), 80));
          }
        }}
        draggable
      />

      {/* Direita: Workbench */}
      <div 
        style={{ width: `${100 - splitRatio}%` }}
        className="h-full flex-1 min-w-[300px] bg-[#111111]"
      >
        <Workbench />
      </div>
    </div>
  );
}
