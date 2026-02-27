/**
 * File-based logging utility
 * Logs to glycerin.log to avoid interfering with Ink's TUI rendering
 *
 * Usage:
 *   DEBUG=true npm start              - Enable logging at INFO level
 *   GLYCERIN_LOG_LEVEL=DEBUG npm start - Set specific log level
 *
 * Note: LOG_LEVEL env var is reserved by google-chat-api library
 */

import fs from 'fs';
import { homedir } from 'os';
import path from 'path';

const LOG_DIR = path.join(homedir(), '.glycerin');
const LOG_FILE = path.join(LOG_DIR, 'glycerin.log');

// Ensure log directory exists
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (error) {
  // Silently fail if we can't create the directory
}

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

class Logger {
  private logLevel: LogLevel;
  private enabled: boolean;

  constructor() {
    // Enable logging based on DEBUG, GLYCERIN_LOG_LEVEL, or LOG_LEVEL environment variables
    // LOG_LEVEL is used by google-chat-api vendor code
    this.enabled =
      process.env.DEBUG === 'true' ||
      !!process.env.GLYCERIN_LOG_LEVEL ||
      !!process.env.LOG_LEVEL;
    this.logLevel = this.parseLogLevel(
      process.env.GLYCERIN_LOG_LEVEL || process.env.LOG_LEVEL || 'INFO'
    );
  }

  private parseLogLevel(level: string): LogLevel {
    const upperLevel = level.toUpperCase();
    if (Object.values(LogLevel).includes(upperLevel as LogLevel)) {
      return upperLevel as LogLevel;
    }
    return LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.enabled) return false;

    const levels = [
      LogLevel.DEBUG,
      LogLevel.INFO,
      LogLevel.WARN,
      LogLevel.ERROR,
    ];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);

    return messageLevelIndex >= currentLevelIndex;
  }

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    let formatted = `[${timestamp}] [${level}] ${message}`;

    if (data !== undefined) {
      if (data instanceof Error) {
        formatted += `\n${data.stack || data.message}`;
      } else if (typeof data === 'object') {
        try {
          formatted += `\n${JSON.stringify(data, null, 2)}`;
        } catch {
          formatted += `\n${String(data)}`;
        }
      } else {
        formatted += ` ${String(data)}`;
      }
    }

    return formatted + '\n';
  }

  private writeToFile(message: string): void {
    try {
      fs.appendFileSync(LOG_FILE, message, 'utf8');
    } catch (error) {
      // Silently fail if we can't write to the log file
    }
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.writeToFile(this.formatMessage(LogLevel.DEBUG, message, data));
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.writeToFile(this.formatMessage(LogLevel.INFO, message, data));
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.writeToFile(this.formatMessage(LogLevel.WARN, message, data));
    }
  }

  error(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      this.writeToFile(this.formatMessage(LogLevel.ERROR, message, data));
    }
  }
}

// Export a singleton instance
export const logger = new Logger();
