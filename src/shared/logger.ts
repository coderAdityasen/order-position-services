export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}

function format(level: LogLevel, message: string, extra?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const payload = extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : '';
  return `[${ts}] ${level.toUpperCase().padEnd(5)} ${message}${payload}`;
}

export function createLogger(service: string) {
  const write = (level: LogLevel, message: string, extra?: Record<string, unknown>) => {
    if (LEVEL_RANK[level] < LEVEL_RANK[currentLevel()]) {
      return;
    }
    const line = format(level, `[${service}] ${message}`, extra);
    if (level === 'error' || level === 'warn') {
      console.error(line);
      return;
    }
    console.log(line);
  };

  return {
    debug: (message: string, extra?: Record<string, unknown>) => write('debug', message, extra),
    info: (message: string, extra?: Record<string, unknown>) => write('info', message, extra),
    warn: (message: string, extra?: Record<string, unknown>) => write('warn', message, extra),
    error: (message: string, extra?: Record<string, unknown>) => write('error', message, extra),
  };
}

export type Logger = ReturnType<typeof createLogger>;
