'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Sparkles, Clock } from 'lucide-react';
import { HeroTitle } from '@/components/home/HeroTitle';
import { HeroPrompt } from '@/components/home/HeroPrompt';
import { ModeSelector } from '@/components/home/ModeSelector';
import { ModelSelector } from '@/components/home/ModelSelector';
import type { RecentTask } from '@/types/oracle.types';

// Tasks mock para sidebar
const MOCK_TASKS: RecentTask[] = [
  { id: '1', title: 'Dashboard de analytics com recharts', status: 'completed', createdAt: new Date().toISOString(), mode: 'dashboard' },
  { id: '2', title: 'Sistema de autenticação JWT', status: 'executing', createdAt: new Date().toISOString(), mode: 'app' },
  { id: '3', title: 'Landing page SaaS responsiva', status: 'completed', createdAt: new Date().toISOString(), mode: 'website' },
  { id: '4', title: 'Refatoração do módulo de pagamentos', status: 'completed', createdAt: new Date().toISOString(), mode: 'fix' },
];

const STATUS_INDICATOR: Record<string, string> = {
  completed: '#10b981',
  executing: '#7c3aed',
  planning:  '#3b82f6',
  failed:    '#ef4444',
  pending:   '#6b7280',
  reviewing: '#f59e0b',
};

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMode, setSelectedMode] = useState('app');
  const [selectedModel, setSelectedModel] = useState('claude-3-5-sonnet');

  const handleSubmit = useCallback(async (prompt: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, mode: selectedMode, model: selectedModel }),
      });
      const data = await res.json();
      if (data.taskId) {
        router.push(`/workspace/${data.taskId}`);
      } else {
        console.error(data.error || 'Erro ao iniciar task');
        setIsLoading(false);
      }
    } catch (e) {
      console.error(e);
      setIsLoading(false);
    }
  }, [selectedMode, selectedModel, router]);

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: '#080808', color: 'var(--text-primary)' }}
    >
      {/* Aurora background */}
      <div className="aurora-bg" aria-hidden="true" />

      {/* Sidebar glass */}
      <aside
        className="hidden lg:flex flex-col w-64 shrink-0 relative z-10"
        style={{
          background: 'var(--glass-1)',
          backdropFilter: 'blur(var(--blur-md))',
          borderRight: '1px solid var(--glass-border)',
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-2 px-5 py-5"
          style={{ borderBottom: '1px solid var(--glass-border)' }}
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.3)' }}
          >
            <Sparkles size={14} style={{ color: '#a78bfa' }} />
          </div>
          <span className="font-semibold text-sm tracking-wide" style={{ color: 'var(--text-primary)' }}>
            ORACLE-OS
          </span>
        </div>

        {/* Tasks recentes */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div
            className="flex items-center gap-1.5 px-2 mb-3 text-xs font-mono uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}
          >
            <Clock size={10} />
            <span>Recentes</span>
          </div>

          <div className="space-y-1">
            {MOCK_TASKS.map((task) => (
              <motion.button
                key={task.id}
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)', x: 2 }}
                className="w-full text-left flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-all duration-150"
              >
                {/* Status dot */}
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: STATUS_INDICATOR[task.status] ?? '#6b7280' }}
                />
                <span
                  className="text-sm truncate"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {task.title}
                </span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Footer sidebar */}
        <div
          className="px-4 py-4"
          style={{ borderTop: '1px solid var(--glass-border)' }}
        >
          <div className="glass rounded-xl px-3 py-2 text-center">
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              Sprint 7.1 · Alpha
            </span>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col relative z-10 min-w-0">
        {/* Header */}
        <header
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--glass-border)' }}
        >
          {/* Logo mobile */}
          <div className="flex items-center gap-2 lg:hidden">
            <Sparkles size={16} style={{ color: '#a78bfa' }} />
            <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              ORACLE-OS
            </span>
          </div>
          <div className="hidden lg:block" />

          {/* Model Selector */}
          <ModelSelector selected={selectedModel} onSelect={setSelectedModel} />
        </header>

        {/* Content centralizado */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 py-8 overflow-y-auto">
          <div className="w-full max-w-2xl mx-auto">
            {/* Hero */}
            <HeroTitle />

            {/* Prompt Input */}
            <HeroPrompt onSubmit={handleSubmit} isLoading={isLoading} />

            {/* Mode Selector */}
            <ModeSelector selected={selectedMode} onSelect={setSelectedMode} />
          </div>
        </main>
      </div>
    </div>
  );
}
