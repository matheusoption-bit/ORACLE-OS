/**
 * ORACLE-OS · RAG Dynamic Indexer
 *
 * Implementa indexação dinâmica da base de código em tempo real.
 * Monitora alterações no sistema de arquivos e atualiza o ChromaDB
 * automaticamente, garantindo que o RAG sempre reflita o estado
 * mais recente do projeto.
 *
 * Estratégia:
 *  1. Varredura inicial de todos os arquivos relevantes
 *  2. Watcher (fs.watch) para detectar criações e modificações
 *  3. Debounce de 500ms para evitar indexações redundantes
 *  4. Exclusão de padrões irrelevantes (node_modules, .git, dist)
 */
import { watch, existsSync, statSync, readdirSync } from 'fs';
import { readFile } from 'fs/promises';
import { resolve, extname, join } from 'path';
import { ragLogger } from '../monitoring/logger.js';
import { getVectorStore } from './vector-store.js';

// ─── Configuração ─────────────────────────────────────────────────────────────
const INDEXED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.py']);
const EXCLUDED_DIRS      = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);
const DEBOUNCE_MS        = 500;

// ─── Debounce helper ──────────────────────────────────────────────────────────
const pendingIndexes = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleIndex(filePath: string): void {
  if (pendingIndexes.has(filePath)) {
    clearTimeout(pendingIndexes.get(filePath)!);
  }
  pendingIndexes.set(
    filePath,
    setTimeout(() => {
      pendingIndexes.delete(filePath);
      indexFile(filePath).catch((err) =>
        ragLogger.error(`Falha ao indexar ${filePath}`, { error: String(err) })
      );
    }, DEBOUNCE_MS)
  );
}

// ─── Indexação de um único arquivo ───────────────────────────────────────────
export async function indexFile(filePath: string): Promise<void> {
  if (!existsSync(filePath)) return;

  const ext = extname(filePath);
  if (!INDEXED_EXTENSIONS.has(ext)) return;

  try {
    const content = await readFile(filePath, 'utf-8');
    if (content.trim().length === 0) return;

    const store = await getVectorStore();

    // Usa o caminho relativo como ID para facilitar upsert
    const relPath = filePath.replace(process.cwd(), '').replace(/\\/g, '/');

    await store.addDocuments([
      {
        pageContent: `File: ${relPath}\n\n${content.slice(0, 4000)}`, // limita para evitar tokens excessivos
        metadata: {
          id:       relPath,
          type:     'codebase',
          filePath: relPath,
          ext,
          indexedAt: new Date().toISOString(),
        },
      },
    ]);

    ragLogger.debug(`Arquivo indexado: ${relPath}`, { ext, bytes: content.length });
  } catch (err) {
    ragLogger.error(`Erro ao indexar arquivo ${filePath}`, { error: String(err) });
  }
}

// ─── Varredura inicial recursiva ──────────────────────────────────────────────
async function scanDirectory(dir: string): Promise<void> {
  if (!existsSync(dir)) return;

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await scanDirectory(fullPath);
    } else if (entry.isFile()) {
      await indexFile(fullPath);
    }
  }
}

// ─── Watcher ──────────────────────────────────────────────────────────────────
let watcherActive = false;

/**
 * Inicia o indexador dinâmico.
 * Realiza varredura inicial e depois monitora alterações em tempo real.
 *
 * @param rootDir Diretório raiz a monitorar (padrão: process.cwd())
 */
export async function startDynamicIndexer(rootDir?: string): Promise<void> {
  if (watcherActive) {
    ragLogger.warn('Dynamic indexer já está em execução.');
    return;
  }

  const root = resolve(rootDir ?? process.cwd());
  ragLogger.info(`Iniciando indexação dinâmica em: ${root}`);

  // 1. Varredura inicial
  await scanDirectory(root);
  ragLogger.info('Varredura inicial concluída.');

  // 2. Watcher recursivo
  watch(root, { recursive: true }, (eventType, filename) => {
    if (!filename) return;

    const filePath = join(root, filename);

    // Ignora diretórios excluídos
    if (EXCLUDED_DIRS.has(filename.split('/')[0])) return;

    if (eventType === 'change' || eventType === 'rename') {
      scheduleIndex(filePath);
    }
  });

  watcherActive = true;
  ragLogger.info('Watcher de indexação dinâmica ativo.');
}

/**
 * Força re-indexação de um diretório específico (útil após merges/pulls).
 */
export async function reindexDirectory(dir: string): Promise<void> {
  ragLogger.info(`Re-indexando diretório: ${dir}`);
  await scanDirectory(resolve(dir));
  ragLogger.info(`Re-indexação concluída: ${dir}`);
}
