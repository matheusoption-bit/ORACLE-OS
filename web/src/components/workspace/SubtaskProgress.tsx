'use client';

import { useOracleStore } from '@/stores/oracle.store';
import { motion } from 'framer-motion';

export default function SubtaskProgress() {
  const { subtasks, currentSubtask } = useOracleStore();

  if (subtasks.length === 0) return null;

  const progress = Math.min(((currentSubtask) / subtasks.length) * 100, 100);

  return (
    <div className="w-full max-w-[85%] mt-2 mb-4">
      <div className="flex justify-between items-center text-xs font-semibold text-zinc-500 mb-1.5 px-1">
        <span>Progresso: {currentSubtask}/{subtasks.length}</span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="h-2 bg-[#1f1f1f] rounded-full overflow-hidden border border-[#2a2a2a]">
        <motion.div 
          className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
