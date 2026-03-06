'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOracleStore } from '@/stores/oracle.store';
import { Brain, Settings, ShieldCheck, User, Terminal, Send } from 'lucide-react';
import PlanView from './PlanView';
import SubtaskProgress from './SubtaskProgress';

export default function ChatPanel({ taskId }: { taskId: string }) {
  const { messages, taskStatus } = useOracleStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'planner': return <Brain size={16} className="text-blue-500" />;
      case 'executor': return <Settings size={16} className="text-purple-500" />;
      case 'reviewer': return <ShieldCheck size={16} className="text-green-500" />;
      case 'user': return <User size={16} className="text-zinc-400" />;
      default: return <Terminal size={16} className="text-zinc-500" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      {/* Header */}
      <div className="flex-none p-4 border-b border-[#1f1f1f] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal size={18} className="text-zinc-400" />
          <span className="font-mono text-sm font-medium">Task: {taskId}</span>
        </div>
        
        {/* Status Badge */}
        <div className="flex items-center gap-2 text-xs font-semibold px-2 py-1 rounded bg-[#1f1f1f]">
          {taskStatus === 'running' && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
          {taskStatus === 'completed' && <span className="w-2 h-2 rounded-full bg-green-500" />}
          {taskStatus === 'error' && <span className="w-2 h-2 rounded-full bg-red-500" />}
          {taskStatus === 'idle' && <span className="w-2 h-2 rounded-full bg-zinc-500" />}
          <span className="capitalize text-zinc-300">{taskStatus}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <AnimatePresence>
          {messages.map((msg, i) => (
            <motion.div
              key={msg.id || i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
            >
              {msg.role !== 'user' && (
                <div className="w-8 h-8 rounded shrink-0 bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
                  {getRoleIcon(msg.role)}
                </div>
              )}
              
              <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : ''}`}>
                {msg.role !== 'user' && (
                   <span className="text-xs font-medium text-zinc-500 mb-1 capitalize">
                     {msg.role}
                   </span>
                )}
                
                <div className={`p-3 rounded-xl text-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-[#1f1f1f] text-zinc-200 rounded-tr-sm' 
                    : msg.role === 'error'
                      ? 'bg-red-950/30 text-red-200 border border-red-900/50 rounded-tl-sm'
                      : 'bg-[#111111] border border-[#1f1f1f] text-zinc-300 rounded-tl-sm'
                }`}>
                  <pre className="whitespace-pre-wrap font-sans">
                    {msg.content}
                    {msg.streaming && <span className="animate-pulse">_</span>}
                  </pre>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Injeção inline do PlanView e Progresso se houver subtasks - poderíamos colocar dinamicamente 
            abaixo da msg do planner, mas injetar flat na scroll view ajuda.*/}
        {useOracleStore.getState().subtasks.length > 0 && (
          <div className="my-6">
            <PlanView />
            <SubtaskProgress />
          </div>
        )}

        <div ref={bottomRef} className="h-4" />
      </div>

      {/* Follow-up input (Mock) */}
      <div className="p-4 border-t border-[#1f1f1f]">
        <div className="relative">
          <input
            type="text"
            placeholder="Enviar uma instrução adicional..."
            className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg pl-4 pr-10 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-[#1f1f1f] text-zinc-400">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
