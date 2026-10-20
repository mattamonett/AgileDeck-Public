import { format } from 'node:util';

export const LOG_LEVELS = ['error', 'warn', 'info', 'debug'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export const LOG_FORMATS = ['text', 'json'] as const;
export type LogFormat = (typeof LOG_FORMATS)[number];

/** LOG_LEVEL, or info when unset. readServerEnv refuses an unknown value at startup. */
export function logLevel(): LogLevel {
  const value = process.env.LOG_LEVEL?.trim();
  return LOG_LEVELS.find((level) => level === value) ?? 'info';
}

/** LOG_FORMAT, or text when unset. json writes one object per line for log collectors. */
export function logFormat(): LogFormat {
  const value = process.env.LOG_FORMAT?.trim();
  return LOG_FORMATS.find((logFormat) => logFormat === value) ?? 'text';
}

function write(level: LogLevel, args: unknown[], sink: (...output: unknown[]) => void): void {
  if (LOG_LEVELS.indexOf(level) > LOG_LEVELS.indexOf(logLevel())) return;
  if (logFormat() === 'text') {
    sink(...args);
    return;
  }
  sink(JSON.stringify({ time: new Date().toISOString(), level, message: format(...args) }));
}

/**
 * The API's only access to the console, so log output is filtered and
 * formatted in one place. Each call reads the console and settings when it runs.
 */
export const logger = {
  log: (...args: unknown[]): void => write('info', args, (...output) => console.log(...output)),
  info: (...args: unknown[]): void => write('info', args, (...output) => console.info(...output)),
  warn: (...args: unknown[]): void => write('warn', args, (...output) => console.warn(...output)),
  error: (...args: unknown[]): void =>
    write('error', args, (...output) => console.error(...output)),
  debug: (...args: unknown[]): void =>
    write('debug', args, (...output) => console.debug(...output)),
};
