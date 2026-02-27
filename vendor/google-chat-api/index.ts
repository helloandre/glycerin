
export { GoogleChatClient } from './core/client.js';
export * from './core/types.js';
export * as auth from './core/auth.js';
export {
  loadCachedAuth,
  saveCachedAuth,
  loadCachedCookies,
  saveCachedCookies,
  invalidateCache,
  extractSAPISID,
  generateSAPISIDHash,
  generatePeopleApiAuthHeader,
  formatCookieHeader,
} from './core/auth.js';
export * as logger from './core/logger.js';
export {
  createLogger,
  setLogLevel,
  getLogLevel,
  setLogColors,
  isLevelEnabled,
  log,
  type LogLevel,
} from './core/logger.js';
export * as unreads from './core/unreads.js';
export {
  UnreadNotificationService,
  createUnreadService,
} from './core/unreads.js';

export * as utils from './utils/index.js';
