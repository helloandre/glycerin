
import { execSync } from 'node:child_process';
import { existsSync, copyFileSync, unlinkSync, readdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { createDecipheriv, createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import type { Cookies } from './auth.js';

const REQUIRED_COOKIES = ['SID', 'HSID', 'SSID', 'OSID'];
const GOOGLE_DOMAIN_LIKE = '%.google.com';
const GOOGLE_DOMAIN_ROOT = 'google.com';
const DEFAULT_PROFILE = 'Profile 1';

export type BrowserType = 'chrome' | 'brave' | 'edge' | 'chromium' | 'arc' | 'custom';

export interface BrowserInfo {
  type: BrowserType;
  name: string;
  basePath: string;
  keychainService: string;
  keychainAccount: string;
  processName: string;
}

export interface CookieWithDomain {
  name: string;
  value: string;
  domain: string;
}

let selectedBrowser: BrowserType = 'chrome';
let selectedProfile: string | null = DEFAULT_PROFILE;
let customCookiePath: string | null = null;

function getBrowserConfigs(): Record<BrowserType, BrowserInfo | null> {
  const os = platform();
  const home = homedir();

  if (os === 'darwin') {
    return {
      chrome: {
        type: 'chrome',
        name: 'Google Chrome',
        basePath: join(home, 'Library', 'Application Support', 'Google', 'Chrome'),
        keychainService: 'Chrome Safe Storage',
        keychainAccount: 'Chrome',
        processName: 'Google Chrome',
      },
      brave: {
        type: 'brave',
        name: 'Brave Browser',
        basePath: join(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'),
        keychainService: 'Brave Safe Storage',
        keychainAccount: 'Brave',
        processName: 'Brave Browser',
      },
      edge: {
        type: 'edge',
        name: 'Microsoft Edge',
        basePath: join(home, 'Library', 'Application Support', 'Microsoft Edge'),
        keychainService: 'Microsoft Edge Safe Storage',
        keychainAccount: 'Microsoft Edge',
        processName: 'Microsoft Edge',
      },
      chromium: {
        type: 'chromium',
        name: 'Chromium',
        basePath: join(home, 'Library', 'Application Support', 'Chromium'),
        keychainService: 'Chromium Safe Storage',
        keychainAccount: 'Chromium',
        processName: 'Chromium',
      },
      arc: {
        type: 'arc',
        name: 'Arc Browser',
        basePath: join(home, 'Library', 'Application Support', 'Arc', 'User Data'),
        keychainService: 'Arc Safe Storage',
        keychainAccount: 'Arc',
        processName: 'Arc',
      },
      custom: null,
    };
  } else if (os === 'linux') {
    return {
      chrome: {
        type: 'chrome',
        name: 'Google Chrome',
        basePath: join(home, '.config', 'google-chrome'),
        keychainService: '',
        keychainAccount: '',
        processName: 'chrome',
      },
      brave: {
        type: 'brave',
        name: 'Brave Browser',
        basePath: join(home, '.config', 'BraveSoftware', 'Brave-Browser'),
        keychainService: '',
        keychainAccount: '',
        processName: 'brave',
      },
      edge: {
        type: 'edge',
        name: 'Microsoft Edge',
        basePath: join(home, '.config', 'microsoft-edge'),
        keychainService: '',
        keychainAccount: '',
        processName: 'msedge',
      },
      chromium: {
        type: 'chromium',
        name: 'Chromium',
        basePath: join(home, '.config', 'chromium'),
        keychainService: '',
        keychainAccount: '',
        processName: 'chromium',
      },
      arc: null, 
      custom: null,
    };
  } else if (os === 'win32') {
    return {
      chrome: {
        type: 'chrome',
        name: 'Google Chrome',
        basePath: join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data'),
        keychainService: '',
        keychainAccount: '',
        processName: 'chrome.exe',
      },
      brave: {
        type: 'brave',
        name: 'Brave Browser',
        basePath: join(home, 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'User Data'),
        keychainService: '',
        keychainAccount: '',
        processName: 'brave.exe',
      },
      edge: {
        type: 'edge',
        name: 'Microsoft Edge',
        basePath: join(home, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data'),
        keychainService: '',
        keychainAccount: '',
        processName: 'msedge.exe',
      },
      chromium: {
        type: 'chromium',
        name: 'Chromium',
        basePath: join(home, 'AppData', 'Local', 'Chromium', 'User Data'),
        keychainService: '',
        keychainAccount: '',
        processName: 'chromium.exe',
      },
      arc: null, 
      custom: null,
    };
  }

  return { chrome: null, brave: null, edge: null, chromium: null, arc: null, custom: null };
}

export function listBrowsers(): BrowserInfo[] {
  const configs = getBrowserConfigs();
  const available: BrowserInfo[] = [];

  for (const [, config] of Object.entries(configs)) {
    if (config && existsSync(config.basePath)) {
      available.push(config);
    }
  }

  return available;
}

export function getBrowser(): BrowserType {
  return selectedBrowser;
}

export function setBrowser(browser: BrowserType): void {
  if (browser === 'custom') {
    selectedBrowser = 'custom';
    return;
  }

  const configs = getBrowserConfigs();
  const config = configs[browser];

  if (!config) {
    throw new Error(`Browser "${browser}" is not supported on this platform`);
  }

  if (!existsSync(config.basePath)) {
    throw new Error(
      `Browser "${config.name}" is not installed or has not been run yet.\n` +
      `Expected path: ${config.basePath}`
    );
  }

  selectedBrowser = browser;
  console.log(`Selected browser: ${config.name}`);
}

export function setCustomCookiePath(cookiePath: string): void {
  if (!existsSync(cookiePath)) {
    throw new Error(`Cookie database not found at: ${cookiePath}`);
  }

  customCookiePath = cookiePath;
  selectedBrowser = 'custom';
  console.log(`Using custom cookie path: ${cookiePath}`);
}

function getCurrentBrowserConfig(): BrowserInfo | null {
  if (selectedBrowser === 'custom') {
    return null;
  }

  const configs = getBrowserConfigs();
  return configs[selectedBrowser];
}

interface ChromeKeys {
  cbcKey: Buffer;
  gcmKey: Buffer;
}

export function getBrowserBasePath(): string {
  const config = getCurrentBrowserConfig();

  if (config) {
    return config.basePath;
  }

  const os = platform();

  if (os === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
  } else if (os === 'linux') {
    return join(homedir(), '.config', 'google-chrome');
  } else if (os === 'win32') {
    return join(homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
  }

  throw new Error(`Unsupported platform: ${os}`);
}

export function listProfiles(browser?: BrowserType): string[] {
  if (selectedBrowser === 'custom' && customCookiePath) {
    return ['custom'];
  }

  const basePath = browser ? getBrowserConfigs()[browser]?.basePath : getBrowserBasePath();

  if (!basePath || !existsSync(basePath)) {
    return [];
  }

  const profiles: string[] = [];
  const entries = readdirSync(basePath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const cookiePath = join(basePath, entry.name, 'Cookies');
      if (existsSync(cookiePath)) {
        profiles.push(entry.name);
      }
    }
  }

  return profiles;
}

export function listBrowsersWithProfiles(): Array<{ browser: BrowserInfo; profiles: string[] }> {
  const browsers = listBrowsers();
  return browsers.map(browser => ({
    browser,
    profiles: listProfiles(browser.type),
  }));
}

export function setProfile(profile: string): void {
  const profiles = listProfiles();

  if (!profiles.includes(profile)) {
    throw new Error(
      `Profile "${profile}" not found. Available profiles: ${profiles.join(', ')}`
    );
  }

  selectedProfile = profile;
  const config = getBrowserConfigs()[selectedBrowser];
  const browserName = config?.name || 'Browser';
  console.log(`Selected ${browserName} profile: ${profile}`);
}

export function getProfile(): string | null {
  return selectedProfile;
}

let keyDebug = false;
export function setKeyDebug(enabled: boolean): void {
  keyDebug = enabled;
}

function getBrowserKeyMac(): ChromeKeys {
  const config = getCurrentBrowserConfig();
  const keychainService = config?.keychainService || 'Chrome Safe Storage';
  const keychainAccount = config?.keychainAccount || 'Chrome';
  const browserName = config?.name || 'Chrome';

  try {
    const result = execSync(
      `security find-generic-password -s "${keychainService}" -a "${keychainAccount}" -w`,
      { encoding: 'utf-8' }
    ).trim();

    if (keyDebug) {
      console.log(`Keychain password length: ${result.length}`);
      console.log(`Keychain password (first 10): "${result.slice(0, 10)}..."`);
    }

    const salt = Buffer.from('saltysalt');
    const iterations = 1003;
    const cbcKey = pbkdf2Sync(result, salt, iterations, 16, 'sha1');
    const gcmKey = pbkdf2Sync(result, salt, iterations, 32, 'sha1');

    if (keyDebug) {
      console.log(`Derived CBC key (hex): ${cbcKey.toString('hex')}`);
      console.log(`Derived GCM key (hex): ${gcmKey.toString('hex')}`);
    }

    return { cbcKey, gcmKey };
  } catch (e) {
    throw new Error(`Failed to get ${browserName} encryption key from Keychain. Make sure ${browserName} has been run at least once.`);
  }
}

function getBrowserKeyLinux(password: string = 'peanuts'): ChromeKeys {
  if (keyDebug) {
    console.log(`Using Linux password: "${password}"`);
  }

  const salt = Buffer.from('saltysalt');
  const iterations = 1;
  const cbcKey = pbkdf2Sync(password, salt, iterations, 16, 'sha1');
  const gcmKey = pbkdf2Sync(password, salt, iterations, 32, 'sha1');

  if (keyDebug) {
    console.log(`Derived CBC key (hex): ${cbcKey.toString('hex')}`);
    console.log(`Derived GCM key (hex): ${gcmKey.toString('hex')}`);
  }

  return { cbcKey, gcmKey };
}

function getBrowserKeys(options: { password?: string } = {}): ChromeKeys {
  const os = platform();

  if (os === 'darwin') {
    return getBrowserKeyMac();
  } else if (os === 'linux') {
    return getBrowserKeyLinux(options.password);
  } else {
    throw new Error(`Unsupported platform for key derivation: ${os}`);
  }
}

function decryptCookieValue(encryptedValue: Buffer, keys: ChromeKeys, debug = false): string {
  if (encryptedValue.length === 0) {
    return '';
  }

  const prefix = encryptedValue.slice(0, 3).toString('ascii');

  if (debug) {
    console.log(`  Decrypting: prefix="${prefix}", len=${encryptedValue.length}`);
  }

  if (prefix === 'v10') {
    const iv = Buffer.alloc(16, ' '); 
    const data = encryptedValue.slice(3);

    try {
      const decipher = createDecipheriv('aes-128-cbc', keys.cbcKey, iv);
      decipher.setAutoPadding(true); 

      let decrypted = decipher.update(data);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      if (decrypted.length > 32) {
        const first32 = decrypted.slice(0, 32);
        const hasBinaryPrefix = first32.some(b => b < 32 || b > 126);
        
        if (hasBinaryPrefix) {
          decrypted = decrypted.slice(32);
          if (debug) {
            console.log(`  Skipped 32-byte integrity prefix`);
          }
        }
      }

      if (debug) {
        const preview = decrypted.slice(0, 30).toString('utf-8');
        console.log(`  Decrypted (first 30 chars): "${preview}"`);
      }

      return decrypted.toString('utf-8').trim();
    } catch (e) {
      if (debug) console.log(`  CBC decryption error: ${e}`);
      return '';
    }
  }

  return encryptedValue.toString('utf-8').trim();
}

function findBrowserCookiePath(): string | null {
  if (customCookiePath) {
    return existsSync(customCookiePath) ? customCookiePath : null;
  }

  const basePath = getBrowserBasePath();

  if (selectedProfile) {
    const cookiePath = join(basePath, selectedProfile, 'Cookies');
    if (existsSync(cookiePath)) {
      return cookiePath;
    }
    return null;
  }

  const profiles = listProfiles();
  const orderedProfiles = ['Default', ...profiles.filter(p => p !== 'Default')];

  for (const profile of orderedProfiles) {
    const cookiePath = join(basePath, profile, 'Cookies');
    if (existsSync(cookiePath)) {
      return cookiePath;
    }
  }

  return null;
}

function extractCookiesFromBrowserDb(debug = false): Cookies {
  const os = platform();
  const config = getCurrentBrowserConfig();
  const browserName = config?.name || 'Browser';

  if (os !== 'darwin' && os !== 'linux') {
    throw new Error(`Cookie extraction only supported on macOS and Linux, got: ${os}`);
  }

  const cookiePath = findBrowserCookiePath();
  if (!cookiePath) {
    if (customCookiePath) {
      throw new Error(`Cookie database not found at custom path: ${customCookiePath}`);
    }
    if (selectedProfile) {
      throw new Error(
        `${browserName} cookie database not found for profile "${selectedProfile}". ` +
        `Make sure ${browserName} profile exists and has been opened at least once.`
      );
    }

    throw new Error(
      `${browserName} cookie database not found. Make sure ${browserName} is installed and has been run at least once.`
    );
  }

  if (debug) {
    console.log(`Using cookie database: ${cookiePath}`);
    console.log(`Browser: ${browserName}`);
  }

  const keys = getBrowserKeys();
  if (debug) {
    console.log(`Encryption keys: CBC ${keys.cbcKey.length} bytes, GCM ${keys.gcmKey.length} bytes`);
  }

  const tempPath = `/tmp/chrome_cookies_${Date.now()}.db`;
  copyFileSync(cookiePath, tempPath);

  try {
    const db = new Database(tempPath, { readonly: true });

    const cookies: Cookies = {};

    const stmt = db.prepare(`
      SELECT name, encrypted_value, host_key
      FROM cookies
      WHERE host_key LIKE ? OR host_key = ?
    `);

    const rows = stmt.all(GOOGLE_DOMAIN_LIKE, GOOGLE_DOMAIN_ROOT) as Array<{
      name: string;
      encrypted_value: Buffer;
      host_key: string;
    }>;

    if (debug) {
      console.log(`Found ${rows.length} Google cookies in database`);
    }

    for (const row of rows) {
      if (debug) {
        console.log(`\nProcessing: ${row.name} from ${row.host_key}`);
      }

      const value = decryptCookieValue(row.encrypted_value, keys, debug);

      if (value) {
        if (row.name === 'OSID' || row.name === '__Secure-OSID') {
          if (row.host_key === 'chat.google.com' || !(row.name in cookies)) {
            cookies[row.name] = value;
          }
        }
        else if (row.name === 'COMPASS') {
          if (row.host_key === 'chat.google.com' || !(row.name in cookies)) {
            cookies[row.name] = value;
          }
        }
        else if (row.host_key === '.google.com' || !(row.name in cookies)) {
          cookies[row.name] = value;
        }
      }
    }

    db.close();

    return cookies;
  } finally {
    try {
      unlinkSync(tempPath);
    } catch {
    }
  }
}

function validateCookies(cookies: Cookies): boolean {
  const missing = REQUIRED_COOKIES.filter(name => !cookies[name]);
  return missing.length === 0;
}

export function extractCookiesFromBrowser(debug = false): Cookies {
  const cookies = extractCookiesFromBrowserDb(debug);

  if (debug) {
    console.log('Extracted cookies:');
    for (const [name, value] of Object.entries(cookies)) {
      const preview = value.length > 20 ? `${value.slice(0, 20)}...` : value;
      const hasNonAscii = [...value].some(c => c.charCodeAt(0) > 127);
      console.log(`  ${name}: ${preview} (len=${value.length}, nonAscii=${hasNonAscii})`);
    }
  }

  if (!validateCookies(cookies)) {
    const missing = REQUIRED_COOKIES.filter(name => !cookies[name]);
    throw new Error(
      `Missing required cookies: ${missing.join(', ')}. ` +
      'Make sure you are logged into chat.google.com in Chrome.'
    );
  }

  return cookies;
}

export function extractCookiesWithDomains(debug = false): CookieWithDomain[] {
  const os = platform();
  const config = getCurrentBrowserConfig();
  const browserName = config?.name || 'Browser';

  if (os !== 'darwin' && os !== 'linux') {
    throw new Error(`Cookie extraction only supported on macOS and Linux, got: ${os}`);
  }

  const cookiePath = findBrowserCookiePath();
  if (!cookiePath) {
    throw new Error(
      `${browserName} cookie database not found. Make sure ${browserName} is installed and has been run at least once.`
    );
  }

  const keys = getBrowserKeys();
  const tempPath = `/tmp/chrome_cookies_${Date.now()}.db`;
  copyFileSync(cookiePath, tempPath);

  try {
    const db = new Database(tempPath, { readonly: true });

    const stmt = db.prepare(`
      SELECT name, encrypted_value, host_key
      FROM cookies
      WHERE host_key LIKE ? OR host_key = ?
    `);

    const rows = stmt.all(GOOGLE_DOMAIN_LIKE, GOOGLE_DOMAIN_ROOT) as Array<{
      name: string;
      encrypted_value: Buffer;
      host_key: string;
    }>;

    const results: CookieWithDomain[] = [];

    for (const row of rows) {
      const value = decryptCookieValue(row.encrypted_value, keys, debug);
      if (value) {
        if (debug) {
          console.log(`  Cookie: ${row.name} domain=${row.host_key}`);
        }
        results.push({
          name: row.name,
          value,
          domain: row.host_key,
        });
      }
    }

    db.close();
    return results;
  } finally {
    try {
      unlinkSync(tempPath);
    } catch {
    }
  }
}

export function tryExtractCookiesFromBrowser(): Cookies | null {
  try {
    return extractCookiesFromBrowser();
  } catch {
    return null;
  }
}

function encryptCookieValue(value: string, keys: ChromeKeys, debug = false): Buffer {
  if (!value) {
    return Buffer.alloc(0);
  }

  const iv = Buffer.alloc(16, ' '); 

  const integrityPrefix = randomBytes(32);
  const valueBuffer = Buffer.from(value, 'utf-8');
  const dataToEncrypt = Buffer.concat([integrityPrefix, valueBuffer]);

  const cipher = createCipheriv('aes-128-cbc', keys.cbcKey, iv);
  cipher.setAutoPadding(true);

  let encrypted = cipher.update(dataToEncrypt);
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const result = Buffer.concat([Buffer.from('v10', 'ascii'), encrypted]);

  if (debug) {
    console.log(`  Encrypted: value_len=${value.length}, result_len=${result.length}`);
  }

  return result;
}

function isBrowserRunning(): boolean {
  const config = getCurrentBrowserConfig();
  if (!config) {
    return false; 
  }

  const processName = config.processName;

  try {
    const os = platform();
    if (os === 'darwin') {
      execSync(`pgrep -x "${processName}"`, { stdio: 'ignore' });
      return true;
    } else if (os === 'linux') {
      execSync(`pgrep -x ${processName}`, { stdio: 'ignore' });
      return true;
    } else if (os === 'win32') {
      execSync(`tasklist /FI "IMAGENAME eq ${processName}" | find /I "${processName}"`, { stdio: 'ignore' });
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function injectCookiesToBrowser(
  cookies: Cookies,
  options: {
    profile?: string;
    domain?: string;
    path?: string;
    expiresInDays?: number;
    password?: string;
    debug?: boolean;
  } = {}
): void {
  const os = platform();
  if (os !== 'darwin' && os !== 'linux') {
    throw new Error(`Cookie injection only supported on macOS and Linux, got: ${os}`);
  }

  const debug = options.debug || false;
  const domain = options.domain || '.google.com';
  const path = options.path || '/';
  const expiresInDays = options.expiresInDays || 365;

  const config = getCurrentBrowserConfig();
  const browserName = config?.name || 'Browser';

  if (isBrowserRunning()) {
    throw new Error(
      `${browserName} is currently running. Please close ${browserName} completely before injecting cookies.\n` +
      'This is required because the browser locks the cookie database while running.'
    );
  }

  const originalProfile = selectedProfile;
  if (options.profile) {
    setProfile(options.profile);
  }

  const cookiePath = findBrowserCookiePath();
  if (!cookiePath) {
    throw new Error(
      `${browserName} cookie database not found for profile "${selectedProfile}". ` +
      `Make sure the profile exists and ${browserName} has been run at least once.`
    );
  }

  selectedProfile = originalProfile;

  if (debug) {
    console.log(`Injecting cookies into: ${cookiePath}`);
    console.log(`Browser: ${browserName}`);
    console.log(`Domain: ${domain}, Path: ${path}, Expires in: ${expiresInDays} days`);
  }

  const keys = getBrowserKeys({ password: options.password });

  if (debug) {
    console.log(`Encryption keys: CBC ${keys.cbcKey.length} bytes, GCM ${keys.gcmKey.length} bytes`);
  }

  const expiresDate = new Date();
  expiresDate.setDate(expiresDate.getDate() + expiresInDays);
  const expiresUtc = Math.floor(expiresDate.getTime() / 1000) + 11644473600; 
  const expiresUtcMicros = expiresUtc * 1000000;

  const db = new Database(cookiePath);

  try {
    const schemaInfo = db.prepare("PRAGMA table_info(cookies)").all() as Array<{ name: string }>;
    const columnNames = schemaInfo.map(col => col.name);
    const isChromiumSchema = columnNames.includes('top_frame_site_key') && columnNames.includes('has_cross_site_ancestor');

    if (debug) {
      console.log(`Schema detected: ${isChromiumSchema ? 'Chromium' : 'Chrome'}`);
      console.log(`Columns: ${columnNames.join(', ')}`);
    }

    let injectedCount = 0;
    let updatedCount = 0;

    for (const [name, value] of Object.entries(cookies)) {
      if (!value) continue;

      if (debug) {
        console.log(`\nProcessing: ${name}`);
      }

      const encryptedValue = encryptCookieValue(value, keys, debug);

      const existing = db.prepare(
        'SELECT rowid FROM cookies WHERE host_key = ? AND name = ? AND path = ?'
      ).get(domain, name, path) as { rowid: number } | undefined;

      if (existing) {
        db.prepare(`
          UPDATE cookies
          SET encrypted_value = ?,
              expires_utc = ?,
              has_expires = 1,
              is_secure = 1,
              is_httponly = 0,
              samesite = 0,
              last_access_utc = ?
          WHERE rowid = ?
        `).run(encryptedValue, expiresUtcMicros, Date.now() * 1000, existing.rowid);

        updatedCount++;
        if (debug) {
          console.log(`  Updated existing cookie (rowid: ${existing.rowid})`);
        }
      } else {
        const creationUtc = Date.now() * 1000;

        if (isChromiumSchema) {
          db.prepare(`
            INSERT INTO cookies (
              creation_utc, host_key, top_frame_site_key, name, value, encrypted_value, path,
              expires_utc, is_secure, is_httponly, last_access_utc,
              has_expires, is_persistent, priority, samesite, source_scheme,
              source_port, last_update_utc, source_type, has_cross_site_ancestor
            ) VALUES (?, ?, ?, ?, '', ?, ?, ?, 1, 0, ?, 1, 1, 1, 0, 2, 443, ?, 0, 0)
          `).run(
            creationUtc,
            domain,
            domain, 
            name,
            encryptedValue,
            path,
            expiresUtcMicros,
            creationUtc,
            creationUtc 
          );
        } else {
          db.prepare(`
            INSERT INTO cookies (
              creation_utc, host_key, name, value, encrypted_value, path,
              expires_utc, is_secure, is_httponly, last_access_utc,
              has_expires, is_persistent, priority, samesite, source_scheme,
              source_port, is_same_party
            ) VALUES (?, ?, ?, '', ?, ?, ?, 1, 0, ?, 1, 1, 1, 0, 2, 443, 0)
          `).run(
            creationUtc,
            domain,
            name,
            encryptedValue,
            path,
            expiresUtcMicros,
            creationUtc
          );
        }

        injectedCount++;
        if (debug) {
          console.log(`  Inserted new cookie`);
        }
      }
    }

    if (debug || injectedCount > 0 || updatedCount > 0) {
      console.log(`\nInjection complete: ${injectedCount} inserted, ${updatedCount} updated`);
    }
  } finally {
    db.close();
  }
}
