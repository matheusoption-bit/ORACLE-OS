'use client';

import { motion } from 'framer-motion';

export function HeroTitle() {
  return (
    <div className="text-center mb-10 select-none">
      {/* Título principal */}
      <motion.h1
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="text-gradient font-bold tracking-tight leading-none mb-4"
        style={{ fontSize: 'clamp(56px, 9vw, 88px)' }}
      >
        ORACLE-OS
      </motion.h1>

      {/* Badge pill */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' }}
        className="inline-flex items-center gap-1.5 glass rounded-full px-4 py-1.5 mb-6"
      >
        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          🔮 Autonomous · Self-improving · Local
        </span>
      </motion.div>

      {/* Subtítulo */}
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
        className="font-light mb-3"
        style={{
          fontSize: 'clamp(20px, 3vw, 28px)',
          color: 'var(--text-secondary)',
        }}
      >
        O que posso fazer por você hoje?
      </motion.p>

      {/* Sub-subtítulo */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.4, ease: 'easeOut' }}
        className="font-mono uppercase tracking-widest text-xs"
        style={{ color: 'var(--text-muted)', letterSpacing: '0.2em' }}
      >
        Planeja · Executa · Revisa · Aprende
      </motion.p>
    </div>
  );
}
