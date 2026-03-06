'use client';

import { useRef, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { Lock } from 'lucide-react';
import { useOracleStore } from '@/stores/oracle.store';

// Mapeamento de extensão → linguagem Monaco
function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact',
    js: 'javascript', jsx: 'javascriptreact',
    css: 'css', scss: 'scss',
    html: 'html', json: 'json',
    md: 'markdown', py: 'python',
    sh: 'shell', yml: 'yaml', yaml: 'yaml',
  };
  return map[ext] ?? 'plaintext';
}

export function CodeEditor() {
  const { files, activeFile, taskStatus } = useOracleStore();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const isLocked = taskStatus === 'running' || taskStatus === 'planning';
  const file = activeFile ? files[activeFile] : null;
  const content = file?.content ?? '// Selecione um arquivo na aba Files';
  const language = activeFile ? detectLanguage(activeFile) : 'plaintext';

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    // Define tema Apple Glass customizado
    monaco.editor.defineTheme('oracle-glass', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment',  foreground: '52525b', fontStyle: 'italic' },
        { token: 'keyword',  foreground: 'a78bfa' },
        { token: 'string',   foreground: '6ee7b7' },
        { token: 'number',   foreground: 'fbbf24' },
        { token: 'type',     foreground: '67e8f9' },
        { token: 'function', foreground: 'e879f9' },
        { token: 'variable', foreground: 'e4e4e7' },
        { token: 'operator', foreground: 'cbd5e1' },
      ],
      colors: {
        'editor.background':               '#080808',
        'editor.foreground':               '#e4e4e7',
        'editor.lineHighlightBackground':  '#ffffff06',
        'editor.selectionBackground':      '#7c3aed30',
        'editorLineNumber.foreground':     '#3f3f46',
        'editorLineNumber.activeForeground': '#71717a',
        'editorCursor.foreground':         '#7c3aed',
        'editorIndentGuide.background1':   '#1f1f23',
        'editorIndentGuide.activeBackground1': '#3f3f46',
        'editorGutter.background':         '#080808',
        'editorWidget.background':         '#111111',
        'editorSuggestWidget.background':  '#111111',
        'editorSuggestWidget.border':      '#2d2d35',
        'editorSuggestWidget.selectedBackground': '#7c3aed20',
        'scrollbarSlider.background':      '#ffffff10',
        'scrollbarSlider.hoverBackground': '#ffffff1a',
        'minimap.background':              '#080808',
      },
    });
    monaco.editor.setTheme('oracle-glass');
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ background: '#080808' }}>
      {/* Header do editor */}
      <div
        className="flex items-center justify-between px-4 h-9 shrink-0"
        style={{ borderBottom: '1px solid var(--glass-border)', background: 'var(--glass-1)' }}
      >
        <span className="font-mono text-xs truncate" style={{ color: 'var(--text-muted)' }}>
          {activeFile ?? 'Sem arquivo selecionado'}
        </span>

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--glass-2)', color: 'var(--text-muted)' }}>
            {language}
          </span>
          {isLocked && (
            <span
              className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full"
              style={{
                background: 'rgba(124,58,237,0.15)',
                color: '#a78bfa',
                border: '1px solid rgba(124,58,237,0.3)',
                animation: 'pulse 2s ease-in-out infinite',
              }}
            >
              <Lock size={9} />
              LOCKED
            </span>
          )}
        </div>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language={language}
          value={content}
          theme="oracle-glass"
          onMount={handleMount}
          options={{
            readOnly: isLocked,
            fontSize: 13,
            fontFamily: "'Geist Mono', 'SF Mono', Menlo, Consolas, monospace",
            fontLigatures: true,
            lineNumbers: 'on',
            minimap: { enabled: false },
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            padding: { top: 16, bottom: 16 },
            renderLineHighlight: 'line',
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            bracketPairColorization: { enabled: true },
            formatOnPaste: true,
            tabSize: 2,
          }}
        />
      </div>
    </div>
  );
}
