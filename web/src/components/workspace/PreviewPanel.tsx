'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Tablet, Monitor, RotateCw, Eye } from 'lucide-react';
import { useOracleStore } from '@/stores/oracle.store';

const VIEWPORTS = [
  { id: 375,  label: '375',  icon: Smartphone, tip: 'Mobile' },
  { id: 768,  label: '768',  icon: Tablet,     tip: 'Tablet' },
  { id: 1280, label: '1280', icon: Monitor,    tip: 'Desktop' },
] as const;

type ViewportWidth = typeof VIEWPORTS[number]['id'];

export function PreviewPanel() {
  const { files } = useOracleStore();
  const [viewport, setViewport] = useState<ViewportWidth>(1280);
  const [rotating, setRotating] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const htmlContent = files['index.html']?.content ?? null;

  const handleRefresh = useCallback(() => {
    setRotating(true);
    setTimeout(() => setRotating(false), 600);
    if (iframeRef.current) {
      // Recarrega o iframe
      const src = iframeRef.current.srcdoc;
      iframeRef.current.srcdoc = '';
      setTimeout(() => { if (iframeRef.current) iframeRef.current.srcdoc = src ?? ''; }, 50);
    }
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ background: '#080808' }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-3 px-3 h-10 shrink-0"
        style={{ borderBottom: '1px solid var(--glass-border)', background: 'var(--glass-1)' }}
      >
        {/* Viewport toggles */}
        <div
          className="flex items-center rounded-xl p-0.5 gap-0.5"
          style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-border)' }}
        >
          {VIEWPORTS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setViewport(id)}
              title={`${label}px`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all duration-150 text-xs font-mono"
              style={{
                background: viewport === id ? 'var(--glass-3)' : 'transparent',
                color: viewport === id ? 'var(--text-primary)' : 'var(--text-muted)',
                border: viewport === id ? '1px solid rgba(124,58,237,0.4)' : '1px solid transparent',
              }}
            >
              <Icon size={12} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Separator */}
        <div className="h-4 w-px" style={{ background: 'var(--glass-border)' }} />

        {/* Refresh */}
        <button
          onClick={handleRefresh}
          className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
          style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-border)', color: 'var(--text-muted)' }}
        >
          <RotateCw
            size={13}
            style={{
              transition: 'transform 600ms ease',
              transform: rotating ? 'rotate(360deg)' : 'rotate(0deg)',
            }}
          />
        </button>

        <div className="flex-1" />

        {/* LIVE badge */}
        {htmlContent && (
          <span
            className="text-[10px] font-mono px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(16,185,129,0.12)',
              color: '#10b981',
              border: '1px solid rgba(16,185,129,0.3)',
              animation: 'pulse 2s ease-in-out infinite',
            }}
          >
            ● LIVE
          </span>
        )}
      </div>

      {/* Iframe container */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-4" style={{ background: '#0a0a0a' }}>
        <AnimatePresence mode="wait">
          {htmlContent ? (
            <motion.div
              key={viewport}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              style={{
                width: viewport,
                maxWidth: '100%',
                height: '100%',
                minHeight: '500px',
                borderRadius: '12px',
                overflow: 'hidden',
                border: '1px solid var(--glass-border)',
              }}
            >
              <iframe
                ref={iframeRef}
                srcDoc={htmlContent}
                className="w-full h-full"
                sandbox="allow-scripts allow-same-origin allow-forms"
                title="Preview"
              />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center gap-3 h-full text-center"
            >
              <Eye size={48} style={{ color: 'var(--text-muted)', opacity: 0.2 }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Preview aparecerá aqui
              </p>
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                O agente gerará o arquivo index.html
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
