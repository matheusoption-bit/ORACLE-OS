'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Folder, FolderOpen, FileCode2, File, Lock } from 'lucide-react';
import { useOracleStore, type FileEntry } from '@/stores/oracle.store';

// ─── Ícone por extensão ────────────────────────────────────────────────────

function FileIcon({ path }: { path: string }) {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const colorMap: Record<string, string> = {
    ts: '#3b82f6', tsx: '#3b82f6', js: '#f59e0b', jsx: '#f59e0b',
    css: '#ec4899', scss: '#ec4899',
    json: '#f59e0b', md: '#94a3b8', html: '#f97316',
    py: '#3b82f6', sh: '#10b981', yml: '#10b981', yaml: '#10b981',
  };
  const color = colorMap[ext] ?? 'rgba(255,255,255,0.4)';
  return <FileCode2 size={13} style={{ color, flexShrink: 0 }} />;
}

// ─── Badge NEW com fade-out em 4s ─────────────────────────────────────────

function NewBadge({ addedAt }: { addedAt: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const age = Date.now() - new Date(addedAt).getTime();
    const remaining = Math.max(0, 4000 - age);
    const t = setTimeout(() => setVisible(false), remaining);
    return () => clearTimeout(t);
  }, [addedAt]);

  if (!visible) return null;
  return (
    <motion.span
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="text-[9px] font-mono px-1.5 py-0.5 rounded-full shrink-0"
      style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
    >
      NEW
    </motion.span>
  );
}

// ─── Agrupa paths em estrutura de folder ──────────────────────────────────

function buildTree(files: Record<string, FileEntry>): Record<string, string[]> {
  const tree: Record<string, string[]> = { '/': [] };
  Object.keys(files).forEach((path) => {
    const parts = path.split('/');
    if (parts.length === 1) {
      tree['/'].push(path);
    } else {
      const folder = parts.slice(0, -1).join('/');
      if (!tree[folder]) tree[folder] = [];
      tree[folder].push(path);
    }
  });
  return tree;
}

// ─── FileTree ─────────────────────────────────────────────────────────────

export function FileTree() {
  const { files, activeFile, taskStatus } = useOracleStore();
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const fileCount = Object.keys(files).length;
  const isLocked = taskStatus === 'running' || taskStatus === 'planning';

  const tree = buildTree(files);
  const folders = Object.keys(tree).filter((f) => f !== '/').sort();

  const toggleFolder = (folder: string) => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      next.has(folder) ? next.delete(folder) : next.add(folder);
      return next;
    });
  };

  const selectFile = (path: string) => {
    useOracleStore.getState().setActiveFile(path);
    useOracleStore.getState().setActiveTab('code' as never);
  };

  const renderFile = (path: string, indent: number = 0) => {
    const file = files[path];
    const isActive = activeFile === path;
    const name = path.split('/').pop() ?? path;

    return (
      <motion.button
        key={path}
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.15 }}
        onClick={() => selectFile(path)}
        className="w-full flex items-center gap-2 py-1 px-2 rounded-lg text-left transition-colors"
        style={{
          paddingLeft: `${8 + indent * 12}px`,
          background: isActive ? 'var(--glass-3)' : 'transparent',
          borderLeft: isActive ? '2px solid rgba(124,58,237,0.6)' : '2px solid transparent',
        }}
        onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--glass-2)'; }}
        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
      >
        <FileIcon path={path} />
        <span className="font-mono text-xs truncate flex-1" style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
          {name}
        </span>
        <AnimatePresence>
          <NewBadge addedAt={file?.updatedAt ?? new Date().toISOString()} />
        </AnimatePresence>
        {isLocked && isActive && <Lock size={9} style={{ color: '#a78bfa', flexShrink: 0 }} />}
      </motion.button>
    );
  };

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#080808' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 sticky top-0"
        style={{ background: '#080808', borderBottom: '1px solid var(--glass-border)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">📁</span>
          <span className="font-mono text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Arquivos
          </span>
          {fileCount > 0 && (
            <span
              className="font-mono text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(124,58,237,0.12)', color: '#a78bfa', border: '1px solid rgba(124,58,237,0.25)' }}
            >
              {fileCount}
            </span>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-2">
        {fileCount === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <File size={24} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
            <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum arquivo gerado</p>
          </div>
        ) : (
          <>
            {/* Arquivos na raiz */}
            {tree['/']?.map((p) => renderFile(p, 0))}

            {/* Pastas */}
            {folders.map((folder) => {
              const isOpen = openFolders.has(folder);
              const folderFiles = tree[folder] ?? [];
              const folderName = folder.split('/').pop() ?? folder;

              return (
                <div key={folder}>
                  {/* Folder header */}
                  <button
                    onClick={() => toggleFolder(folder)}
                    className="w-full flex items-center gap-2 py-1 px-2 rounded-lg transition-colors"
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--glass-2)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.15 }}>
                      <ChevronRight size={11} style={{ color: 'var(--text-muted)' }} />
                    </motion.div>
                    {isOpen ? (
                      <FolderOpen size={13} style={{ color: '#f59e0b' }} />
                    ) : (
                      <Folder size={13} style={{ color: '#f59e0b' }} />
                    )}
                    <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                      {folderName}
                    </span>
                  </button>

                  {/* Arquivos da pasta */}
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ overflow: 'hidden' }}
                      >
                        {folderFiles.map((p) => renderFile(p, 1))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
