import { resolve, join } from 'path';
import { mkdirSync, existsSync, appendFileSync } from 'fs';

// ANSI Escapes definidos estritamente sem deps externas
export const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  cyan: '\x1b[36m'
};

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const MONITORING_DIR = resolve(process.cwd(), 'monitoring');
const LOG_FILE = join(MONITORING_DIR, 'oracle.log');

export class OracleLogger {
  private context: string;

  constructor(context: string) {
    this.context = context;
    if (!existsSync(MONITORING_DIR)) {
      mkdirSync(MONITORING_DIR, { recursive: true });
    }
  }

  private formatTime(): string {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  }

  private write(level: LogLevel, color: string, message: string) {
    const time = this.formatTime();
    
    // Log visual para o console
    console.log(`${COLORS.dim}[${time}]${COLORS.reset} ${color}[${level.toUpperCase()}]${COLORS.reset} ${COLORS.green}[${this.context}]${COLORS.reset} ${message}`);

    // Log em File System puro sem cores ANSI
    const fileMessage = `[${time}] [${level.toUpperCase()}] [${this.context}] ${message}\n`;
    appendFileSync(LOG_FILE, fileMessage, 'utf-8');
  }

  debug(message: string) {
    this.write('debug', COLORS.dim, message);
  }

  info(message: string) {
    this.write('info', COLORS.blue, message);
  }

  warn(message: string) {
    this.write('warn', COLORS.yellow, message);
  }

  error(message: string) {
    this.write('error', COLORS.red, message);
  }
}

export const plannerLogger = new OracleLogger('Planner');
export const executorLogger = new OracleLogger('Executor');
export const reviewerLogger = new OracleLogger('Reviewer');
export const systemLogger = new OracleLogger('System');
