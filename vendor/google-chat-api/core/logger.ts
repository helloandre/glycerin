/**
 * Logger wrapper that uses Glycerin's file-based logger
 * This replaces the original console-based logger to write to glycerin.log
 */

import { logger as glycerinLogger } from '../../../src/lib/logger.js';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'silent';

const LOG_LEVELS: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

let currentLevel: LogLevel = 'info';

function initFromEnv(): void {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LOG_LEVELS) {
    currentLevel = envLevel as LogLevel;
  }
}

initFromEnv();

export function setLogLevel(level: LogLevel): void {
  if (level in LOG_LEVELS) {
    currentLevel = level;
  }
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

export function setLogColors(_enabled: boolean): void {
  // No-op since we're logging to file
}

export function isLevelEnabled(level: LogLevel): boolean {
  return LOG_LEVELS[level] <= LOG_LEVELS[currentLevel];
}

export function createLogger(component: string) {
  return {
    error(message: string, ...args: unknown[]): void {
      if (isLevelEnabled('error')) {
        const formatted =
          args.length > 0
            ? `[${component}] ${message} ${args.map(formatArg).join(' ')}`
            : `[${component}] ${message}`;
        glycerinLogger.error(formatted);
      }
    },

    warn(message: string, ...args: unknown[]): void {
      if (isLevelEnabled('warn')) {
        const formatted =
          args.length > 0
            ? `[${component}] ${message} ${args.map(formatArg).join(' ')}`
            : `[${component}] ${message}`;
        glycerinLogger.warn(formatted);
      }
    },

    info(message: string, ...args: unknown[]): void {
      if (isLevelEnabled('info')) {
        const formatted =
          args.length > 0
            ? `[${component}] ${message} ${args.map(formatArg).join(' ')}`
            : `[${component}] ${message}`;
        glycerinLogger.info(formatted);
      }
    },

    debug(message: string, ...args: unknown[]): void {
      if (isLevelEnabled('debug')) {
        const formatted =
          args.length > 0
            ? `[${component}] ${message} ${args.map(formatArg).join(' ')}`
            : `[${component}] ${message}`;
        glycerinLogger.debug(formatted);
      }
    },

    log(level: LogLevel, message: string, ...args: unknown[]): void {
      if (isLevelEnabled(level)) {
        const formatted =
          args.length > 0
            ? `[${component}] ${message} ${args.map(formatArg).join(' ')}`
            : `[${component}] ${message}`;

        switch (level) {
          case 'error':
            glycerinLogger.error(formatted);
            break;
          case 'warn':
            glycerinLogger.warn(formatted);
            break;
          case 'info':
            glycerinLogger.info(formatted);
            break;
          case 'debug':
            glycerinLogger.debug(formatted);
            break;
        }
      }
    },

    isEnabled(level: LogLevel): boolean {
      return isLevelEnabled(level);
    },

    child(subComponent: string) {
      return createLogger(`${component}:${subComponent}`);
    },
  };
}

function formatArg(arg: unknown): string {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;

  try {
    const json = JSON.stringify(arg);
    return json.length > 200 ? json.slice(0, 200) + '...' : json;
  } catch {
    return String(arg);
  }
}

export const log = {
  cli: createLogger('gchat-CLI'),
  client: createLogger('gchat-Client'),
  channel: createLogger('gchat-Channel'),
  auth: createLogger('gchat-Auth'),
  server: createLogger('gchat-Server'),
  ws: createLogger('gchat-WS'),
  api: createLogger('gchat-API'),
};

export default log;
