import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { OracleBridge } from './oracle-bridge.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors());
app.use(express.json());

// Única instancia da bridge por enquanto.
const bridge = new OracleBridge();

// Eventos da Bridge repassados pro WebSocket
bridge.on('task:started', (data) => broadcast({ type: 'task:started', ...data }));
bridge.on('plan:created', (data) => broadcast({ type: 'plan:created', ...data }));
bridge.on('subtask:started', (data) => broadcast({ type: 'subtask:started', ...data }));
bridge.on('subtask:completed', (data) => broadcast({ type: 'subtask:completed', ...data }));
bridge.on('file:created', (data) => broadcast({ type: 'file:created', ...data }));
bridge.on('review:started', (data) => broadcast({ type: 'review:started', ...data }));
bridge.on('review:approved', () => broadcast({ type: 'review:approved' }));
bridge.on('review:rejected', (data) => broadcast({ type: 'review:rejected', ...data }));
bridge.on('task:completed', (data) => broadcast({ type: 'task:completed', ...data }));
bridge.on('error', (data) => broadcast({ type: 'error', ...data }));
bridge.on('token', (data) => broadcast({ type: 'token', ...data }));

// Sprint 10: Evento de custo parcial em tempo real
bridge.on('agent:cost', (data) => broadcast({ type: 'agent:cost', ...data }));

// Sprint 10: Confirmação de recebimento de mensagem do usuário
bridge.on('user:message:received', (data) => broadcast({ type: 'user:message:received', ...data }));

function broadcast(message: any) {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

wss.on('connection', (ws: WebSocket) => {
  console.log('[WebSocket] Client connected');

  // Sprint 10: Escuta mensagens do usuário via WebSocket
  ws.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString());

      if (parsed.type === 'user:message' && parsed.content) {
        console.log(`[WebSocket] Mensagem do usuário: ${parsed.content.substring(0, 100)}`);
        bridge.handleUserMessage(parsed.content);
      }
    } catch (e) {
      console.warn('[WebSocket] Mensagem inválida recebida:', e);
    }
  });

  ws.on('close', () => console.log('[WebSocket] Client disconnected'));
});

/**
 * Inicia uma nova task
 */
app.post('/api/task', async (req, res) => {
  const { prompt, mode } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt é obrigatório' });
  }

  const taskId = Math.random().toString(36).substring(2, 9);
  
  // Roda em background async
  bridge.startTask(taskId, prompt, mode).catch(err => {
    console.error('[API] Erro ao executar task:', err);
    broadcast({ type: 'error', message: err.message });
  });

  return res.json({ taskId });
});

/**
 * Demais endpoints requisitados
 */
app.get('/api/tasks', (req, res) => {
  res.json({ tasks: [] });
});

app.get('/api/skills', (req, res) => {
  res.json({ skills: [] });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/metrics/summary', (req, res) => {
  res.json({ totalRuns: 0, successRate: 0, avgTimeMs: 0 });
});

const PORT = 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[API Bridge] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[API Bridge] WebSocket on ws://0.0.0.0:${PORT}/ws`);
});
