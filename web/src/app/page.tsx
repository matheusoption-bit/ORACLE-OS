'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, LayoutPanelLeft, Code2, PenTool, Database, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading'>('idle');
  const [mode, setMode] = useState('Desenvolver app');

  const modes = [
    { label: 'Criar site', icon: <LayoutPanelLeft size={16} /> },
    { label: 'Criar dashboard', icon: <Database size={16} /> },
    { label: 'Desenvolver app', icon: <Code2 size={16} /> },
    { label: 'Gerar docs', icon: <PenTool size={16} /> },
    { label: 'Analisar código', icon: <Search size={16} /> }
  ];

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || status === 'loading') return;

    setStatus('loading');
    
    try {
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, mode })
      });
      
      const data = await res.json();
      
      if (data.taskId) {
        // Redireciona pro workspace do LangGraph
        router.push(`/workspace/${data.taskId}`);
      } else {
        alert(data.error || 'Erro ao iniciar task');
        setStatus('idle');
      }
    } catch(e) {
      console.error(e);
      setStatus('idle');
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0a] text-white">
      {/* Sidebar História das Tasks */}
      <aside className="w-64 border-r border-[#1f1f1f] bg-[#111] p-4 hidden md:flex flex-col">
        <h2 className="text-sm font-semibold mb-6 flex items-center text-zinc-400">
          <Sparkles size={16} className="mr-2" />
          ORACLE-OS
        </h2>
        
        <div className="text-xs text-zinc-500 font-medium mb-3">HOJE</div>
        <div className="space-y-1">
          {/* Skeleton/Mock list */}
          <button className="w-full text-left truncate text-sm hover:bg-[#1a1a1a] p-2 rounded text-zinc-300">
            ✅ Criar componente de table
          </button>
          <button className="w-full text-left truncate text-sm hover:bg-[#1a1a1a] p-2 rounded text-zinc-300">
             Sistema de login (em progresso)
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 relative">
        <div className="max-w-3xl w-full">
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <h1 className="text-4xl md:text-5xl font-semibold mb-3 tracking-tight">O que posso fazer por você?</h1>
            <p className="text-zinc-500">O ORACLE-OS pensa, planeja e implementa o código.</p>
          </motion.div>

          <form onSubmit={handleSubmit} className="relative mb-6">
            <textarea
              className="w-full bg-[#111] border border-[#2a2a2a] rounded-2xl p-6 text-lg focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 resize-none min-h-[160px] shadow-2xl transition"
              placeholder="Ex: Crie um aplicativo de dashboard moderno com tailwind e recharts..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            
            <div className="absolute bottom-4 right-4 flex gap-2">
              <button
                type="submit"
                disabled={!prompt.trim() || status === 'loading'}
                className="bg-white text-black px-6 py-2 rounded-xl font-medium flex items-center gap-2 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {status === 'loading' ? (
                  <span className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                ) : (
                  'Enviar'
                )}
              </button>
            </div>
          </form>

          {/* Mode Selectors */}
          <div className="flex flex-wrap gap-3 justify-center">
            {modes.map((m) => (
              <button
                key={m.label}
                type="button"
                onClick={() => setMode(m.label)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm border transition-all ${
                  mode === m.label 
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' 
                    : 'bg-[#111] border-[#1f1f1f] text-zinc-400 hover:border-zinc-700 hover:text-white'
                }`}
              >
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>

        </div>
      </main>
    </div>
  );
}
