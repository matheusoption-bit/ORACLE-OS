import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startTask, completeTask, getMetrics, getSummary } from './metrics.js';
import { OracleLogger } from './logger.js';
import * as fs from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs') as any;
  return {
    ...actual,
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn()
  };
});

describe('Monitoring & Observability', () => {
   beforeEach(() => {
     vi.clearAllMocks();
   });

   it('startTask e completeTask calculam duração e registram JSON memory', () => {
      const stateMock = { 
        reviewStatus: 'pending', 
        iterationCount: 1, 
        subtasks: [{}, {}], 
        results: { "s-1": { status: 'success' } }, 
        errors: [] 
      } as any;
      
      startTask('test-01', 'Task teste metrics', stateMock);
      
      const inProcess = getMetrics().find(m => m.taskId === 'test-01');
      expect(inProcess).toBeDefined();
      expect(inProcess?.status).toBe('running');

      // Avança no tempo artificialmente
      vi.useFakeTimers();
      vi.advanceTimersByTime(2500);
      
      completeTask('test-01', { ...stateMock, reviewStatus: 'approved' });
      vi.useRealTimers();

      const done = getMetrics().find(m => m.taskId === 'test-01');
      expect(done?.status).toBe('completed');
      expect(done?.durationMs).toBeGreaterThanOrEqual(2500);
      expect(done?.reviewStatus).toBe('approved');
   });

   it('getSummary extrai taxa de sucesso e contagem correta', () => {
      const s = getSummary();
      expect(s.totalTasks).toBeGreaterThan(0);
      expect(s.successRate).toBeGreaterThan(0); 
   });

   it('OracleLogger não quebra a gravação em disco e printa pro stdout', () => {
      const spyConsole = vi.spyOn(console, 'log').mockImplementation(() => {});
      const spyAppend = vi.spyOn(fs, 'appendFileSync');

      const testLog = new OracleLogger('TestContext');
      
      testLog.info('Mensagem Informativa');
      testLog.error('Mensagem de Erro');

      expect(spyConsole).toHaveBeenCalledTimes(2);
      // Cada log é escrito em oracle.log e oracle.jsonl
      expect(spyAppend).toHaveBeenCalledTimes(4);
      
      spyConsole.mockRestore();
      spyAppend.mockRestore();
   });
});
