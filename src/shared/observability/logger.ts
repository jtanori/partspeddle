type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  correlationId?: string;
  message: string;
  context?: Record<string, unknown>;
}

const isDevelopment = process.env.NODE_ENV === 'development';

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service: 'vintrack',
    message,
    context,
  };

  if (isDevelopment) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
  } else {
    // Production: forward to structured logging sink
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => log('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => log('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => log('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => log('error', message, context),
};
