/**
 * ORACLE-OS · Logger Estruturado
 *
 * Emite logs em formato JSON Lines (structured logging) para facilitar
 * análise, depuração e integração com sistemas de observabilidade.
 * Mantém retrocompatibilidade com a API anterior (info/warn/error/debug).
 */
import { resolve, join } from 'path';
import { mkdirSync, existsSync, appendFileSync } from 'fs';

// ─── ANSI Colors (console apenas) ────────────────────────────────────────────
export const COLORS = {
  reset:  '\x1b[0m',
  dim:    '\x1b[2m',
  blue:   '\x1b[34m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  cyan:   '\x1b[36m',
};

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const MONITORING_DIR = resolve(process.cwd(), 'monitoring');
const LOG_FILE       = join(MONITORING_DIR, 'oracle.log');
const JSON_LOG_FILE  = join(MONITORING_DIR, 'oracle.jsonl');

// ─── Structured Log Entry ─────────────────────────────────────────────────────
export interface LogEntry {
  timestamp: string;
  level:     LogLevel;
  context:   string;
  message:   string;
  meta?:     Record<string, unknown>;
}

// ─── OracleLogger ─────────────────────────────────────────────────────────────
export class OracleLogger {
  private context: string;

  constructor(context: string) {
    this.context = context;
    if (!existsSync(MONITORING_DIR)) {
      mkdirSync(MONITORING_DIR, { recursive: true });
    }
  }

  private formatTime(): string {
    return new Date().toISOString();
  }

  /**
   * Escreve uma entrada de log tanto no console (colorido) quanto
   * em dois arquivos: oracle.log (texto legível) e oracle.jsonl (JSON Lines).
   */
  private write(level: LogLevel, color: string, message: string, meta?: Record<string, unknown>) {
    const timestamp = this.formatTime();

    // ── Console (humano-legível) ──────────────────────────────────────────────
    const metaSuffix = meta ? ` ${COLORS.dim}${JSON.stringify(meta)}${COLORS.reset}` : '';
    console.log(
      `${COLORS.dim}[${timestamp}]${COLORS.reset} ${color}[${level.toUpperCase()}]${COLORS.reset} ` +
      `${COLORS.green}[${this.context}]${COLORS.reset} ${message}${metaSuffix}`
    );

    // ── Arquivo de texto legível ──────────────────────────────────────────────
    const textLine = `[${timestamp}] [${level.toUpperCase()}] [${this.context}] ${message}${meta ? ' ' + JSON.stringify(meta) : ''}\n`;
    appendFileSync(LOG_FILE, textLine, 'utf-8');

    // ── JSON Lines (structured) ───────────────────────────────────────────────
    const entry: LogEntry = { timestamp, level, context: this.context, message, ...(meta ? { meta } : {}) };
    appendFileSync(JSON_LOG_FILE, JSON.stringify(entry) + '\n', 'utf-8');
  }

  debug(message: string, meta?: Record<string, unknown>) {
    this.write('debug', COLORS.dim, message, meta);
  }

  info(message: string, meta?: Record<string, unknown>) {
    this.write('info', COLORS.blue, message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>) {
    this.write('warn', COLORS.yellow, message, meta);
  }

  error(message: string, meta?: Record<string, unknown>) {
    this.write('error', COLORS.red, message, meta);
  }
}

// ─── Instâncias pré-criadas ───────────────────────────────────────────────────
export const plannerLogger  = new OracleLogger('Planner');
export const executorLogger = new OracleLogger('Executor');
export const reviewerLogger = new OracleLogger('Reviewer');
export const systemLogger   = new OracleLogger('System');
export const ragLogger      = new OracleLogger('RAG');
export const toolLogger     = new OracleLogger('Tool');
