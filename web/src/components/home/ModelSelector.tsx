'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';
import { ORACLE_MODELS, type OracleModel } from '@/types/oracle.types';

const TIER_COLORS: Record<string, string> = {
  HIGH:  'rgba(168,85,247,0.8)',
  FAST:  'rgba(59,130,246,0.8)',
  LOCAL: 'rgba(245,158,11,0.8)',
  FREE:  'rgba(16,185,129,0.8)',
};

interface ModelSelectorProps {
  selected: string;
  onSelect: (id: string) => void;
}

export function ModelSelector({ selected, onSelect }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentModel = ORACLE_MODELS.find((m) => m.id === selected) ?? ORACLE_MODELS[0];

  // Fechar ao clicar fora
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="flex items-center gap-2 glass rounded-xl px-3 py-1.5 text-xs font-mono transition-all duration-200"
        style={{
          color: 'var(--text-secondary)',
          border: open ? '1px solid rgba(124,58,237,0.4)' : '1px solid var(--glass-border)',
        }}
      >
        <span>{currentModel.icon}</span>
        <span style={{ color: 'var(--text-primary)' }}>{currentModel.name}</span>
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
          style={{ background: TIER_COLORS[currentModel.tier] + '22', color: TIER_COLORS[currentModel.tier] }}
        >
          {currentModel.tier}
        </span>
        <ChevronDown
          size={12}
          className="transition-transform duration-200"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            color: 'var(--text-muted)',
          }}
        />
      </motion.button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 top-full mt-2 w-60 glass-heavy rounded-2xl overflow-hidden z-50"
            style={{ boxShadow: '0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)' }}
          >
            <div className="py-2">
              {ORACLE_MODELS.map((model: OracleModel) => {
                const isSelected = model.id === selected;
                return (
                  <motion.button
                    key={model.id}
                    onClick={() => { onSelect(model.id); setOpen(false); }}
                    whileHover={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150"
                    style={{
                      background: isSelected ? 'rgba(124,58,237,0.08)' : 'transparent',
                      borderLeft: isSelected ? '2px solid rgba(124,58,237,0.6)' : '2px solid transparent',
                    }}
                  >
                    <span className="text-base leading-none">{model.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-sm font-medium truncate"
                        style={{ color: isSelected ? '#a78bfa' : 'var(--text-primary)' }}
                      >
                        {model.name}
                      </div>
                      <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                        {model.provider}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold font-mono"
                        style={{
                          background: TIER_COLORS[model.tier] + '22',
                          color: TIER_COLORS[model.tier],
                        }}
                      >
                        {model.tier}
                      </span>
                      {isSelected && <Check size={12} style={{ color: '#a78bfa' }} />}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
