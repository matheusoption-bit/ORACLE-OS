'use client';

import { useOracleStore } from '@/stores/oracle.store';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, PlayCircle } from 'lucide-react';

export default function PlanView() {
  const { subtasks, currentSubtask } = useOracleStore();

  if (subtasks.length === 0) return null;

  return (
    <div className="bg-[#111111] border border-[#222] rounded-xl p-4 my-4 max-w-[85%]">
      <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
        <span className="bg-blue-500/10 text-blue-400 p-1 rounded">📋</span>
        Plano de Execução
      </h3>
      
      <div className="space-y-3">
        {subtasks.map((task, idx) => {
          const isCompleted = idx < currentSubtask;
          const isRunning = idx === currentSubtask;
          
          return (
            <motion.div 
              key={task.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`flex items-start gap-3 text-sm ${
                isCompleted ? 'text-zinc-500' :
                isRunning ? 'text-blue-400 font-medium' : 'text-zinc-400'
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {isCompleted ? <CheckCircle2 size={16} className="text-green-500" /> :
                 isRunning ? <PlayCircle size={16} className="animate-pulse" /> : 
                 <Circle size={16} className="text-[#333]" />}
              </div>
              
              <div className="flex-1">
                <p className={isCompleted ? 'line-through' : ''}>{task.title}</p>
                {task.dependencies && task.dependencies.length > 0 && (
                  <p className="text-xs text-[#555] mt-0.5">
                    Depende: {task.dependencies.join(', ')}
                  </p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
