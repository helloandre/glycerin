
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  tryExtractCookiesFromBrowser,
  extractCookiesFromBrowser as extractFromBrowser,
  getProfile,
} from './extract-cookies.js';
import { log } from './logger.js';

const GC_BASE_URL = 'https://chat.google.com/u/0';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36';
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_TXT_FILE = 'cookies.txt';
const DEFAULT_COOKIES_TXT_PATH = path.resolve(MODULE_DIR, '../..', COOKIES_TXT_FILE);
const GET_COOKIE_CLI = (() => {
  try {
    const require = createRequire(import.meta.url);
    return require.resolve('@mherod/get-cookie/dist/cli.cjs');
  } catch {
    return null;
  }
})();

const CACHED_COOKIES_FILE = 'cached_cookies.json';
const CACHED_AUTH_FILE = 'cached_auth.json';

let memoryCookies: Cookies | null = null;
let memoryAuth: AuthCache | null = null;

export interface Cookies {
  [key: string]: string;
}

export interface AuthCache {
  xsrf_token: string;
  mole_world_body: string;
  cached_at: number;
  session_id?: string;  
}

export interface AuthResult {
  cookies: Cookies;
  xsrfToken: string;
  cookieString: string;
  sessionId?: string;  
}

function parseCookiesTxt(content: string): Cookies | null {
  const cookies: Cookies = {};

  for (const part of content.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key) {
      cookies[key] = value;
    }
  }

  return Object.keys(cookies).length > 0 ? cookies : null;
}

function loadCookiesFromTxt(filePath: string = DEFAULT_COOKIES_TXT_PATH): Cookies | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8').trim();
    if (!content) {
      return null;
    }

    return parseCookiesTxt(content);
  } catch (error) {
    log.auth.error(
      `Error reading ${COOKIES_TXT_FILE}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

function parseGetCookieOutput(output: string): Array<{ name: string; value: string; domain: string }> | null {
  const trimmed = output.trim();
  if (!trimmed) {
    return null;
  }

  const newlineArrayIndex = trimmed.indexOf('\n[');
  const startIndex = newlineArrayIndex !== -1 ? newlineArrayIndex + 1 : trimmed.indexOf('[');
  const endIndex = trimmed.lastIndexOf(']');
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }

  try {
    const jsonText = trimmed.slice(startIndex, endIndex + 1);
    const data = JSON.parse(jsonText) as Array<{ name: string; value: string; domain: string }>;
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function loadCookiesFromGetCookie(): Cookies | null {
  try {
    if (!GET_COOKIE_CLI || !fs.existsSync(GET_COOKIE_CLI)) {
      return null;
    }

    const profile = getProfile();
    const args = [
      GET_COOKIE_CLI,
      '%',
      'google.com',
      '--output',
      'json',
      '--browser',
      'chrome',
    ];

    if (profile) {
      args.push('--profile', profile);
    }

    const output = execFileSync(process.execPath, args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const rows = parseGetCookieOutput(output);
    if (!rows) {
      return null;
    }

    const cookies: Cookies = {};

    for (const row of rows) {
      if (!row?.name || !row.value) {
        continue;
      }

      const domain = row.domain || '';

      if (row.name === 'OSID') {
        if (domain === 'chat.google.com') {
          cookies[row.name] = row.value;
        }
        continue;
      }

      const isGoogleRoot = domain === '.google.com' || domain === 'google.com';
      if (isGoogleRoot) {
        cookies[row.name] = row.value;
        continue;
      }

      if (!(row.name in cookies)) {
        cookies[row.name] = row.value;
      }
    }

    return Object.keys(cookies).length > 0 ? cookies : null;
  } catch {
    return null;
  }
}

export function loadCachedCookies(cacheDir: string = '.'): Cookies | null {
  const required = ['SID', 'HSID', 'SSID', 'OSID'];

  const txtCookies = loadCookiesFromTxt();
  if (txtCookies) {
    memoryCookies = txtCookies;
    return txtCookies;
  }

  if (memoryCookies && required.every(name => name in memoryCookies!)) {
    return memoryCookies;
  }

  const cachePath = path.join(cacheDir, CACHED_COOKIES_FILE);
  try {
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      if (required.every(name => name in data)) {
        memoryCookies = data; 
        return data;
      }
    }
  } catch {
  }

  const browserCookies = tryExtractCookiesFromBrowser();
  if (browserCookies && required.every(name => name in browserCookies)) {
    memoryCookies = browserCookies;
    log.auth.info('Extracted cookies from Chrome browser');
    return browserCookies;
  }

  const cliCookies = loadCookiesFromGetCookie();
  if (cliCookies && required.every(name => name in cliCookies)) {
    memoryCookies = cliCookies;
    log.auth.info('Extracted cookies via @mherod/get-cookie');
    return cliCookies;
  }

  return null;
}

export function saveCachedCookies(cookies: Cookies, cacheDir: string = '.'): void {
  memoryCookies = cookies;

  const cachePath = path.join(cacheDir, CACHED_COOKIES_FILE);
  try {
    fs.writeFileSync(cachePath, JSON.stringify(cookies, null, 2));
  } catch {
  }
}

export function loadAuthCache(cacheDir: string = '.'): AuthCache | null {
  if (memoryAuth && memoryAuth.xsrf_token && memoryAuth.cached_at) {
    const ageHours = (Date.now() - memoryAuth.cached_at) / 3600000;
    if (ageHours < 24) {
      return memoryAuth;
    }
  }

  const cachePath = path.join(cacheDir, CACHED_AUTH_FILE);
  try {
    if (fs.existsSync(cachePath)) {
      const data: AuthCache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));

      if (data.xsrf_token && data.cached_at) {
        const ageHours = (Date.now() - data.cached_at) / 3600000;
        if (ageHours < 24) {
          memoryAuth = data; 
          return data;
        }
      }
    }
  } catch {
  }

  return null;
}

export function saveAuthCache(xsrfToken: string, moleWorldBody: string, cacheDir: string = '.', sessionId?: string): void {
  const data: AuthCache = {
    xsrf_token: xsrfToken,
    mole_world_body: moleWorldBody,
    cached_at: Date.now(),
    session_id: sessionId,
  };

  memoryAuth = data;
  log.auth.debug('Saved XSRF token to memory cache');

  const cachePath = path.join(cacheDir, CACHED_AUTH_FILE);
  try {
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
    log.auth.debug(`Saved XSRF token to file cache: ${cachePath}`);
  } catch (e) {
    log.auth.warn(`Failed to save auth cache to file: ${(e as Error).message}`);
  }
}

export function invalidateCookieCache(cacheDir: string = '.'): void {
  memoryCookies = null;
  log.auth.debug('Cleared cookie memory cache');

  const cachePath = path.join(cacheDir, CACHED_COOKIES_FILE);
  try {
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
      log.auth.debug(`Deleted cookie cache file: ${cachePath}`);
    }
  } catch (e) {
    log.auth.warn(`Failed to delete cookie cache file: ${(e as Error).message}`);
  }
}

export function invalidateAuthCache(cacheDir: string = '.'): void {
  memoryAuth = null;
  log.auth.debug('Cleared auth memory cache');

  const cachePath = path.join(cacheDir, CACHED_AUTH_FILE);
  try {
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
      log.auth.debug(`Deleted auth cache file: ${cachePath}`);
    }
  } catch (e) {
    log.auth.warn(`Failed to delete auth cache file: ${(e as Error).message}`);
  }
}

export function buildCookieString(cookies: Cookies): string {
  return Object.entries(cookies)
    .filter(([_, v]) => {
      for (let i = 0; i < v.length; i++) {
        if (v.charCodeAt(i) > 127) {
          return false;
        }
      }
      return true;
    })
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

export async function fetchXsrfToken(cookies: Cookies): Promise<{ xsrfToken: string; body: string; sessionId: string | null }> {
  const cookieString = buildCookieString(cookies);

  const params = new URLSearchParams({
    origin: 'https://mail.google.com',
    shell: '9',
    hl: 'en',
    wfi: 'gtn-roster-iframe-id',
    hs: '["h_hs",null,null,[1,0],null,null,"gmail.pinto-server_20230730.06_p0",1,null,[15,38,36,35,26,30,41,18,24,11,21,14,6],null,null,"3Mu86PSulM4.en..es5",0,null,null,[0]]',
  });

  const url = `${GC_BASE_URL}/mole/world?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Cookie': cookieString,
      'User-Agent': USER_AGENT,
      'Authority': 'chat.google.com',
      'Referer': 'https://mail.google.com/',
      'Connection': 'Keep-Alive',
    },
    redirect: 'manual',
  });

  if (response.status !== 200) {
    const location = response.headers.get('Location') || '';
    throw new Error(`Auth failed: ${response.status}, redirect to ${location.slice(0, 100)}`);
  }

  const body = await response.text();

  const wizMatch = body.match(/>window\.WIZ_global_data = ({.+?});<\/script>/s);
  if (!wizMatch) {
    throw new Error('No WIZ_global_data found in response');
  }

  const wizData = JSON.parse(wizMatch[1]);

  if (wizData.qwAQke === 'AccountsSignInUi') {
    throw new Error('Not logged in - session invalid');
  }

  const xsrfToken = wizData.SMqcke;
  if (!xsrfToken) {
    throw new Error('No XSRF token in response');
  }

  const sessionId = wizData.FdrFJe || null;

  return { xsrfToken, body, sessionId };
}

export async function authenticate(
  cookies: Cookies,
  options: {
    forceRefresh?: boolean;
    cacheDir?: string;
  } = {}
): Promise<AuthResult> {
  const { forceRefresh = false, cacheDir = '.' } = options;

  if (!forceRefresh) {
    const cached = loadAuthCache(cacheDir);
    if (cached) {
      log.auth.debug('Using cached auth');
      return {
        cookies,
        xsrfToken: cached.xsrf_token,
        cookieString: buildCookieString(cookies),
        sessionId: cached.session_id,
      };
    }
  }

  log.auth.info('Fetching XSRF token from /mole/world...');
  const { xsrfToken, body, sessionId } = await fetchXsrfToken(cookies);

  saveAuthCache(xsrfToken, body, cacheDir, sessionId || undefined);

  log.auth.info('Authentication successful');

  return {
    cookies,
    xsrfToken,
    cookieString: buildCookieString(cookies),
    sessionId: sessionId || undefined,
  };
}

export async function authenticateWithCookies(options: {
  cookies?: Cookies;
  forceRefresh?: boolean;
  cacheDir?: string;
} = {}): Promise<AuthResult> {
  const { forceRefresh = false, cacheDir = '.' } = options;
  let cookies = options.cookies;

  if (!cookies) {
    if (forceRefresh) {
      invalidateCookieCache(cacheDir);
      invalidateAuthCache(cacheDir);
    }

    const loadedCookies = loadCachedCookies(cacheDir);

    if (!loadedCookies) {
      throw new Error(
        'No cookies found. Provide cookies, create cookies.txt with "KEY=value;" entries, ' +
        'or ensure Chrome Profile 1 has Google cookies (cached_cookies.json is optional).'
      );
    }
    cookies = loadedCookies;

    log.auth.debug(`Loaded ${Object.keys(cookies).length} cookies from cache`);
  }

  const required = ['SID', 'HSID', 'SSID', 'OSID'];
  const missing = required.filter(name => !(name in cookies!));

  if (missing.length > 0) {
    throw new Error(`Missing required cookies: ${missing.join(', ')}`);
  }

  return authenticate(cookies, { forceRefresh, cacheDir });
}

export {
  extractCookiesFromBrowser,
  tryExtractCookiesFromBrowser,
  injectCookiesToBrowser,
  listProfiles,
  setProfile,
  getProfile,
  listBrowsers,
  listBrowsersWithProfiles,
  setBrowser,
  getBrowser,
  setCustomCookiePath,
  extractCookiesWithDomains,
  getBrowserBasePath,
  type BrowserType,
  type BrowserInfo,
  type CookieWithDomain,
} from './extract-cookies.js';

let debugMode = false;

export function setDebugMode(enabled: boolean): void {
  debugMode = enabled;
}

export function isDebugMode(): boolean {
  return debugMode;
}

export function getCookies(): Cookies {
  const required = ['SID', 'HSID', 'SSID', 'OSID'];

  const txtCookies = loadCookiesFromTxt();
  if (txtCookies) {
    log.auth.debug('Using cookies from cookies.txt');
    memoryCookies = txtCookies;
    return txtCookies;
  }

  if (memoryCookies && required.every(name => name in memoryCookies!)) {
    log.auth.debug('Using cached cookies from memory');
    return memoryCookies;
  }

  const browserCookies = extractFromBrowser(debugMode);
  if (browserCookies && required.every(name => name in browserCookies)) {
    log.auth.debug('Using cookies from Chrome browser');
    memoryCookies = browserCookies;
    return browserCookies;
  }

  const cliCookies = loadCookiesFromGetCookie();
  if (cliCookies && required.every(name => name in cliCookies)) {
    log.auth.debug('Using cookies from @mherod/get-cookie');
    memoryCookies = cliCookies;
    return cliCookies;
  }

  throw new Error(
    'Failed to get cookies. Ensure cookies.txt exists or you are logged into chat.google.com in Chrome Profile 1.'
  );
}

export const loadCachedAuth = loadAuthCache;

export const saveCachedAuth = saveAuthCache;

export const formatCookieHeader = buildCookieString;

export function invalidateCache(cacheDir: string = '.'): void {
  invalidateCookieCache(cacheDir);
  invalidateAuthCache(cacheDir);
}

export function extractSAPISID(cookies: Cookies): string | null {
  return cookies.SAPISID || cookies.__Secure_1PAPISID || null;
}

export async function generateSAPISIDHash(
  sapisid: string,
  origin: string = 'https://chat.google.com'
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const input = `${timestamp} ${sapisid} ${origin}`;

  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return `SAPISIDHASH ${timestamp}_${hashHex}`;
}

async function generateSapisidStyleHash(
  timestamp: number,
  sapisid: string,
  origin: string
): Promise<string> {
  const input = `${timestamp} ${sapisid} ${origin}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function generatePeopleApiAuthHeader(
  cookies: Cookies,
  origin: string = 'https://people-pa.clients6.google.com'
): Promise<string | null> {
  const timestamp = Math.floor(Date.now() / 1000);
  const parts: string[] = [];

  const findCookie = (names: string[]): string | undefined => {
    for (const name of names) {
      if (cookies[name]) return cookies[name];
    }
    return undefined;
  };

  const cookieKeys = Object.keys(cookies);
  const relevantCookies = cookieKeys.filter(k =>
    k.includes('APISID') || k.includes('PSID') || k.includes('SID')
  );
  log.auth.debug('generatePeopleApiAuthHeader: Available SID cookies:', relevantCookies.join(', '));
  log.auth.debug('generatePeopleApiAuthHeader: Using origin:', origin);

  const sapisid = findCookie(['SAPISID']);
  if (sapisid) {
    const hash = await generateSapisidStyleHash(timestamp, sapisid, origin);
    parts.push(`SAPISIDHASH ${timestamp}_${hash}`);
    log.auth.debug('generatePeopleApiAuthHeader: Added SAPISIDHASH');
  }

  const secure1p = findCookie([
    '__Secure-1PAPISID',
    '__Secure_1PAPISID',
    '__Secure-1PSID',  
  ]);
  if (secure1p) {
    const hash = await generateSapisidStyleHash(timestamp, secure1p, origin);
    parts.push(`SAPISID1PHASH ${timestamp}_${hash}`);
    log.auth.debug('generatePeopleApiAuthHeader: Added SAPISID1PHASH');
  }

  const secure3p = findCookie([
    '__Secure-3PAPISID',
    '__Secure_3PAPISID',
    '__Secure-3PSID',  
  ]);
  if (secure3p) {
    const hash = await generateSapisidStyleHash(timestamp, secure3p, origin);
    parts.push(`SAPISID3PHASH ${timestamp}_${hash}`);
    log.auth.debug('generatePeopleApiAuthHeader: Added SAPISID3PHASH');
  }

  if (parts.length === 0) {
    log.auth.warn('generatePeopleApiAuthHeader: No SAPISID cookies found');
    return null;
  }

  return parts.join(' ');
}

export async function main() {
  const args = process.argv.slice(2);
  const forceRefresh = args.includes('--refresh') || args.includes('-r');

  const cacheDir = path.resolve(MODULE_DIR, '../..');

  try {
    const result = await authenticateWithCookies({ forceRefresh, cacheDir });

    log.auth.info('=== Authentication Result ===');
    log.auth.info(`XSRF Token: ${result.xsrfToken.slice(0, 30)}...`);
    log.auth.info(`Cookie count: ${Object.keys(result.cookies).length}`);
    log.auth.info('Authentication successful!');

  } catch (error) {
    log.auth.error('Authentication failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
