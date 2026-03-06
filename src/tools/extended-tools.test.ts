/**
 * ORACLE-OS · Testes unitários — Extended Tools (Sprint 9)
 * Cobre: db_migrate, test_run, deployment_deploy
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';

// ─── Mock do child_process ────────────────────────────────────────────────────
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// ─── Mock do logger ───────────────────────────────────────────────────────────
vi.mock('../monitoring/logger.js', () => ({
  toolLogger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import após mocks
import { dbMigrateTool, testRunTool, deploymentDeployTool } from './extended-tools.js';

const mockExecSync = vi.mocked(execSync);

// ─── db_migrate ───────────────────────────────────────────────────────────────
describe('db_migrate tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executa prisma migrate status com sucesso', async () => {
    mockExecSync.mockReturnValue(Buffer.from('Database schema is up to date!'));

    const result = JSON.parse(
      await dbMigrateTool.func({ tool: 'prisma', command: 'status', cwd: '/tmp' })
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('up to date');
    expect(mockExecSync).toHaveBeenCalledWith(
      'npx prisma migrate status',
      expect.objectContaining({ cwd: '/tmp', timeout: 60_000 })
    );
  });

  it('executa prisma migrate deploy com sucesso', async () => {
    mockExecSync.mockReturnValue(Buffer.from('Migrations applied: 2'));

    const result = JSON.parse(
      await dbMigrateTool.func({ tool: 'prisma', command: 'deploy' })
    );

    expect(result.success).toBe(true);
    expect(mockExecSync).toHaveBeenCalledWith(
      'npx prisma migrate deploy',
      expect.any(Object)
    );
  });

  it('retorna erro quando execSync lança exceção', async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('Migration failed: column already exists');
    });

    const result = JSON.parse(
      await dbMigrateTool.func({ tool: 'prisma', command: 'deploy' })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Migration failed');
  });

  it('retorna erro quando sql não tem caminho de arquivo', async () => {
    const result = JSON.parse(
      await dbMigrateTool.func({ tool: 'sql' })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('SQL obrigatório');
  });

  it('usa status como comando padrão para prisma', async () => {
    mockExecSync.mockReturnValue(Buffer.from('ok'));

    await dbMigrateTool.func({ tool: 'prisma' });

    expect(mockExecSync).toHaveBeenCalledWith(
      'npx prisma migrate status',
      expect.any(Object)
    );
  });
});

// ─── test_run ─────────────────────────────────────────────────────────────────
describe('test_run tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executa vitest com sucesso e parseia JSON', async () => {
    const mockReport = {
      numTotalTests: 10,
      numPassedTests: 10,
      numFailedTests: 0,
    };
    mockExecSync.mockReturnValue(Buffer.from(JSON.stringify(mockReport)));

    const result = JSON.parse(
      await testRunTool.func({ runner: 'vitest', coverage: false })
    );

    expect(result.success).toBe(true);
    expect(result.runner).toBe('vitest');
    expect(result.report).toMatchObject({ numTotalTests: 10 });
  });

  it('retorna output bruto quando JSON não é parseável', async () => {
    mockExecSync.mockReturnValue(Buffer.from('PASS src/test.ts\n✓ all tests passed'));

    const result = JSON.parse(
      await testRunTool.func({ runner: 'jest', coverage: false })
    );

    expect(result.success).toBe(true);
    expect(result.report).toHaveProperty('rawOutput');
  });

  it('inclui flag --coverage quando solicitado', async () => {
    mockExecSync.mockReturnValue(Buffer.from('{}'));

    await testRunTool.func({ runner: 'vitest', coverage: true });

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('--coverage'),
      expect.any(Object)
    );
  });

  it('inclui padrão glob quando fornecido', async () => {
    mockExecSync.mockReturnValue(Buffer.from('{}'));

    await testRunTool.func({ runner: 'vitest', pattern: 'src/**/*.test.ts', coverage: false });

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('src/**/*.test.ts'),
      expect.any(Object)
    );
  });

  it('retorna success=false quando testes falham (exceção)', async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('2 tests failed');
    });

    const result = JSON.parse(
      await testRunTool.func({ runner: 'vitest', coverage: false })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('2 tests failed');
  });
});

// ─── deployment_deploy ────────────────────────────────────────────────────────
describe('deployment_deploy tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna dry-run sem executar comando', async () => {
    const result = JSON.parse(
      await deploymentDeployTool.func({
        target: 'vercel',
        environment: 'staging',
        dryRun: true,
      })
    );

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it('executa vercel --prod para produção', async () => {
    mockExecSync.mockReturnValue(Buffer.from('Deployed to production'));

    const result = JSON.parse(
      await deploymentDeployTool.func({
        target: 'vercel',
        environment: 'production',
        dryRun: false,
      })
    );

    expect(result.success).toBe(true);
    expect(mockExecSync).toHaveBeenCalledWith(
      'npx vercel --prod --yes',
      expect.any(Object)
    );
  });

  it('executa vercel sem --prod para staging', async () => {
    mockExecSync.mockReturnValue(Buffer.from('Preview deployed'));

    await deploymentDeployTool.func({
      target: 'vercel',
      environment: 'staging',
      dryRun: false,
    });

    expect(mockExecSync).toHaveBeenCalledWith(
      'npx vercel --yes',
      expect.any(Object)
    );
  });

  it('executa docker-compose up para target docker-compose', async () => {
    mockExecSync.mockReturnValue(Buffer.from('Containers started'));

    await deploymentDeployTool.func({
      target: 'docker-compose',
      environment: 'staging',
      dryRun: false,
    });

    expect(mockExecSync).toHaveBeenCalledWith(
      'docker-compose up -d --build',
      expect.any(Object)
    );
  });

  it('executa script customizado quando target=custom', async () => {
    mockExecSync.mockReturnValue(Buffer.from('Custom deploy done'));

    await deploymentDeployTool.func({
      target: 'custom',
      environment: 'staging',
      customScript: 'bash deploy.sh',
      dryRun: false,
    });

    expect(mockExecSync).toHaveBeenCalledWith(
      'bash deploy.sh',
      expect.any(Object)
    );
  });

  it('retorna erro quando target=custom sem customScript', async () => {
    const result = JSON.parse(
      await deploymentDeployTool.func({
        target: 'custom',
        environment: 'staging',
        dryRun: false,
      })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('customScript obrigatório');
  });

  it('retorna erro quando execSync lança exceção', async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('Deploy failed: authentication error');
    });

    const result = JSON.parse(
      await deploymentDeployTool.func({
        target: 'railway',
        environment: 'production',
        dryRun: false,
      })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Deploy failed');
  });
});
