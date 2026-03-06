'use client';

/**
 * FileTree — Árvore de arquivos interativa do ORACLE-OS (Sprint 10)
 *
 * Evolução:
 * - Clique em arquivo abre na aba Code (atualiza activeFile + activeTab)
 * - Ícones por tipo de arquivo (TS, TSX, JS, CSS, JSON, MD, PY, etc.)
 * - Estrutura hierárquica com pastas colapsáveis
 * - Badge NEW com fade-out para arquivos recém-criados
 * - Indicador de arquivo ativo com borda lateral
 * - Suporte a busca/filtro de arquivos
 */

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileCode2,
  FileJson,
  FileText,
  FileType,
  File,
  Lock,
  Search,
  X,
} from 'lucide-react';
import { useOracleStore, type FileEntry } from '@/stores/oracle.store';

// ─── Mapeamento de ícones por extensão ────────────────────────────────────────

interface FileIconConfig {
  icon: typeof FileCode2;
  color: string;
  label: string;
}

const FILE_ICON_MAP: Record<string, FileIconConfig> = {
  ts:    { icon: FileCode2, color: '#3b82f6', label: 'TypeScript' },
  tsx:   { icon: FileCode2, color: '#3b82f6', label: 'React TSX' },
  js:    { icon: FileCode2, color: '#f59e0b', label: 'JavaScript' },
  jsx:   { icon: FileCode2, color: '#f59e0b', label: 'React JSX' },
  css:   { icon: FileType,  color: '#ec4899', label: 'CSS' },
  scss:  { icon: FileType,  color: '#ec4899', label: 'SCSS' },
  json:  { icon: FileJson,  color: '#f59e0b', label: 'JSON' },
  md:    { icon: FileText,  color: '#94a3b8', label: 'Markdown' },
  html:  { icon: FileCode2, color: '#f97316', label: 'HTML' },
  py:    { icon: FileCode2, color: '#3b82f6', label: 'Python' },
  sh:    { icon: FileCode2, color: '#10b981', label: 'Shell' },
  yml:   { icon: FileText,  color: '#10b981', label: 'YAML' },
  yaml:  { icon: FileText,  color: '#10b981', label: 'YAML' },
  svg:   { icon: FileType,  color: '#f97316', label: 'SVG' },
  png:   { icon: FileType,  color: '#8b5cf6', label: 'PNG' },
  jpg:   { icon: FileType,  color: '#8b5cf6', label: 'JPEG' },
  env:   { icon: Lock,      color: '#ef4444', label: 'Environment' },
  lock:  { icon: Lock,      color: '#6b7280', label: 'Lock File' },
  test:  { icon: FileCode2, color: '#10b981', label: 'Test File' },
  spec:  { icon: FileCode2, color: '#10b981', label: 'Spec File' },
};

function getFileIconConfig(path: string): FileIconConfig {
  const name = path.split('/').pop() ?? '';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';

  // Detecta arquivos de teste
  if (name.includes('.test.') || name.includes('.spec.')) {
    return FILE_ICON_MAP['test'];
  }

  // Detecta .env*
  if (name.startsWith('.env')) {
    return FILE_ICON_MAP['env'];
  }

  // Detecta lock files
  if (name.endsWith('-lock.json') || name === 'yarn.lock' || name === 'pnpm-lock.yaml') {
    return FILE_ICON_MAP['lock'];
  }

  return FILE_ICON_MAP[ext] ?? { icon: File, color: 'rgba(255,255,255,0.4)', label: ext.toUpperCase() || 'File' };
}

function FileIcon({ path }: { path: string }) {
  const config = getFileIconConfig(path);
  const Icon = config.icon;
  return <Icon size={13} style={{ color: config.color, flexShrink: 0 }} />;
}

// ─── Detecção de linguagem por extensão ──────────────────────────────────────

function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
    css: 'css', scss: 'scss', json: 'json', md: 'markdown', html: 'html',
    py: 'python', sh: 'shell', yml: 'yaml', yaml: 'yaml', sql: 'sql',
  };
  return langMap[ext] ?? 'plaintext';
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

// ─── Estrutura de árvore hierárquica ─────────────────────────────────────────

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
  file?: FileEntry;
}

function buildHierarchicalTree(files: Record<string, FileEntry>): TreeNode {
  const root: TreeNode = { name: 'root', path: '', isFolder: true, children: [] };

  const sortedPaths = Object.keys(files).sort();

  for (const filePath of sortedPaths) {
    const parts = filePath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

      if (isLast) {
        // Arquivo
        current.children.push({
          name: part,
          path: filePath,
          isFolder: false,
          children: [],
          file: files[filePath],
        });
      } else {
        // Pasta
        let folder = current.children.find((c) => c.isFolder && c.name === part);
        if (!folder) {
          folder = { name: part, path: currentPath, isFolder: true, children: [] };
          current.children.push(folder);
        }
        current = folder;
      }
    }
  }

  // Ordena: pastas primeiro, depois arquivos, ambos alfabeticamente
  const sortChildren = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortChildren);
  };
  sortChildren(root);

  return root;
}

// ─── Componente de nó da árvore ──────────────────────────────────────────────

interface TreeNodeComponentProps {
  node: TreeNode;
  depth: number;
  openFolders: Set<string>;
  toggleFolder: (path: string) => void;
  selectFile: (path: string) => void;
  activeFile: string | null;
  isLocked: boolean;
  searchQuery: string;
}

function TreeNodeComponent({
  node,
  depth,
  openFolders,
  toggleFolder,
  selectFile,
  activeFile,
  isLocked,
  searchQuery,
}: TreeNodeComponentProps) {
  if (node.isFolder) {
    const isOpen = openFolders.has(node.path);
    const hasMatchingChildren = searchQuery
      ? node.children.some((c) =>
          c.isFolder
            ? true // Mostra pastas sempre durante busca
            : c.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : true;

    if (searchQuery && !hasMatchingChildren) return null;

    return (
      <div>
        <button
          onClick={() => toggleFolder(node.path)}
          className="w-full flex items-center gap-2 py-1 px-2 rounded-lg transition-colors"
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--glass-2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
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
            {node.name}
          </span>
          <span
            className="text-[9px] font-mono ml-auto"
            style={{ color: 'var(--text-muted)', opacity: 0.5 }}
          >
            {node.children.filter((c) => !c.isFolder).length}
          </span>
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: 'hidden' }}
            >
              {node.children.map((child) => (
                <TreeNodeComponent
                  key={child.path}
                  node={child}
                  depth={depth + 1}
                  openFolders={openFolders}
                  toggleFolder={toggleFolder}
                  selectFile={selectFile}
                  activeFile={activeFile}
                  isLocked={isLocked}
                  searchQuery={searchQuery}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Arquivo
  if (searchQuery && !node.name.toLowerCase().includes(searchQuery.toLowerCase())) {
    return null;
  }

  const isActive = activeFile === node.path;

  return (
    <motion.button
      key={node.path}
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.15 }}
      onClick={() => selectFile(node.path)}
      className="w-full flex items-center gap-2 py-1 px-2 rounded-lg text-left transition-colors"
      style={{
        paddingLeft: `${8 + depth * 16}px`,
        background: isActive ? 'var(--glass-3)' : 'transparent',
        borderLeft: isActive ? '2px solid rgba(124,58,237,0.6)' : '2px solid transparent',
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = 'var(--glass-2)';
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = 'transparent';
      }}
    >
      <FileIcon path={node.path} />
      <span
        className="font-mono text-xs truncate flex-1"
        style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
      >
        {node.name}
      </span>
      <AnimatePresence>
        {node.file && <NewBadge addedAt={node.file.updatedAt} />}
      </AnimatePresence>
      {isLocked && isActive && <Lock size={9} style={{ color: '#a78bfa', flexShrink: 0 }} />}
    </motion.button>
  );
}

// ─── FileTree Principal ──────────────────────────────────────────────────────

export function FileTree() {
  const { files, activeFile, taskStatus } = useOracleStore();
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const fileCount = Object.keys(files).length;
  const isLocked = taskStatus === 'running' || taskStatus === 'planning';

  // Constrói árvore hierárquica
  const tree = useMemo(() => buildHierarchicalTree(files), [files]);

  // Auto-expande pastas quando novos arquivos são adicionados
  useEffect(() => {
    const newFolders = new Set(openFolders);
    Object.keys(files).forEach((path) => {
      const parts = path.split('/');
      for (let i = 1; i < parts.length; i++) {
        newFolders.add(parts.slice(0, i).join('/'));
      }
    });
    if (newFolders.size !== openFolders.size) {
      setOpenFolders(newFolders);
    }
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFolder = (folder: string) => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      next.has(folder) ? next.delete(folder) : next.add(folder);
      return next;
    });
  };

  const selectFile = (path: string) => {
    const store = useOracleStore.getState();
    store.setActiveFile(path);
    store.setActiveTab('code' as never);
  };

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#080808' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 sticky top-0 z-10"
        style={{ background: '#080808', borderBottom: '1px solid var(--glass-border)' }}
      >
        <div className="flex items-center gap-2">
          <Folder size={14} style={{ color: '#f59e0b' }} />
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
        {fileCount > 0 && (
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="p-1 rounded-lg transition-colors"
            style={{ color: showSearch ? '#a78bfa' : 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--glass-2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {showSearch ? <X size={13} /> : <Search size={13} />}
          </button>
        )}
      </div>

      {/* Barra de busca */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="px-3 pb-2"
            style={{ borderBottom: '1px solid var(--glass-border)' }}
          >
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar arquivo..."
              autoFocus
              className="w-full bg-transparent border-none outline-none text-xs font-mono py-1.5 px-2 rounded-lg"
              style={{
                background: 'var(--glass-2)',
                color: 'var(--text-primary)',
                border: '1px solid var(--glass-border)',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Conteúdo */}
      <div className="p-2">
        {fileCount === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <File size={24} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
            <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum arquivo gerado</p>
          </div>
        ) : (
          tree.children.map((child) => (
            <TreeNodeComponent
              key={child.path}
              node={child}
              depth={0}
              openFolders={openFolders}
              toggleFolder={toggleFolder}
              selectFile={selectFile}
              activeFile={activeFile}
              isLocked={isLocked}
              searchQuery={searchQuery}
            />
          ))
        )}
      </div>
    </div>
  );
}
