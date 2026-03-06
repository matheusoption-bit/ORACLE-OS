/**
 * ORACLE-OS · Testes unitários — Dynamic Indexer (Sprint 9)
 * Cobre: indexFile, reindexDirectory, startDynamicIndexer (parcial)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';

// ─── Mocks ────────────────────────────────────────────────────────────────────
vi.mock('fs', () => ({
  existsSync:   vi.fn(),
  statSync:     vi.fn(),
  readdirSync:  vi.fn(),
  watch:        vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('../monitoring/logger.js', () => ({
  ragLogger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('./vector-store.js', () => ({
  getVectorStore: vi.fn().mockResolvedValue({
    addDocuments: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Import após mocks
import { indexFile, reindexDirectory } from './dynamic-indexer.js';

const mockExistsSync  = vi.mocked(existsSync);
const mockReadFile    = vi.mocked(readFile);

// ─── indexFile ────────────────────────────────────────────────────────────────
describe('indexFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ignora arquivo que não existe', async () => {
    mockExistsSync.mockReturnValue(false);
    await indexFile('/tmp/nao-existe.ts');
    // Não deve lançar erro
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('ignora extensões não suportadas', async () => {
    mockExistsSync.mockReturnValue(true);
    await indexFile('/tmp/arquivo.png');
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('ignora arquivo com conteúdo vazio', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue('   \n  ' as any);

    const { getVectorStore } = await import('./vector-store.js');
    const mockStore = { addDocuments: vi.fn() };
    vi.mocked(getVectorStore).mockResolvedValue(mockStore as any);

    await indexFile('/tmp/vazio.ts');
    expect(mockStore.addDocuments).not.toHaveBeenCalled();
  });

  it('indexa arquivo TypeScript com conteúdo válido', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue('export const hello = "world";' as any);

    const { getVectorStore } = await import('./vector-store.js');
    const mockStore = { addDocuments: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(getVectorStore).mockResolvedValue(mockStore as any);

    await indexFile('/tmp/hello.ts');

    expect(mockStore.addDocuments).toHaveBeenCalledOnce();
    const [docs] = mockStore.addDocuments.mock.calls[0];
    expect(docs[0].metadata.ext).toBe('.ts');
    expect(docs[0].pageContent).toContain('hello.ts');
  });

  it('limita o conteúdo a 4000 caracteres', async () => {
    mockExistsSync.mockReturnValue(true);
    const longContent = 'x'.repeat(10_000);
    mockReadFile.mockResolvedValue(longContent as any);

    const { getVectorStore } = await import('./vector-store.js');
    const mockStore = { addDocuments: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(getVectorStore).mockResolvedValue(mockStore as any);

    await indexFile('/tmp/long.ts');

    const [docs] = mockStore.addDocuments.mock.calls[0];
    // pageContent inclui "File: ...\n\n" + conteúdo (max 4000)
    expect(docs[0].pageContent.length).toBeLessThanOrEqual(4000 + 50);
  });

  it('captura erro do vector store sem propagar', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue('const x = 1;' as any);

    const { getVectorStore } = await import('./vector-store.js');
    vi.mocked(getVectorStore).mockRejectedValue(new Error('ChromaDB offline'));

    // Não deve lançar
    await expect(indexFile('/tmp/test.ts')).resolves.toBeUndefined();
  });
});

// ─── reindexDirectory ─────────────────────────────────────────────────────────
describe('reindexDirectory', () => {
  it('chama scanDirectory e não lança erro quando diretório não existe', async () => {
    mockExistsSync.mockReturnValue(false);
    // Não deve lançar
    await expect(reindexDirectory('/tmp/inexistente')).resolves.toBeUndefined();
  });

  it('processa diretório com arquivos suportados', async () => {
    const { readdirSync } = await import('fs');
    const mockReaddirSync = vi.mocked(readdirSync);

    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue('const a = 1;' as any);

    // Simula um diretório com 2 arquivos
    mockReaddirSync.mockReturnValue([
      { name: 'index.ts', isDirectory: () => false, isFile: () => true },
      { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
    ] as any);

    const { getVectorStore } = await import('./vector-store.js');
    const mockStore = { addDocuments: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(getVectorStore).mockResolvedValue(mockStore as any);

    await reindexDirectory('/tmp/src');

    expect(mockStore.addDocuments).toHaveBeenCalledTimes(2);
  });

  it('ignora diretórios excluídos (node_modules, .git)', async () => {
    const { readdirSync } = await import('fs');
    const mockReaddirSync = vi.mocked(readdirSync);

    mockExistsSync.mockReturnValue(true);

    // Simula diretório com node_modules e .git
    mockReaddirSync.mockReturnValue([
      { name: 'node_modules', isDirectory: () => true, isFile: () => false },
      { name: '.git',         isDirectory: () => true, isFile: () => false },
      { name: 'src',          isDirectory: () => true, isFile: () => false },
    ] as any);

    // Para o subdiretório 'src', retorna vazio
    mockReaddirSync.mockReturnValueOnce([
      { name: 'node_modules', isDirectory: () => true, isFile: () => false },
      { name: '.git',         isDirectory: () => true, isFile: () => false },
    ] as any).mockReturnValueOnce([] as any);

    const { getVectorStore } = await import('./vector-store.js');
    const mockStore = { addDocuments: vi.fn() };
    vi.mocked(getVectorStore).mockResolvedValue(mockStore as any);

    await reindexDirectory('/tmp/project');

    // Nenhum arquivo deve ter sido indexado (node_modules e .git ignorados, src vazio)
    expect(mockStore.addDocuments).not.toHaveBeenCalled();
  });
});
