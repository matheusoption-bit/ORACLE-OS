/**
 * ORACLE-OS Tool Registry — Sprint 3
 * Ferramentas MCP reais usando DynamicStructuredTool do LangChain
 * file_read, file_write, shell_exec, github_create_file, web_search
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { promises as fs } from 'fs';
import { dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ─── Allowlist de comandos permitidos no shell_exec ───────────────────────────
const ALLOWED_PREFIXES = ['node', 'npm', 'npx', 'git', 'tsc', 'tsx', 'python', 'pip'];

function isCommandAllowed(command: string): boolean {
  const trimmed = command.trim().toLowerCase();
  return ALLOWED_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

// ─── Definição das Tools ──────────────────────────────────────────────────────

export const fileReadTool = new DynamicStructuredTool({
  name: 'file_read',
  description: 'Lê o conteúdo de um arquivo no sistema de arquivos local.',
  schema: z.object({
    path: z.string().describe('Caminho absoluto ou relativo do arquivo a ser lido'),
  }),
  func: async ({ path }) => {
    try {
      const content = await fs.readFile(path, 'utf-8');
      return JSON.stringify({ success: true, path, content });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ success: false, path, error: message });
    }
  },
});

export const fileWriteTool = new DynamicStructuredTool({
  name: 'file_write',
  description: 'Escreve conteúdo em um arquivo local, criando diretórios intermediários se necessário.',
  schema: z.object({
    path: z.string().describe('Caminho do arquivo a ser criado ou sobrescrito'),
    content: z.string().describe('Conteúdo a ser escrito no arquivo'),
  }),
  func: async ({ path, content }) => {
    try {
      await fs.mkdir(dirname(path), { recursive: true });
      await fs.writeFile(path, content, 'utf-8');
      return JSON.stringify({ success: true, path, bytesWritten: Buffer.byteLength(content) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ success: false, path, error: message });
    }
  },
});

export const shellExecTool = new DynamicStructuredTool({
  name: 'shell_exec',
  description: 'Executa um comando shell (node, npm, npx, git, tsc, tsx, python, pip) com timeout de 30s.',
  schema: z.object({
    command: z.string().describe('Comando a ser executado (deve começar com node, npm, npx, git, tsc, tsx, python ou pip)'),
    cwd: z.string().optional().describe('Diretório de trabalho para o comando'),
  }),
  func: async ({ command, cwd }) => {
    if (!isCommandAllowed(command)) {
      return JSON.stringify({
        success: false,
        command,
        error: `Comando bloqueado por segurança. Permitidos: ${ALLOWED_PREFIXES.join(', ')}`,
      });
    }
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: cwd ?? process.cwd(),
        timeout: 30_000,
      });
      return JSON.stringify({ success: true, command, stdout: stdout.trim(), stderr: stderr.trim() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ success: false, command, error: message });
    }
  },
});

export const githubCreateFileTool = new DynamicStructuredTool({
  name: 'github_create_file',
  description: 'Cria ou atualiza um arquivo em um repositório GitHub via API REST.',
  schema: z.object({
    owner: z.string().describe('Dono do repositório (usuário ou organização)'),
    repo: z.string().describe('Nome do repositório'),
    path: z.string().describe('Caminho do arquivo dentro do repositório'),
    content: z.string().describe('Conteúdo do arquivo (será codificado em Base64)'),
    message: z.string().describe('Mensagem do commit'),
    branch: z.string().optional().default('main').describe('Branch de destino'),
  }),
  func: async ({ owner, repo, path, content, message, branch }) => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return JSON.stringify({ success: false, error: 'GITHUB_TOKEN não configurado no .env' });
    }

    const encoded = Buffer.from(content).toString('base64');
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    try {
      // Verifica se o arquivo já existe (para obter sha)
      let sha: string | undefined;
      const checkRes = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      if (checkRes.ok) {
        const existing = await checkRes.json() as { sha: string };
        sha = existing.sha;
      }

      const body: Record<string, string> = { message, content: encoded, branch: branch ?? 'main' };
      if (sha) body['sha'] = sha;

      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.text();
        return JSON.stringify({ success: false, error: `GitHub API error ${res.status}: ${errBody}` });
      }

      const data = await res.json() as { content: { html_url: string } };
      return JSON.stringify({ success: true, path, url: data.content?.html_url });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ success: false, error: message });
    }
  },
});

export const webSearchTool = new DynamicStructuredTool({
  name: 'web_search',
  description: 'Busca informações na web. (Mock — retorna resultados simulados para desenvolvimento)',
  schema: z.object({
    query: z.string().describe('Termos de busca'),
    maxResults: z.number().optional().default(3).describe('Número máximo de resultados'),
  }),
  func: async ({ query, maxResults }) => {
    // Mock estruturado — substituir por integração real (SerpAPI, Brave, etc.)
    const results = Array.from({ length: maxResults ?? 3 }, (_, i) => ({
      title: `Resultado ${i + 1} para: ${query}`,
      url: `https://example.com/search?q=${encodeURIComponent(query)}&result=${i + 1}`,
      snippet: `Trecho de exemplo relacionado a "${query}". Em produção, este campo conterá o texto real da página.`,
    }));

    return JSON.stringify({ success: true, query, results });
  },
});

// ─── Tipo e Registry ──────────────────────────────────────────────────────────

export type AgentType = 'frontend' | 'backend' | 'devops' | 'data' | 'security' | 'geral';

const ALL_TOOLS = [fileReadTool, fileWriteTool, shellExecTool, githubCreateFileTool, webSearchTool];

const toolRegistry: Record<AgentType, DynamicStructuredTool[]> = {
  frontend: [fileReadTool, fileWriteTool, shellExecTool, webSearchTool],
  backend:  [fileReadTool, fileWriteTool, shellExecTool, githubCreateFileTool, webSearchTool],
  devops:   [fileReadTool, fileWriteTool, shellExecTool, githubCreateFileTool],
  data:     [fileReadTool, fileWriteTool, webSearchTool],
  security: [fileReadTool, shellExecTool],
  geral:    [fileReadTool, fileWriteTool, shellExecTool, webSearchTool], // tools genéricas para agentes não especializados
};

export function getToolsForAgent(agentType: AgentType): DynamicStructuredTool[] {
  return toolRegistry[agentType] ?? [];
}

export function getToolByName(name: string): DynamicStructuredTool | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}

export { toolRegistry };
