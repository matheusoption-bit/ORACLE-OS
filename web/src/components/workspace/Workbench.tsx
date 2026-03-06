'use client';

import { useState } from 'react';
import { useOracleStore } from '@/stores/oracle.store';
import { Editor } from '@monaco-editor/react';
import { FileCode2, Terminal, MonitorPlay, FolderTree } from 'lucide-react';

type Tab = 'preview' | 'code' | 'files' | 'terminal';

export default function Workbench() {
  const [activeTab, setActiveTab] = useState<Tab>('preview');
  const { files, activeFile, logs, taskStatus } = useOracleStore();

  const fileContent = activeFile && files[activeFile] ? files[activeFile].content : '// Aguardando criação de arquivo…';

  return (
    <div className="flex flex-col h-full bg-[#111111]">
      {/* Tab Nav */}
      <div className="flex items-center gap-1 p-2 border-b border-[#1f1f1f] bg-[#0d0d0d]">
        <button 
          onClick={() => setActiveTab('preview')}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition ${activeTab === 'preview' ? 'bg-[#1f1f1f] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <MonitorPlay size={16} /> Preview
        </button>
        <button 
          onClick={() => setActiveTab('code')}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition ${activeTab === 'code' ? 'bg-[#1f1f1f] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <FileCode2 size={16} /> Code
          {taskStatus === 'running' && <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">🔒</span>}
        </button>
        <button 
          onClick={() => setActiveTab('files')}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition ${activeTab === 'files' ? 'bg-[#1f1f1f] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <FolderTree size={16} /> Files
        </button>
        <button 
          onClick={() => setActiveTab('terminal')}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition ${activeTab === 'terminal' ? 'bg-[#1f1f1f] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <Terminal size={16} /> Terminal
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 relative overflow-hidden">
        
        {/* Preview Tab (Iframe renderizando HTML) */}
        {activeTab === 'preview' && (
          <div className="w-full h-full bg-white flex items-center justify-center p-4">
            {/* Num cenário real criaríamos um Blob object / proxy p renderizar o HTML gerado */}
            {files['index.html'] ? (
              <iframe 
              srcDoc={files['index.html']?.content}
                className="w-full h-full border rounded shadow-lg"
                sandbox="allow-scripts"
              />
            ) : (
              <div className="text-zinc-400 flex flex-col items-center">
                <MonitorPlay size={48} className="mb-4 opacity-20" />
                <p>Nenhum render visual disponível.</p>
                <p className="text-sm">O agente criará um arquivo html em breve.</p>
              </div>
            )}
          </div>
        )}

        {/* Code Tab (Monaco Editor) */}
        {activeTab === 'code' && (
          <div className="w-full h-full pt-1">
             <div className="px-4 py-2 border-b border-[#1f1f1f] text-xs text-zinc-500 flex justify-between">
               <span>{activeFile || 'Sem arquivo selecionado'}</span>
             </div>
             <Editor
               height="calc(100% - 33px)"
               defaultLanguage="typescript"
               theme="vs-dark"
               value={fileContent}
               options={{
                 readOnly: taskStatus === 'running',
                 minimap: { enabled: false },
                 fontSize: 14,
                 fontFamily: 'var(--font-geist-mono), monospace',
                 padding: { top: 16 }
               }}
             />
          </div>
        )}

        {/* Files Tab (File Tree Mock) */}
        {activeTab === 'files' && (
          <div className="w-full h-full p-4 overflow-y-auto">
             <h3 className="text-xs font-semibold text-zinc-500 mb-4 uppercase tracking-wider">Workspace Files</h3>
             {Object.keys(files).length === 0 ? (
               <p className="text-sm text-zinc-600">Nenhum arquivo gerado ainda.</p>
             ) : (
               <div className="space-y-1">
                 {Object.keys(files).map(path => (
                   <div 
                     key={path}
                     onClick={() => { useOracleStore.getState().setActiveFile(path); setActiveTab('code'); }}
                     className="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-[#1a1a1a] text-sm text-zinc-300"
                   >
                     <FileCode2 size={16} className={path.endsWith('.ts') || path.endsWith('.tsx') ? 'text-blue-400' : 'text-zinc-500'} />
                     {path}
                   </div>
                 ))}
               </div>
             )}
          </div>
        )}

        {/* Terminal Tab */}
        {activeTab === 'terminal' && (
          <div className="w-full h-full bg-[#0a0a0a] p-4 font-mono text-sm overflow-y-auto">
             {logs.length === 0 ? (
               <span className="text-zinc-600">Aguardando logs do sistema...</span>
             ) : (
               logs.map((L, i) => (
                 <div key={i} className="mb-1 text-zinc-300">
                   <span className="text-zinc-600 mr-2">{new Date().toLocaleTimeString()}</span>
                   {L}
                 </div>
               ))
             )}
          </div>
        )}

      </div>
    </div>
  );
}
