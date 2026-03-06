'use client';

/**
 * AgentGraphView — Visualização interativa do grafo de estados LangGraph
 *
 * Exibe os nós (Planner, Frontend Executor, Backend Executor, Executor,
 * Reviewer, Save Skill) e as arestas entre eles, destacando o nó ativo
 * e o status de cada etapa em tempo real.
 *
 * Implementado com SVG puro + Framer Motion para evitar dependências pesadas.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useOracleStore } from '@/stores/oracle.store';
import type { OracleTaskStatus } from '@/types/oracle.types';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface GraphNode {
  id:    string;
  label: string;
  x:     number;
  y:     number;
  icon:  string;
}

interface GraphEdge {
  from:  string;
  to:    string;
  label?: string;
}

// ─── Definição do grafo (posições em coordenadas SVG 400×320) ─────────────────
const NODES: GraphNode[] = [
  { id: 'planner',           label: 'Planner',         x: 200, y: 30,  icon: '🧠' },
  { id: 'frontend_executor', label: 'Frontend Exec',   x: 60,  y: 130, icon: '🎨' },
  { id: 'executor',          label: 'Executor',        x: 200, y: 130, icon: '⚙️' },
  { id: 'backend_executor',  label: 'Backend Exec',    x: 340, y: 130, icon: '🔧' },
  { id: 'reviewer',          label: 'Reviewer',        x: 200, y: 230, icon: '🔍' },
  { id: 'save_skill',        label: 'Save Skill',      x: 200, y: 310, icon: '💾' },
];

const EDGES: GraphEdge[] = [
  { from: 'planner',           to: 'frontend_executor', label: 'frontend' },
  { from: 'planner',           to: 'executor',          label: 'generic' },
  { from: 'planner',           to: 'backend_executor',  label: 'backend' },
  { from: 'frontend_executor', to: 'reviewer' },
  { from: 'executor',          to: 'reviewer' },
  { from: 'backend_executor',  to: 'reviewer' },
  { from: 'reviewer',          to: 'save_skill',        label: 'approved' },
  { from: 'reviewer',          to: 'executor',          label: 'revision' },
];

// ─── Mapeamento de status da tarefa → nó ativo ────────────────────────────────
function getActiveNode(status: OracleTaskStatus | 'idle'): string | null {
  switch (status) {
    case 'planning':  return 'planner';
    case 'executing': return 'executor';
    case 'reviewing': return 'reviewer';
    case 'completed': return 'save_skill';
    default:          return null;
  }
}

// ─── Componente de aresta ─────────────────────────────────────────────────────
function Edge({ from, to, label, isActive }: GraphEdge & { isActive: boolean }) {
  const fromNode = NODES.find((n) => n.id === from)!;
  const toNode   = NODES.find((n) => n.id === to)!;

  const dx = toNode.x - fromNode.x;
  const dy = toNode.y - fromNode.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const r = 26; // raio do nó

  const x1 = fromNode.x + (dx / len) * r;
  const y1 = fromNode.y + (dy / len) * r;
  const x2 = toNode.x   - (dx / len) * r;
  const y2 = toNode.y   - (dy / len) * r;

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  return (
    <g>
      <motion.line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={isActive ? '#a78bfa' : 'rgba(255,255,255,0.12)'}
        strokeWidth={isActive ? 2 : 1}
        markerEnd="url(#arrow)"
        animate={{ opacity: isActive ? 1 : 0.4 }}
        transition={{ duration: 0.4 }}
      />
      {label && (
        <text
          x={midX} y={midY - 4}
          textAnchor="middle"
          fontSize={8}
          fill={isActive ? '#c4b5fd' : 'rgba(255,255,255,0.3)'}
          fontFamily="monospace"
        >
          {label}
        </text>
      )}
    </g>
  );
}

// ─── Componente de nó ─────────────────────────────────────────────────────────
function Node({ id, label, x, y, icon, isActive, isCompleted }: GraphNode & { isActive: boolean; isCompleted: boolean }) {
  const borderColor = isActive
    ? '#a78bfa'
    : isCompleted
    ? '#34d399'
    : 'rgba(255,255,255,0.15)';

  const bgColor = isActive
    ? 'rgba(124,58,237,0.25)'
    : isCompleted
    ? 'rgba(52,211,153,0.12)'
    : 'rgba(255,255,255,0.04)';

  return (
    <motion.g
      animate={{ scale: isActive ? 1.12 : 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      style={{ transformOrigin: `${x}px ${y}px` }}
    >
      {/* Pulso ao redor do nó ativo */}
      {isActive && (
        <motion.circle
          cx={x} cy={y} r={32}
          fill="none"
          stroke="#a78bfa"
          strokeWidth={1.5}
          animate={{ r: [28, 38, 28], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Círculo principal */}
      <circle
        cx={x} cy={y} r={26}
        fill={bgColor}
        stroke={borderColor}
        strokeWidth={1.5}
      />

      {/* Ícone */}
      <text x={x} y={y - 4} textAnchor="middle" fontSize={14} dominantBaseline="middle">
        {icon}
      </text>

      {/* Label */}
      <text
        x={x} y={y + 16}
        textAnchor="middle"
        fontSize={7.5}
        fill={isActive ? '#e9d5ff' : isCompleted ? '#6ee7b7' : 'rgba(255,255,255,0.5)'}
        fontFamily="monospace"
        fontWeight={isActive ? 'bold' : 'normal'}
      >
        {label}
      </text>
    </motion.g>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function AgentGraphView() {
  const { taskStatus, subtasks, currentSubtask, iterationCount } = useOracleStore();

  const activeNode = getActiveNode(taskStatus as OracleTaskStatus | 'idle');
  const completedNodes = new Set<string>();

  if (taskStatus === 'reviewing' || taskStatus === 'completed') {
    completedNodes.add('planner');
    completedNodes.add('executor');
    completedNodes.add('frontend_executor');
    completedNodes.add('backend_executor');
  }
  if (taskStatus === 'completed') {
    completedNodes.add('reviewer');
    completedNodes.add('save_skill');
  }

  const progressPct = subtasks.length > 0
    ? Math.round((Math.min(currentSubtask, subtasks.length) / subtasks.length) * 100)
    : 0;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--glass-border)' }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
            Grafo de Agentes
          </span>
          {iterationCount > 0 && (
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' }}
            >
              iter {iterationCount}
            </span>
          )}
        </div>
        {subtasks.length > 0 && (
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {progressPct}% concluído
          </span>
        )}
      </div>

      {/* SVG do grafo */}
      <div className="flex items-center justify-center p-2">
        <svg viewBox="0 0 400 350" width="100%" style={{ maxHeight: 260 }}>
          <defs>
            <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="rgba(255,255,255,0.25)" />
            </marker>
          </defs>

          {/* Arestas */}
          {EDGES.map((edge, i) => (
            <Edge
              key={i}
              {...edge}
              isActive={
                activeNode === edge.from || activeNode === edge.to
              }
            />
          ))}

          {/* Nós */}
          {NODES.map((node) => (
            <Node
              key={node.id}
              {...node}
              isActive={activeNode === node.id}
              isCompleted={completedNodes.has(node.id)}
            />
          ))}
        </svg>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 px-4 pb-3" style={{ borderTop: '1px solid var(--glass-border)' }}>
        <div className="flex items-center gap-1.5 pt-2">
          <span className="w-2 h-2 rounded-full" style={{ background: '#a78bfa' }} />
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Ativo</span>
        </div>
        <div className="flex items-center gap-1.5 pt-2">
          <span className="w-2 h-2 rounded-full" style={{ background: '#34d399' }} />
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Concluído</span>
        </div>
        <div className="flex items-center gap-1.5 pt-2">
          <span className="w-2 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Pendente</span>
        </div>
      </div>
    </div>
  );
}
