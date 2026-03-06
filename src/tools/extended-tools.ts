/**
 * ORACLE-OS · Extended MCP Tools
 *
 * Novas ferramentas MCP propostas na evolução Sprint 9:
 *   - db_migrate   : executa migrações de banco de dados (Prisma / SQL)
 *   - test_run     : executa testes unitários/integração e retorna relatório
 *   - deployment_deploy : realiza deploy em ambientes específicos
 *
 * Cada ferramenta segue o padrão DynamicStructuredTool do LangChain.
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { execSync } from 'child_process';
import { toolLogger } from '../monitoring/logger.js';

// ─── db_migrate ───────────────────────────────────────────────────────────────
export const dbMigrateTool = new DynamicStructuredTool({
  name: 'db_migrate',
  description:
    'Executa migrações de banco de dados. Suporta Prisma (prisma migrate deploy / reset) ' +
    'e scripts SQL arbitrários. Retorna o output do processo.',
  schema: z.object({
    tool: z.enum(['prisma', 'sql']).describe('Ferramenta de migração a usar'),
    command: z
      .string()
      .optional()
      .describe(
        'Para prisma: "deploy" | "reset" | "status". Para sql: caminho do arquivo .sql'
      ),
    cwd: z.string().optional().describe('Diretório de trabalho (padrão: process.cwd())'),
  }),
  func: async ({ tool, command, cwd }) => {
    const workDir = cwd ?? process.cwd();
    toolLogger.info('db_migrate chamado', { tool, command, cwd: workDir });

    try {
      let cmd: string;

      if (tool === 'prisma') {
        const sub = command ?? 'status';
        cmd = `npx prisma migrate ${sub}`;
      } else {
        if (!command) return JSON.stringify({ success: false, error: 'Caminho do arquivo SQL obrigatório.' });
        cmd = `psql $DATABASE_URL -f "${command}"`;
      }

      const output = execSync(cmd, { cwd: workDir, timeout: 60_000 }).toString();
      toolLogger.info('db_migrate concluído', { tool, command });
      return JSON.stringify({ success: true, output });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toolLogger.error('db_migrate falhou', { tool, command, error: message });
      return JSON.stringify({ success: false, error: message });
    }
  },
});

// ─── test_run ─────────────────────────────────────────────────────────────────
export const testRunTool = new DynamicStructuredTool({
  name: 'test_run',
  description:
    'Executa a suíte de testes do projeto (vitest, jest, mocha) e retorna ' +
    'um relatório estruturado com total de testes, falhas e cobertura.',
  schema: z.object({
    runner: z
      .enum(['vitest', 'jest', 'mocha', 'auto'])
      .default('auto')
      .describe('Test runner a usar. "auto" detecta pelo package.json'),
    pattern: z
      .string()
      .optional()
      .describe('Padrão glob para filtrar arquivos de teste (ex: "src/**/*.test.ts")'),
    coverage: z.boolean().default(false).describe('Gerar relatório de cobertura'),
    cwd: z.string().optional().describe('Diretório raiz do projeto'),
  }),
  func: async ({ runner, pattern, coverage, cwd }) => {
    const workDir = cwd ?? process.cwd();
    toolLogger.info('test_run chamado', { runner, pattern, coverage, cwd: workDir });

    try {
      // Detecta runner automaticamente
      let resolvedRunner = runner;
      if (runner === 'auto') {
        try {
          const pkg = JSON.parse(
            require('fs').readFileSync(`${workDir}/package.json`, 'utf-8')
          );
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };
          if (deps['vitest'])     resolvedRunner = 'vitest';
          else if (deps['jest'])  resolvedRunner = 'jest';
          else if (deps['mocha']) resolvedRunner = 'mocha';
          else                    resolvedRunner = 'vitest'; // fallback
        } catch {
          resolvedRunner = 'vitest';
        }
      }

      const patternFlag = pattern ? ` ${pattern}` : '';
      const coverageFlag = coverage ? ' --coverage' : '';

      const cmd =
        resolvedRunner === 'vitest'
          ? `npx vitest run${patternFlag}${coverageFlag} --reporter=json`
          : resolvedRunner === 'jest'
          ? `npx jest${patternFlag}${coverageFlag} --json`
          : `npx mocha${patternFlag}`;

      const raw = execSync(cmd, { cwd: workDir, timeout: 120_000 }).toString();

      // Tenta parsear JSON do vitest/jest
      let report: unknown;
      try {
        report = JSON.parse(raw);
      } catch {
        report = { rawOutput: raw };
      }

      toolLogger.info('test_run concluído', { runner: resolvedRunner });
      return JSON.stringify({ success: true, runner: resolvedRunner, report });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Mesmo com falhas de teste, retornamos o output
      toolLogger.warn('test_run com falhas', { error: message });
      return JSON.stringify({ success: false, error: message });
    }
  },
});

// ─── deployment_deploy ────────────────────────────────────────────────────────
export const deploymentDeployTool = new DynamicStructuredTool({
  name: 'deployment_deploy',
  description:
    'Realiza deploy da aplicação em um ambiente específico. ' +
    'Suporta Vercel, Railway, Docker Compose e scripts customizados.',
  schema: z.object({
    target: z
      .enum(['vercel', 'railway', 'docker-compose', 'custom'])
      .describe('Plataforma de deploy'),
    environment: z
      .enum(['development', 'staging', 'production'])
      .default('staging')
      .describe('Ambiente de destino'),
    customScript: z
      .string()
      .optional()
      .describe('Comando customizado (usado quando target="custom")'),
    cwd: z.string().optional().describe('Diretório raiz do projeto'),
    dryRun: z.boolean().default(false).describe('Apenas simula o deploy sem executar'),
  }),
  func: async ({ target, environment, customScript, cwd, dryRun }) => {
    const workDir = cwd ?? process.cwd();
    toolLogger.info('deployment_deploy chamado', { target, environment, dryRun, cwd: workDir });

    if (dryRun) {
      return JSON.stringify({
        success: true,
        dryRun: true,
        message: `[DRY RUN] Deploy para ${target} (${environment}) simulado com sucesso.`,
      });
    }

    try {
      let cmd: string;

      switch (target) {
        case 'vercel':
          cmd = environment === 'production'
            ? 'npx vercel --prod --yes'
            : 'npx vercel --yes';
          break;
        case 'railway':
          cmd = `npx railway up --environment ${environment}`;
          break;
        case 'docker-compose':
          cmd = `docker-compose up -d --build`;
          break;
        case 'custom':
          if (!customScript) return JSON.stringify({ success: false, error: 'customScript obrigatório para target=custom' });
          cmd = customScript;
          break;
      }

      const output = execSync(cmd!, { cwd: workDir, timeout: 300_000 }).toString();
      toolLogger.info('deployment_deploy concluído', { target, environment });
      return JSON.stringify({ success: true, target, environment, output });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toolLogger.error('deployment_deploy falhou', { target, environment, error: message });
      return JSON.stringify({ success: false, error: message });
    }
  },
});

// ─── Exportações agrupadas ────────────────────────────────────────────────────
export const EXTENDED_TOOLS = [dbMigrateTool, testRunTool, deploymentDeployTool];
