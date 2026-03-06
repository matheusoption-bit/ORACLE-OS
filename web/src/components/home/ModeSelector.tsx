'use client';

import { motion } from 'framer-motion';
import { TASK_MODES, type TaskMode } from '@/types/oracle.types';

interface ModeSelectorProps {
  selected: string;
  onSelect: (id: string) => void;
}

const tierColors: Record<string, { bg: string; border: string; text: string }> = {
  website:   { bg: 'rgba(124,58,237,0.12)', border: 'rgba(124,58,237,0.5)', text: '#a78bfa' },
  dashboard: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.5)', text: '#93c5fd' },
  app:       { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.5)', text: '#6ee7b7' },
  fix:       { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.5)', text: '#fcd34d' },
  docs:      { bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.5)', text: '#c4b5fd' },
  analyze:   { bg: 'rgba(236,72,153,0.12)', border: 'rgba(236,72,153,0.5)', text: '#f9a8d4' },
};

export function ModeSelector({ selected, onSelect }: ModeSelectorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5, ease: 'easeOut' }}
      className="flex flex-wrap gap-2 justify-center"
    >
      {TASK_MODES.map((mode: TaskMode) => {
        const isActive = selected === mode.id;
        const colors = tierColors[mode.id] ?? {
          bg: 'rgba(124,58,237,0.12)',
          border: 'rgba(124,58,237,0.5)',
          text: '#a78bfa',
        };

        return (
          <motion.button
            key={mode.id}
            onClick={() => onSelect(mode.id)}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 font-mono text-xs rounded-full transition-all duration-200"
            style={{
              padding: '8px 16px',
              background: isActive ? colors.bg : 'var(--glass-1)',
              border: `1px solid ${isActive ? colors.border : 'var(--glass-border)'}`,
              color: isActive ? colors.text : 'var(--text-secondary)',
              boxShadow: isActive
                ? `0 0 12px ${colors.bg}`
                : 'none',
            }}
          >
            <span>{mode.icon}</span>
            <span>{mode.label}</span>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
