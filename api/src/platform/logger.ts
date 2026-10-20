/**
 * The API's only access to the console, so log output can later be routed or
 * structured in one place. Each call reads the console when it runs.
 */
export const logger = {
  log: (...args: unknown[]): void => console.log(...args),
  info: (...args: unknown[]): void => console.info(...args),
  warn: (...args: unknown[]): void => console.warn(...args),
  error: (...args: unknown[]): void => console.error(...args),
};
