
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'silent';

const LOG_LEVELS: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

let currentLevel: LogLevel = 'info';
let useColors = true;

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

export function setLogColors(enabled: boolean): void {
  useColors = enabled;
}

export function isLevelEnabled(level: LogLevel): boolean {
  return LOG_LEVELS[level] <= LOG_LEVELS[currentLevel];
}

function formatMessage(level: string, component: string, message: string): string {
  const timestamp = new Date().toISOString().slice(11, 23); 
  const levelPad = level.toUpperCase().padEnd(5);
  
  if (!useColors) {
    return `${timestamp} ${levelPad} [${component}] ${message}`;
  }
  
  const levelColors: Record<string, string> = {
    error: colors.red,
    warn: colors.yellow,
    info: colors.blue,
    debug: colors.gray,
  };
  
  const levelColor = levelColors[level] || colors.reset;
  return `${colors.dim}${timestamp}${colors.reset} ${levelColor}${levelPad}${colors.reset} ${colors.cyan}[${component}]${colors.reset} ${message}`;
}

export function createLogger(component: string) {
  return {
    error(message: string, ...args: unknown[]): void {
      if (isLevelEnabled('error')) {
        const formatted = args.length > 0 ? `${message} ${args.map(formatArg).join(' ')}` : message;
        console.error(formatMessage('error', component, formatted));
      }
    },

    warn(message: string, ...args: unknown[]): void {
      if (isLevelEnabled('warn')) {
        const formatted = args.length > 0 ? `${message} ${args.map(formatArg).join(' ')}` : message;
        console.warn(formatMessage('warn', component, formatted));
      }
    },

    info(message: string, ...args: unknown[]): void {
      if (isLevelEnabled('info')) {
        const formatted = args.length > 0 ? `${message} ${args.map(formatArg).join(' ')}` : message;
        console.log(formatMessage('info', component, formatted));
      }
    },

    debug(message: string, ...args: unknown[]): void {
      if (isLevelEnabled('debug')) {
        const formatted = args.length > 0 ? `${message} ${args.map(formatArg).join(' ')}` : message;
        console.log(formatMessage('debug', component, formatted));
      }
    },

    log(level: LogLevel, message: string, ...args: unknown[]): void {
      if (isLevelEnabled(level)) {
        const formatted = args.length > 0 ? `${message} ${args.map(formatArg).join(' ')}` : message;
        const output = formatMessage(level, component, formatted);
        if (level === 'error') {
          console.error(output);
        } else if (level === 'warn') {
          console.warn(output);
        } else {
          console.log(output);
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
  cli: createLogger('CLI'),
  client: createLogger('Client'),
  channel: createLogger('Channel'),
  auth: createLogger('Auth'),
  server: createLogger('Server'),
  ws: createLogger('WS'),
  api: createLogger('API'),
};

export default log;
