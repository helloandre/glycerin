import { Command } from 'commander';
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import * as readline from 'node:readline';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';

import { DEFAULT_CACHE_DIR, createClient, resolveCacheDir } from '../app/client.js';
import { GoogleChatClient } from '../core/client.js';
import { exportChatBatches } from '../utils/export-chat.js';
import { startStayOnline } from '../utils/stay-online.js';
import { parseTimeToUsec } from '../utils/time.js';
import { startApiServer } from '../server/api-server.js';
import {
  getCookies,
  invalidateCache,
  invalidateCookieCache,
  invalidateAuthCache,
  loadAuthCache,
  authenticateWithCookies,
  injectCookiesToBrowser,
  listProfiles,
  setProfile,
  getProfile,
  listBrowsers,
  listBrowsersWithProfiles,
  setBrowser,
  getBrowser,
  setCustomCookiePath,
  setDebugMode,
  buildCookieString,
  type Cookies,
  type AuthCache,
  type BrowserType,
  type BrowserInfo,
} from '../core/auth.js';
import { log, setLogLevel, setLogColors, type LogLevel } from '../core/logger.js';
import type { Message, Space, Topic, WorldItemSummary, UserPresence, UserPresenceWithProfile, ImageMetadata, AttachmentMetadata, UrlMetadata } from '../core/types.js';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

let useColors = true;

function c(color: keyof typeof colors, text: string): string {
  return useColors ? `${colors[color]}${text}${colors.reset}` : text;
}

function link(url: string, text?: string): string {
  const displayText = text || url;
  if (!useColors) {
    return text ? `${text} (${url})` : url;
  }
  return `\x1b]8;;${url}\x1b\\${c('cyan', displayText)}\x1b]8;;\x1b\\`;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatMessage(msg: Message, indent = '', showTopicId = false): string {
  const ts = msg.timestamp || 'Unknown';
  const sender = msg.sender || '';
  const text = msg.text.length > 300 ? msg.text.slice(0, 300) + '...' : msg.text;
  const prefix = msg.is_thread_reply ? '  ↳ ' : '';

  const mentionsStr = msg.mentions?.length
    ? c('red', ` [@${msg.mentions.map(m => m.display_name || m.user_id).join(', @')}]`)
    : '';

  const topicStr = showTopicId && msg.topic_id && !msg.is_thread_reply
    ? c('cyan', ` [topic: ${msg.topic_id}]`)
    : '';

  const lines: string[] = [
    `${indent}${prefix}${c('dim', `[${ts}]`)} ${c('blue', sender)}${mentionsStr}${topicStr}`,
    `${indent}${prefix}${text}`,
  ];

  if (msg.urls?.length) {
    for (const url of msg.urls) {
      const urlLine = url.title
        ? `${indent}${prefix}  ${c('dim', '🔗')} ${link(url.url, url.title)}`
        : `${indent}${prefix}  ${c('dim', '🔗')} ${link(url.url)}`;
      lines.push(urlLine);
    }
  }

  if (msg.images?.length) {
    for (const img of msg.images) {
      const sizeInfo = img.width && img.height ? ` ${img.width}x${img.height}` : '';
      const typeInfo = img.content_type ? ` [${img.content_type}]` : '';
      const altInfo = img.alt_text ? ` "${img.alt_text}"` : '';
      lines.push(`${indent}${prefix}  ${c('green', '🖼️  IMAGE')}${sizeInfo}${typeInfo}${altInfo}`);
      lines.push(`${indent}${prefix}     ${link(img.image_url)}`);
    }
  }

  if (msg.attachments?.length) {
    for (const att of msg.attachments) {
      const name = att.content_name || 'attachment';
      const size = formatFileSize(att.content_size);
      const typeInfo = att.content_type ? ` [${att.content_type}]` : '';
      lines.push(`${indent}${prefix}  ${c('yellow', '📎 FILE:')} ${name}${size ? ` (${size})` : ''}${typeInfo}`);
      if (att.download_url) {
        lines.push(`${indent}${prefix}     ${link(att.download_url, 'Download')}`);
      }
      if (att.thumbnail_url) {
        lines.push(`${indent}${prefix}     ${c('dim', 'Thumbnail:')} ${link(att.thumbnail_url)}`);
      }
    }
  }

  lines.push(`${indent}${c('dim', '-'.repeat(40))}`);

  return lines.join('\n');
}

function formatSpace(space: Space): string {
  const name = space.name || '(unnamed)';
  const type = c('dim', `[${space.type}]`);
  return `  ${c('cyan', space.id)}  ${name}  ${type}`;
}

function printHeader(text: string): void {
  const line = '='.repeat(60);
  console.log(`\n${c('bold', c('cyan', line))}`);
  console.log(`${c('bold', c('cyan', ` ${text}`))}`);
  console.log(`${c('bold', c('cyan', line))}\n`);
}

function printSection(text: string): void {
  console.log(`\n${c('bold', c('yellow', text))}`);
  console.log(c('dim', '-'.repeat(40)));
}

function printError(text: string): void {
  console.error(c('red', `Error: ${text}`));
}

function printInfo(text: string): void {
  console.log(c('cyan', text));
}

function printSuccess(text: string): void {
  console.log(c('green', text));
}

function printWarning(text: string): void {
  console.log(c('yellow', `Warning: ${text}`));
}

function formatWorldItem(item: WorldItemSummary, showReadStatus = false): string {
  const name = item.name || '(unnamed)';

  const categoryColors: Record<string, keyof typeof colors> = {
    direct_mention: 'red',
    subscribed_thread: 'yellow',
    subscribed_space: 'blue',
    direct_message: 'green',
    none: 'dim',
  };
  const categoryLabels: Record<string, string> = {
    direct_mention: '@mention',
    subscribed_thread: 'thread',
    subscribed_space: 'space',
    direct_message: 'DM',
    none: '-',
  };
  const category = item.notificationCategory || 'none';
  const categoryStr = c(categoryColors[category] || 'dim', categoryLabels[category] || category);

  const threadStr = item.subscribedThreadId
    ? c('dim', ` [thread: ${item.subscribedThreadId}]`)
    : '';

  const isUnread = category !== 'none';
  const readStatusStr = showReadStatus
    ? (isUnread ? c('red', ' ●') : c('dim', ' ○'))
    : '';

  return `  ${c('cyan', item.id)}  ${name}  ${c('dim', `[${item.type}]`)}  ${categoryStr}${threadStr}${readStatusStr}`;
}

async function confirmAction(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function cmdSpaces(options: { refresh?: boolean; json?: boolean; profile?: string }): Promise<void> {
  const client = await createClient(options);
  const spaces = await client.listSpaces();

  if (options.json) {
    console.log(JSON.stringify(spaces, null, 2));
    return;
  }

  printHeader(`Found ${spaces.length} spaces`);

  const rooms = spaces.filter(s => s.type === 'space');
  const dms = spaces.filter(s => s.type === 'dm');

  if (rooms.length > 0) {
    printSection('SPACES / ROOMS');
    rooms.forEach(s => console.log(formatSpace(s)));
  }

  if (dms.length > 0) {
    printSection('DIRECT MESSAGES');
    dms.slice(0, 10).forEach(s => console.log(formatSpace(s)));
    if (dms.length > 10) {
      console.log(c('dim', `  ... and ${dms.length - 10} more DMs`));
    }
  }
}

async function cmdAuth(options: { profile?: string; cacheDir?: string }): Promise<void> {
  log.auth.info('Authenticating with Google Chat...');

  if (options.profile) {
    setProfile(options.profile);
    printInfo(`Using Chrome profile: ${options.profile}`);
  }

  const cacheDir = resolveCacheDir(options);
  try {
    const cookies = getCookies();
    const authResult = await authenticateWithCookies({ cookies, forceRefresh: false, cacheDir });

    const authCache = loadAuthCache(cacheDir);
    if (authCache) {
      const ageMinutes = Math.floor((Date.now() - authCache.cached_at) / 60000);
      printSuccess(`Authentication successful (cache age: ${ageMinutes} minutes)`);
    } else {
      printSuccess('Authentication successful (fresh)');
    }

    printInfo(`XSRF Token: ${authResult.xsrfToken.slice(0, 20)}...`);
    printInfo(`Cookies: ${Object.keys(authResult.cookies).join(', ')}`);
  } catch (e) {
    printError(`Authentication failed: ${(e as Error).message}`);
    process.exit(1);
  }
}

async function cmdAuthForceRefresh(options: { profile?: string; cacheDir?: string }): Promise<void> {
  log.auth.info('Force refreshing authentication...');

  if (options.profile) {
    setProfile(options.profile);
    printInfo(`Using Chrome profile: ${options.profile}`);
  }

  const cacheDir = resolveCacheDir(options);
  try {
    invalidateCache(cacheDir);
    printInfo('Cache invalidated');

    const cookies = getCookies();
    const authResult = await authenticateWithCookies({ cookies, forceRefresh: true, cacheDir });

    printSuccess('Authentication refreshed successfully');
    printInfo(`XSRF Token: ${authResult.xsrfToken.slice(0, 20)}...`);
    printInfo(`Cookies: ${Object.keys(authResult.cookies).join(', ')}`);
  } catch (e) {
    printError(`Force refresh failed: ${(e as Error).message}`);
    process.exit(1);
  }
}

async function cmdAuthCheckExpires(options: { cacheDir?: string } = {}): Promise<void> {
  printHeader('Authentication Expiration Status');

  const cacheDir = resolveCacheDir(options);
  const authCache = loadAuthCache(cacheDir);

  if (!authCache) {
    printWarning('No cached authentication found');
    printInfo('Run "gchat auth" to authenticate');
    return;
  }

  const now = Date.now();
  const cachedAt = authCache.cached_at;
  const ageMs = now - cachedAt;
  const ageHours = ageMs / 3600000;
  const ageMinutes = ageMs / 60000;

  const expiresInHours = 24 - ageHours;
  const expiresInMinutes = (24 * 60) - ageMinutes;

  console.log('');
  console.log(`  ${c('bold', 'XSRF Token Status:')}`);
  console.log(`    Cached at: ${c('cyan', new Date(cachedAt).toISOString())}`);

  if (ageHours < 1) {
    console.log(`    Age: ${c('green', `${Math.floor(ageMinutes)} minutes`)}`);
  } else {
    console.log(`    Age: ${c('green', `${ageHours.toFixed(1)} hours`)}`);
  }

  if (expiresInHours > 1) {
    console.log(`    Expires in: ${c('green', `${expiresInHours.toFixed(1)} hours`)}`);
    console.log(`    Status: ${c('green', 'VALID')}`);
  } else if (expiresInMinutes > 0) {
    console.log(`    Expires in: ${c('yellow', `${Math.floor(expiresInMinutes)} minutes`)}`);
    console.log(`    Status: ${c('yellow', 'EXPIRING SOON')}`);
  } else {
    console.log(`    Expires in: ${c('red', 'EXPIRED')}`);
    console.log(`    Status: ${c('red', 'EXPIRED')}`);
  }

  console.log('');
  console.log(`  ${c('bold', 'Chrome Cookies:')}`);
  console.log(`    ${c('dim', 'Cookies are extracted from Chrome browser')}`);
  console.log(`    ${c('dim', 'Expiration: Typically 1-2 years (managed by Chrome)')}`);
  console.log(`    ${c('dim', 'Valid as long as you are logged into Google in Chrome')}`);
  console.log('');

  if (expiresInHours < 1) {
    printWarning('XSRF token will expire soon. Run "gchat auth-force-refresh" to refresh.');
  }
}

function cmdAuthRemoveCache(options: { cacheDir?: string } = {}): void {
  printInfo('Removing authentication cache...');

  const cacheDir = resolveCacheDir(options);
  invalidateCache(cacheDir);

  printSuccess('Authentication cache removed');
  printInfo('Cached cookies: cleared');
  printInfo('Cached XSRF token: cleared');
  printInfo('');
  printInfo('Run "gchat auth" to re-authenticate');
}

async function cmdAuthWatch(options: { profile?: string; interval?: string; cacheDir?: string }): Promise<void> {
  const intervalMinutes = options.interval ? parseInt(options.interval, 10) : 5;
  const intervalMs = intervalMinutes * 60 * 1000;

  if (options.profile) {
    setProfile(options.profile);
    printInfo(`Using Chrome profile: ${options.profile}`);
  }

  printHeader('Authentication Watch Mode');
  printInfo(`Refreshing authentication every ${intervalMinutes} minutes`);
  printInfo('Press Ctrl+C to stop');
  console.log('');

  let refreshCount = 0;

  const performRefresh = async () => {
    refreshCount++;
    const timestamp = new Date().toISOString();
    const cacheDir = resolveCacheDir(options);

    try {
      log.auth.info(`[Refresh #${refreshCount}] Starting authentication refresh...`);

      invalidateCache(cacheDir);

      const cookies = getCookies();

      const authResult = await authenticateWithCookies({
        cookies,
        forceRefresh: true,
        cacheDir
      });

      printSuccess(`[${timestamp}] Refresh #${refreshCount} successful`);
      printInfo(`  XSRF Token: ${authResult.xsrfToken.slice(0, 20)}...`);
      printInfo(`  Cookies extracted: ${Object.keys(authResult.cookies).length}`);

      log.auth.info(`[Refresh #${refreshCount}] Authentication refreshed successfully`);
    } catch (e) {
      printError(`[${timestamp}] Refresh #${refreshCount} failed: ${(e as Error).message}`);
      log.auth.error(`[Refresh #${refreshCount}] Authentication refresh failed:`, e);
    }

    console.log('');
  };

  await performRefresh();

  const intervalId = setInterval(async () => {
    await performRefresh();
  }, intervalMs);

  const shutdown = () => {
    console.log('');
    printInfo('Stopping authentication watch...');
    clearInterval(intervalId);
    printSuccess(`Completed ${refreshCount} refresh cycles`);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await new Promise(() => {});
}

async function cmdAuthInjectCookies(options: {
  profile?: string;
  file?: string;
  domain?: string;
  expires?: string;
}): Promise<void> {
  printHeader('Inject Cookies to Chrome Profile');

  printWarning('SECURITY WARNING:');
  console.log('  - Only inject cookies you own or have legitimate access to');
  console.log('  - Chrome must be completely closed before running this');
  console.log('  - Cookies will be encrypted and written to Chrome database');
  console.log('');

  const cookiesFile = options.file || 'cookies.txt';
  const cookiesPath = path.resolve(cookiesFile);

  if (!existsSync(cookiesPath)) {
    printError(`Cookies file not found: ${cookiesPath}`);
    printInfo('');
    printInfo('Create a cookies.txt file with format:');
    printInfo('  COOKIE_NAME=cookie_value; ANOTHER=value;');
    printInfo('');
    printInfo('Or export cookies from current Chrome profile:');
    printInfo('  gchat auth --json > cookies.json');
    process.exit(1);
  }

  try {
    const cookieContent = readFileSync(cookiesPath, 'utf-8').trim();
    let cookies: Cookies;

    if (cookieContent.startsWith('{')) {
      try {
        const parsed = JSON.parse(cookieContent);
        if (parsed.cookies && typeof parsed.cookies === 'object') {
          cookies = parsed.cookies;
        } else {
          cookies = parsed;
        }
      } catch {
        printError('Failed to parse cookies.txt as JSON');
        process.exit(1);
      }
    } else {
      cookies = {};
      for (const part of cookieContent.split(';')) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) continue;

        const key = trimmed.slice(0, separatorIndex).trim();
        const value = trimmed.slice(separatorIndex + 1).trim();

        if (key) {
          cookies[key] = value;
        }
      }
    }

    if (Object.keys(cookies).length === 0) {
      printError('No cookies found in file');
      process.exit(1);
    }

    printInfo(`Loaded ${Object.keys(cookies).length} cookies from ${cookiesFile}`);
    printInfo(`Profile: ${options.profile || getProfile() || 'Profile 1'}`);
    printInfo(`Domain: ${options.domain || '.google.com'}`);
    printInfo(`Expires in: ${options.expires || '365'} days`);
    console.log('');

    injectCookiesToBrowser(cookies, {
      profile: options.profile,
      domain: options.domain,
      expiresInDays: options.expires ? parseInt(options.expires, 10) : 365,
      debug: true,
    });

    printSuccess('Cookies injected successfully!');
    printInfo('');
    printInfo('You can now open Chrome and the cookies should be available.');
    printInfo('Note: You may need to restart Chrome if it was recently closed.');
  } catch (e) {
    printError(`Cookie injection failed: ${(e as Error).message}`);
    process.exit(1);
  }
}

async function cmdAuthInjectCookiesRemote(options: {
  host: string;
  profile?: string;
  file?: string;
  domain?: string;
  expires?: string;
  password?: string;
  browserPath?: string;
}): Promise<void> {
  const { execSync: exec } = await import('node:child_process');

  printHeader(`Inject Cookies to Remote Chromium (${options.host})`);

  printWarning('SECURITY WARNING:');
  console.log('  - Only inject cookies you own or have legitimate access to');
  console.log('  - Chromium must be completely closed on remote before running this');
  console.log('  - Requires SSH access to remote machine');
  console.log('');

  const cookiesFile = options.file || 'cookies.txt';
  const cookiesPath = path.resolve(cookiesFile);

  if (!existsSync(cookiesPath)) {
    printError(`Cookies file not found: ${cookiesPath}`);
    printInfo('Create cookies.txt or export with: gchat auth --json > cookies.json');
    process.exit(1);
  }

  try {
    printInfo('Loading cookies from local file...');
    const cookieContent = readFileSync(cookiesPath, 'utf-8').trim();
    let cookies: Cookies;

    if (cookieContent.startsWith('{')) {
      const parsed = JSON.parse(cookieContent);
      cookies = parsed.cookies || parsed;
    } else {
      cookies = {};
      for (const part of cookieContent.split(';')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) continue;
        const key = trimmed.slice(0, separatorIndex).trim();
        const value = trimmed.slice(separatorIndex + 1).trim();
        if (key) cookies[key] = value;
      }
    }

    if (Object.keys(cookies).length === 0) {
      printError('No cookies found in file');
      process.exit(1);
    }

    printSuccess(`Loaded ${Object.keys(cookies).length} cookies`);
    console.log('');

    printInfo('Detecting Chromium on remote...');
    const browserPath = options.browserPath || '~/snap/chromium/common/chromium/Default/Cookies';

    try {
      exec(`ssh ${options.host} "test -f ${browserPath}"`, { stdio: 'ignore' });
      printSuccess(`Found cookie database at: ${browserPath}`);
    } catch {
      printError(`Cookie database not found at: ${browserPath}`);
      printInfo('');
      printInfo('Common paths:');
      printInfo('  ~/snap/chromium/common/chromium/Default/Cookies (snap)');
      printInfo('  ~/.config/chromium/Default/Cookies (apt)');
      printInfo('  ~/.config/google-chrome/Default/Cookies (chrome)');
      printInfo('');
      printInfo('Specify with --browser-path');
      process.exit(1);
    }

    printInfo('Checking if Chromium is running...');
    try {
      exec(`ssh ${options.host} "pgrep chromium"`, { stdio: 'ignore' });
      printError('Chromium is running on remote! Please close it first.');
      process.exit(1);
    } catch {
      printSuccess('Chromium is not running (safe to inject)');
    }

    console.log('');

    printInfo('Generating injection script...');

    const domain = options.domain || '.google.com';
    const expiresInDays = options.expires ? parseInt(options.expires, 10) : 365;
    const password = options.password || 'peanuts';

    const injectionScript = `#!/usr/bin/env python3
import sqlite3
import hashlib
import os
import json
import time
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

cookies = ${JSON.stringify(cookies)}
cookie_path = '${browserPath}'.replace('~', os.path.expanduser('~'))
domain = '${domain}'
path = '/'
expires_in_days = ${expiresInDays}
password = '${password}'

# Derive encryption key (Linux Chromium uses 1 iteration)
salt = b'saltysalt'
key = hashlib.pbkdf2_hmac('sha1', password.encode(), salt, 1, 16)

def encrypt_value(value):
    """Encrypt cookie value using AES-128-CBC"""
    if not value:
        return b''

    # Create cipher
    iv = b' ' * 16  # 16 spaces
    cipher = Cipher(
        algorithms.AES(key),
        modes.CBC(iv),
        backend=default_backend()
    )
    encryptor = cipher.encryptor()

    # Add integrity prefix and pad
    integrity_prefix = os.urandom(32)
    data = integrity_prefix + value.encode('utf-8')

    # PKCS7 padding
    padding_length = 16 - (len(data) % 16)
    data += bytes([padding_length]) * padding_length

    # Encrypt and add v10 prefix
    encrypted = encryptor.update(data) + encryptor.finalize()
    return b'v10' + encrypted

# Calculate expiration timestamp
expires_date = int((time.time() + expires_in_days * 86400) + 11644473600) * 1000000

# Open database
conn = sqlite3.connect(cookie_path)
cursor = conn.cursor()

# Detect schema
cursor.execute("PRAGMA table_info(cookies)")
columns = [row[1] for row in cursor.fetchall()]
is_chromium_schema = 'top_frame_site_key' in columns

print(f"Schema: {'Chromium' if is_chromium_schema else 'Chrome'}")

injected = 0
updated = 0

for name, value in cookies.items():
    if not value:
        continue

    encrypted_value = encrypt_value(value)
    creation_utc = int(time.time() * 1000000)

    # Check if exists
    cursor.execute('SELECT rowid FROM cookies WHERE host_key = ? AND name = ? AND path = ?',
                   (domain, name, path))
    existing = cursor.fetchone()

    if existing:
        cursor.execute('''UPDATE cookies
                         SET encrypted_value = ?, expires_utc = ?, last_access_utc = ?
                         WHERE rowid = ?''',
                       (encrypted_value, expires_date, creation_utc, existing[0]))
        updated += 1
    else:
        if is_chromium_schema:
            cursor.execute('''INSERT INTO cookies (
                creation_utc, host_key, top_frame_site_key, name, value, encrypted_value, path,
                expires_utc, is_secure, is_httponly, last_access_utc, has_expires, is_persistent,
                priority, samesite, source_scheme, source_port, last_update_utc, source_type, has_cross_site_ancestor
            ) VALUES (?, ?, ?, ?, '', ?, ?, ?, 1, 0, ?, 1, 1, 1, 0, 2, 443, ?, 0, 0)''',
            (creation_utc, domain, domain, name, encrypted_value, path, expires_date, creation_utc, creation_utc))
        else:
            cursor.execute('''INSERT INTO cookies (
                creation_utc, host_key, name, value, encrypted_value, path, expires_utc,
                is_secure, is_httponly, last_access_utc, has_expires, is_persistent,
                priority, samesite, source_scheme, source_port, is_same_party
            ) VALUES (?, ?, ?, '', ?, ?, ?, 1, 0, ?, 1, 1, 1, 0, 2, 443, 0)''',
            (creation_utc, domain, name, encrypted_value, path, expires_date, creation_utc))
        injected += 1

conn.commit()
conn.close()

print(f"Complete: {injected} inserted, {updated} updated")
`;

    const scriptPath = `/tmp/inject-cookies-${Date.now()}.py`;
    printInfo('Transferring injection script to remote...');
    exec(`ssh ${options.host} "cat > ${scriptPath}" <<'EOFSCRIPT'\n${injectionScript}\nEOFSCRIPT`);

    printInfo('Executing injection on remote...');
    console.log('');

    const result = exec(`ssh ${options.host} "python3 ${scriptPath} 2>&1"`, {
      encoding: 'utf-8',
      stdio: 'pipe'
    });

    console.log(result.toString());

    exec(`ssh ${options.host} "rm -f ${scriptPath}"`);

    printSuccess('Remote cookie injection complete!');
    printInfo('');
    printInfo('Cookies have been injected into remote Chromium.');
    printInfo('Open Chromium on the remote machine to use them.');

  } catch (e) {
    printError(`Remote injection failed: ${(e as Error).message}`);
    process.exit(1);
  }
}

async function cmdNotifications(options: {
  refresh?: boolean;
  json?: boolean;
  profile?: string;
  all?: boolean;
  dumpAuth?: boolean;
  showMessages?: boolean;
  messagesLimit?: string;
  mentions?: boolean;
  threads?: boolean;
  spaces?: boolean;
  dms?: boolean;
  read?: boolean;
  unread?: boolean;
  me?: boolean;
  atAll?: boolean;
  space?: string;
  limit?: string;
  offset?: string;
  parallel?: string;
}): Promise<void> {
  const client = await createClient(options);
  let { items, raw } = await client.fetchWorldItems();

  let mentionsShortcutId: string | undefined;
  if (options.me && !options.space) {
    const mentionsSpaces = await client.findSpaces('mentions');
    const mentionsShortcut = mentionsSpaces.find(s =>
      s.name?.toLowerCase().includes('mentions') ||
      s.name?.toLowerCase() === 'mentions-shortcut'
    );
    if (mentionsShortcut) {
      mentionsShortcutId = mentionsShortcut.id;
      if (!options.json) {
        printInfo(`Using mentions-shortcut channel: ${mentionsShortcut.name || mentionsShortcut.id}`);
      }
      items = items.filter(item => item.id === mentionsShortcutId);
    }
  }

  if (options.space) {
    items = items.filter(item => item.id === options.space);
    if (items.length === 0) {
      printError(`Space ${options.space} not found in world items`);
      return;
    }
  }

  if (options.me || options.atAll) {
    await client.getSelfUser();
  }

  const directMentions = items.filter(item => item.notificationCategory === 'direct_mention');
  const subscribedThreads = items.filter(item => item.notificationCategory === 'subscribed_thread');
  const subscribedSpaces = items.filter(item => item.notificationCategory === 'subscribed_space');
  const directMessages = items.filter(item => item.notificationCategory === 'direct_message');
  const readItems = items.filter(item => item.notificationCategory === 'none');

  const hasCategoryFilter = options.mentions || options.threads || options.spaces || options.dms || options.read || options.me || options.atAll;
  const hasReadFilter = options.read || options.unread;
  const needsMentionCheck = options.me || options.atAll;

  const unreads = items.filter(item =>
    item.notificationCategory !== 'none'
  );
  const dms = items.filter(item => item.type === 'dm');

  let dumpDir: string | null = null;
  if (options.dumpAuth) {
    dumpDir = join(tmpdir(), 'auth');
    mkdirSync(dumpDir, { recursive: true });
    writeFileSync(join(dumpDir, 'paginated_world.json'), JSON.stringify(raw, null, 2));
    writeFileSync(join(dumpDir, 'world_items.json'), JSON.stringify(items, null, 2));
  }

  let itemsToFetch: WorldItemSummary[] = [];
  if (hasCategoryFilter && !needsMentionCheck) {
    if (options.mentions) itemsToFetch = itemsToFetch.concat(directMentions);
    if (options.threads) itemsToFetch = itemsToFetch.concat(subscribedThreads);
    if (options.spaces) itemsToFetch = itemsToFetch.concat(subscribedSpaces);
    if (options.dms) itemsToFetch = itemsToFetch.concat(directMessages);
    if (options.read) itemsToFetch = itemsToFetch.concat(readItems);
  } else if (needsMentionCheck) {
    itemsToFetch = directMentions;
  } else if (options.unread) {
    itemsToFetch = unreads;
  } else {
    itemsToFetch = unreads;
  }

  const totalBeforePagination = itemsToFetch.length;
  const offset = parseInt(options.offset || '0', 10);
  const limit = parseInt(options.limit || '0', 10);  
  if (offset > 0) {
    itemsToFetch = itemsToFetch.slice(offset);
  }
  if (limit > 0) {
    itemsToFetch = itemsToFetch.slice(0, limit);
  }

  const messagesLimit = parseInt(options.messagesLimit || '3', 10);
  const spaceMessages: Map<string, Message[]> = new Map();

  const shouldFetchMessages = options.showMessages || needsMentionCheck;

  const directMeMentionSpaces: WorldItemSummary[] = [];
  const atAllMentionSpaces: WorldItemSummary[] = [];

  const parallelLimit = parseInt(options.parallel || '5', 10);

  if (shouldFetchMessages && itemsToFetch.length > 0) {
    printInfo(`Fetching messages for ${itemsToFetch.length} items (${parallelLimit} parallel)...`);

    for (let i = 0; i < itemsToFetch.length; i += parallelLimit) {
      const batch = itemsToFetch.slice(i, i + parallelLimit);
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          const result = await client.getThreads(item.id, { pageSize: messagesLimit });
          return { item, result };
        })
      );

      for (const settledResult of results) {
        if (settledResult.status === 'fulfilled') {
          const { item, result } = settledResult.value;
          if (result.messages.length > 0) {
            spaceMessages.set(item.id, result.messages);

            if (needsMentionCheck) {
              let hasDirectMe = false;
              let hasAtAll = false;
              for (const msg of result.messages) {
                if (client.isDirectlyMentioned(msg)) {
                  hasDirectMe = true;
                }
                if (client.hasAllMention(msg)) {
                  hasAtAll = true;
                }
              }
              if (hasDirectMe) {
                directMeMentionSpaces.push(item);
              }
              if (hasAtAll && !hasDirectMe) {
                atAllMentionSpaces.push(item);
              }
            }
          }
        }
      }
    }
  }

  if (options.json) {
    const payload: Record<string, unknown> = {
      directMentions: options.mentions || !hasCategoryFilter ? directMentions : [],
      subscribedThreads: options.threads || !hasCategoryFilter ? subscribedThreads : [],
      subscribedSpaces: options.spaces || !hasCategoryFilter ? subscribedSpaces : [],
      directMessages: options.dms || !hasCategoryFilter ? directMessages : [],
      readItems: options.read || options.all ? readItems : [],
      directMeMentions: options.me ? directMeMentionSpaces : [],
      atAllMentions: options.atAll ? atAllMentionSpaces : [],
      pagination: {
        total: totalBeforePagination,
        offset,
        limit: limit || totalBeforePagination,
        returned: itemsToFetch.length,
        hasMore: offset + itemsToFetch.length < totalBeforePagination,
      },
      unreads,
      dms,
    };
    if (options.all) {
      payload.all = items;
    }
    if (options.showMessages || needsMentionCheck) {
      payload.messages = Object.fromEntries(spaceMessages);
    }
    if (dumpDir) {
      payload.dumpDir = dumpDir;
    }
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  printHeader('Notifications');

  if (needsMentionCheck) {
    printInfo(`@Me: ${directMeMentionSpaces.length}  @All: ${atAllMentionSpaces.length}  (of ${directMentions.length} mention spaces scanned)`);
  } else {
    printInfo(`@Mentions: ${directMentions.length}  Threads: ${subscribedThreads.length}  Spaces: ${subscribedSpaces.length}  DMs: ${directMessages.length}  Read: ${readItems.length}`);
  }

  const showReadStatus = hasReadFilter || options.all;
  const showMessages = options.showMessages || needsMentionCheck;
  const printCategorySection = (title: string, categoryItems: WorldItemSummary[], limit?: number) => {
    if (categoryItems.length === 0) return;
    printSection(title);
    const displayItems = limit ? categoryItems.slice(0, limit) : categoryItems;
    for (const item of displayItems) {
      console.log(formatWorldItem(item, showReadStatus));
      if (showMessages && spaceMessages.has(item.id)) {
        const msgs = spaceMessages.get(item.id)!;
        for (const msg of msgs) {
          console.log(formatMessage(msg, '    ', false));
        }
      }
    }
    if (limit && categoryItems.length > limit) {
      printInfo(`  ... and ${categoryItems.length - limit} more`);
    }
  };

  if (options.me) {
    printCategorySection('DIRECT @ME MENTIONS', directMeMentionSpaces);
  }
  if (options.atAll) {
    printCategorySection('@ALL MENTIONS (not direct @me)', atAllMentionSpaces);
  }
  if (!hasCategoryFilter || options.mentions) {
    printCategorySection('DIRECT @MENTIONS', directMentions);
  }
  if (!hasCategoryFilter || options.threads) {
    printCategorySection('SUBSCRIBED THREADS', subscribedThreads);
  }
  if (!hasCategoryFilter || options.spaces) {
    printCategorySection('SUBSCRIBED SPACES', subscribedSpaces);
  }
  if (!hasCategoryFilter || options.dms) {
    printCategorySection('DIRECT MESSAGES', directMessages, 20);
  }
  if (options.read) {
    printCategorySection('READ (no activity)', readItems, 50);
  }

  if (options.all) {
    printSection('ALL');
    items.forEach(item => console.log(formatWorldItem(item, true)));
  }

  if (dumpDir) {
    printInfo(`Wrote raw data to ${dumpDir}`);
  }
}

async function cmdMessages(
  spaceId: string,
  options: { refresh?: boolean; json?: boolean; limit?: string; profile?: string }
): Promise<void> {
  const client = await createClient(options);
  const limit = parseInt(options.limit || '20', 10);

  const result = await client.getThreads(spaceId, { pageSize: limit });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printHeader(`Messages from ${spaceId}`);
  printInfo(`Found ${result.total_messages} messages in ${result.total_topics} threads`);

  for (const msg of result.messages) {
    console.log(formatMessage(msg, '', true));  
  }

  if (result.pagination.has_more) {
    printInfo(`\nMore messages available. Cursor: ${result.pagination.next_cursor}`);
  }
}

async function cmdThreads(
  spaceId: string,
  options: {
    refresh?: boolean;
    json?: boolean;
    pages?: string;
    pageSize?: string;
    full?: boolean;
    cursor?: string;
    profile?: string;
  }
): Promise<void> {
  const client = await createClient(options);

  const pages = parseInt(options.pages || '1', 10);
  const pageSize = parseInt(options.pageSize || '25', 10);
  const cursor = options.cursor ? parseInt(options.cursor, 10) : undefined;

  let result;
  if (pages > 1) {
    result = await client.getAllMessages(spaceId, {
      maxPages: pages,
      pageSize,
      fetchFullThreads: options.full,
    });
  } else {
    result = await client.getThreads(spaceId, {
      pageSize,
      cursor,
      fetchFullThreads: options.full,
    });
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printHeader(`Threaded Messages from ${spaceId}`);

  const topics = 'topics' in result ? result.topics : [];
  const pagination = 'pagination' in result ? result.pagination : null;
  const pagesLoaded = 'pages_loaded' in result ? result.pages_loaded : 1;

  printInfo(`Found ${result.messages.length} messages in ${topics.length} threads`);
  if (pagesLoaded > 1) {
    printInfo(`Loaded ${pagesLoaded} pages`);
  }

  for (const topic of topics) {
    console.log(`\n${c('bold', `[THREAD: ${topic.topic_id.slice(0, 30)}...]`)}`);
    console.log(c('cyan', '='.repeat(50)));

    for (const msg of topic.replies) {
      console.log(formatMessage(msg));
    }
  }

  if (pagination?.has_more) {
    printInfo(`\nMore threads available. Cursor: ${pagination.next_cursor}`);
  }
}

async function cmdThread(
  spaceId: string,
  topicId: string,
  options: { refresh?: boolean; json?: boolean; profile?: string }
): Promise<void> {
  const client = await createClient(options);
  const result = await client.getThread(spaceId, topicId);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printHeader(`Thread: ${topicId.slice(0, 30)}...`);
  printInfo(`Found ${result.total_messages} messages`);

  for (const msg of result.messages) {
    console.log(formatMessage(msg));
  }
}

async function cmdDMs(
  options: {
    refresh?: boolean;
    json?: boolean;
    profile?: string;
    limit?: string;
    messagesLimit?: string;
    parallel?: string;
    unread?: boolean;
  }
): Promise<void> {
  const client = await createClient(options);

  const limit = parseInt(options.limit || '0', 10);
  const messagesPerDM = parseInt(options.messagesLimit || '10', 10);
  const parallel = parseInt(options.parallel || '5', 10);

  printInfo(`Fetching DM conversations${options.unread ? ' (unread only)' : ''}...`);

  const result = await client.getDMs({
    limit,
    messagesPerDM,
    parallel,
    unreadOnly: options.unread,
    includeMessages: true, 
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printHeader('Direct Messages');
  printInfo(`Found ${result.total} DM conversations`);

  for (const dm of result.dms) {
    const unreadIndicator = dm.unreadCount > 0 ? c('red', ` (${dm.unreadCount} unread)`) : '';
    printSection(`${dm.name || dm.id}${unreadIndicator}`);

    const messages = dm.messages || [];
    if (messages.length === 0) {
      console.log(c('dim', '  No messages'));
    } else {
      for (const msg of messages) {
        console.log(formatMessage(msg, '  ', false));
      }
    }
  }
}

async function cmdSearch(
  query: string,
  options: { refresh?: boolean; json?: boolean; space?: string; profile?: string }
): Promise<void> {
  const client = await createClient(options);

  let matches;
  if (options.space) {
    printInfo(`Searching for "${query}" in space ${options.space}...`);
    matches = await client.searchInSpace(options.space, query);
  } else {
    printInfo(`Searching for "${query}" across all spaces...`);
    matches = await client.searchAllSpaces(query);
  }

  if (options.json) {
    console.log(JSON.stringify(matches, null, 2));
    return;
  }

  printHeader(`Found ${matches.length} matches`);

  for (const msg of matches) {
    const space = msg.space_name || msg.space_id || '';
    const ts = msg.timestamp || '';
    const snippet = msg.snippet || msg.text.slice(0, 100);

    if (space) {
      console.log(`${c('cyan', `[${space}]`)} ${c('dim', `[${ts}]`)}`);
    } else {
      console.log(c('dim', `[${ts}]`));
    }
    console.log(`  ${snippet}`);
    console.log(c('dim', '-'.repeat(40)));
  }
}

async function cmdFindSpace(
  query: string,
  options: { refresh?: boolean; json?: boolean; profile?: string }
): Promise<void> {
  const client = await createClient(options);
  const matches = await client.findSpaces(query);

  if (options.json) {
    console.log(JSON.stringify(matches, null, 2));
    return;
  }

  printHeader(`Found ${matches.length} matching spaces`);

  for (const space of matches) {
    console.log(formatSpace(space));
  }
}

interface ExportChatState {
  spaceId: string;
  startedAt: string;
  lastUpdatedAt: string;
  oldestTimestamp?: number;
  newestTimestamp?: number;
  totalTopics: number;
  totalMessages: number;
  pagesLoaded: number;
  complete: boolean;
  cursor?: number;
  sortTimeCursor?: string;
  timestampCursor?: string;
  anchorTimestamp?: string;
}

interface ExportChatFile {
  state: ExportChatState;
  topics: Topic[];
}

function createEmptyExport(spaceId: string): ExportChatFile {
  const now = new Date().toISOString();
  return {
    state: {
      spaceId,
      startedAt: now,
      lastUpdatedAt: now,
      totalTopics: 0,
      totalMessages: 0,
      pagesLoaded: 0,
      complete: false,
    },
    topics: [],
  };
}

function formatTimestamp(usec?: number): string {
  if (!usec) return 'N/A';
  return new Date(usec / 1000).toISOString();
}

async function cmdExport(
  spaceId: string,
  options: {
    output?: string;
    batchSize?: string;
    since?: string;
    until?: string;
    fullThreads?: boolean;
    maxPages?: string;
    yes?: boolean;
    dryRun?: boolean;
    verbose?: boolean;
    json?: boolean;
    refresh?: boolean;
    profile?: string;
    cacheDir?: string;
  }
): Promise<void> {
  const client = await createClient(options);

  const outputFile =
    options.output
      ? (options.output.endsWith('.json') ? options.output : `${options.output}.json`)
      : `export-${spaceId}-${new Date().toISOString().slice(0, 10)}.json`;

  const batchSize = parseInt(options.batchSize || '100', 10);
  const maxPages = parseInt(options.maxPages || '1000', 10);
  const dryRun = options.dryRun || false;
  const verbose = options.verbose || false;

  const sinceUsec = options.since ? parseTimeToUsec(options.since) : undefined;
  const untilUsec = options.until ? parseTimeToUsec(options.until) : undefined;
  if (options.since && sinceUsec === undefined) throw new Error(`Invalid --since value: ${options.since}`);
  if (options.until && untilUsec === undefined) throw new Error(`Invalid --until value: ${options.until}`);

  let exportData = createEmptyExport(spaceId);
  const topicMap = new Map<string, Topic>();

  if (existsSync(outputFile) && !dryRun) {
    try {
      const existing = JSON.parse(readFileSync(outputFile, 'utf8')) as ExportChatFile;
      if (existing?.state?.spaceId && existing.state.spaceId !== spaceId) {
        throw new Error(`Output file is for space ${existing.state.spaceId}, not ${spaceId}`);
      }
      exportData = existing;
      for (const t of existing.topics || []) topicMap.set(t.topic_id, t);
    } catch (err) {
      printWarning(`Could not load existing export (${(err as Error).message}); starting fresh`);
      exportData = createEmptyExport(spaceId);
    }
  }

  let sortTimeCursor: string | undefined =
    exportData.state.sortTimeCursor || (exportData.state.cursor ? String(exportData.state.cursor) : undefined);
  let timestampCursor: string | undefined = exportData.state.timestampCursor;
  let anchorTimestamp: string | undefined = exportData.state.anchorTimestamp;

  printHeader('Export Chat History');
  printInfo(`Space ID:     ${spaceId}`);
  printInfo(`Output:       ${outputFile}${dryRun ? c('yellow', ' (dry-run)') : ''}`);
  printInfo(`Batch size:   ${batchSize} topics/page`);
  printInfo(`Full threads: ${options.fullThreads ? 'yes (fetch ALL replies)' : 'no (embedded replies only)'}`);
  if (options.since) printInfo(`Since:        ${options.since} (${formatTimestamp(sinceUsec)})`);
  if (options.until) printInfo(`Until:        ${options.until} (${formatTimestamp(untilUsec)})`);
  if (topicMap.size > 0) printInfo(`Resume:       ${topicMap.size} existing topics`);
  console.log('');

  if (existsSync(outputFile) && !dryRun && !options.yes) {
    const confirmed = await confirmAction('Output file exists. Resume/overwrite?');
    if (!confirmed) {
      printInfo('Cancelled.');
      return;
    }
  }

  let pagesLoaded = 0;
  let newTopics = 0;
  let newMessages = 0;

  const save = (cursorNum?: number) => {
    if (dryRun) return;
    exportData.state.lastUpdatedAt = new Date().toISOString();
    exportData.state.pagesLoaded = pagesLoaded;
    exportData.state.totalTopics = topicMap.size;
    exportData.state.cursor = cursorNum;
    exportData.state.sortTimeCursor = sortTimeCursor;
    exportData.state.timestampCursor = timestampCursor;
    exportData.state.anchorTimestamp = anchorTimestamp;

    exportData.topics = Array.from(topicMap.values());
    exportData.state.totalMessages = exportData.topics.reduce((sum, t) => sum + (t.replies?.length || 0), 0);
    writeFileSync(outputFile, JSON.stringify(exportData, null, 2));
  };

  try {
    for await (const batch of exportChatBatches(client, spaceId, {
      pageSize: batchSize,
      since: sinceUsec,
      until: untilUsec,
      maxPages,
      fullThreads: options.fullThreads || false,
      cursors: { sortTimeCursor, timestampCursor, anchorTimestamp },
    })) {
      pagesLoaded = batch.page;
      sortTimeCursor = batch.pagination.next_sort_time_cursor;
      timestampCursor = batch.pagination.next_timestamp_cursor;
      anchorTimestamp = batch.pagination.anchor_timestamp || anchorTimestamp;

      for (const topic of batch.topics) {
        if (topicMap.has(topic.topic_id)) continue;
        topicMap.set(topic.topic_id, topic);
        newTopics++;
        newMessages += topic.replies.length;

        const sortTime =
          typeof topic.sort_time === 'number'
            ? topic.sort_time
            : (typeof topic.sort_time === 'string' ? parseInt(topic.sort_time, 10) : undefined);
        if (sortTime) {
          if (!exportData.state.newestTimestamp || sortTime > exportData.state.newestTimestamp) {
            exportData.state.newestTimestamp = sortTime;
          }
          if (!exportData.state.oldestTimestamp || sortTime < exportData.state.oldestTimestamp) {
            exportData.state.oldestTimestamp = sortTime;
          }
        }
      }

      if (verbose) {
        printInfo(
          `Page ${batch.page}: +${batch.topics.length} topics, +${batch.messages.length} messages (total ${topicMap.size} topics)`
        );
      } else {
        process.stdout.write(
          `\r📦 ${topicMap.size} topics (+${newTopics}), ${newMessages} new messages | Range: ${formatTimestamp(exportData.state.oldestTimestamp).slice(0, 10)} → ${formatTimestamp(exportData.state.newestTimestamp).slice(0, 10)}   `
        );
      }

      if (batch.page % 10 === 0) {
        const cursorNum = sortTimeCursor ? parseInt(sortTimeCursor, 10) : undefined;
        save(cursorNum);
        if (verbose) printInfo('Progress saved');
      }
    }

    exportData.state.complete = pagesLoaded < maxPages;
    const cursorNum = sortTimeCursor ? parseInt(sortTimeCursor, 10) : undefined;
    save(cursorNum);

    console.log('');
    printSuccess('Export complete');
    printInfo(`Pages:    ${pagesLoaded}${pagesLoaded >= maxPages ? c('yellow', ' (maxPages reached)') : ''}`);
    printInfo(`Topics:   ${topicMap.size} (+${newTopics})`);
    printInfo(`Messages: ${newMessages} new`);
    if (!dryRun) printInfo(`Saved:    ${outputFile}`);

    if (options.json) {
      console.log(JSON.stringify(exportData.state, null, 2));
    }
  } catch (err) {
    const cursorNum = sortTimeCursor ? parseInt(sortTimeCursor, 10) : undefined;
    save(cursorNum);
    throw err;
  }
}

async function cmdDownload(
  spaceId: string,
  options: {
    output?: string;
    batchSize?: string;
    yes?: boolean;
    json?: boolean;
    refresh?: boolean;
    profile?: string;
    cacheDir?: string;
  }
): Promise<void> {
  printWarning('The "download" command is deprecated. Use "gchat export" instead.');
  await cmdExport(spaceId, {
    ...options,
    output: options.output || `export-${spaceId}.json`,
  });
}

async function cmdStayOnline(options: {
  pingInterval?: string;
  presenceTimeout?: string;
  subscribe?: boolean;
  quiet?: boolean;
  profile?: string;
  cacheDir?: string;
}): Promise<void> {
  const pingIntervalSec = parseInt(options.pingInterval || '60', 10);
  const presenceTimeoutSec = parseInt(options.presenceTimeout || '120', 10);
  const quiet = options.quiet || false;

  printHeader('Stay Online Mode');
  console.log(`  Ping interval: ${pingIntervalSec} seconds`);
  console.log(`  Presence timeout: ${presenceTimeoutSec} seconds`);
  console.log(`  Subscribe to spaces: ${options.subscribe ? 'yes' : 'no'}`);
  console.log(`  Press Ctrl+C to stop\n`);

  const client = await createClient(options);
  let lastPingCount = 0;
  let isShuttingDown = false;

  const session = await startStayOnline(client, {
    subscribe: !!options.subscribe,
    pingIntervalSec,
    presenceTimeoutSec,
    onEvent: (evt) => {
      const ts = evt.timestamp;
      switch (evt.type) {
        case 'connect':
          console.log(`${c('dim', `[${ts}]`)} ${c('green', '✓')} Connected`);
          break;
        case 'disconnect':
          if (!isShuttingDown) {
            console.log(`${c('dim', `[${ts}]`)} ${c('yellow', '!')} Disconnected (will reconnect)`);
          }
          break;
        case 'subscribed':
          console.log(`${c('dim', `[${ts}]`)} ${c('green', '●')} Subscribed to ${evt.conversations} conversations`);
          break;
        case 'ping':
          lastPingCount = evt.count;
          if (!quiet) console.log(`${c('dim', `[${ts}]`)} ${c('green', '♥')} Ping #${evt.count}`);
          break;
        case 'message': {
          if (quiet) break;
          const msg = evt.event.body?.message;
          const from = msg?.creator?.name || msg?.creator?.email || 'Unknown';
          const text = msg?.text?.substring(0, 50) || '(no text)';
          console.log(`${c('dim', `[${ts}]`)} ${c('cyan', '💬')} ${from}: ${text}${(msg?.text?.length || 0) > 50 ? '...' : ''}`);
          break;
        }
        case 'typing':
          if (!quiet) console.log(`${c('dim', `[${ts}]`)} ${c('dim', '✎')} Typing event`);
          break;
        case 'error':
          console.log(`${c('dim', `[${ts}]`)} ${c('red', '✗')} ${evt.error.message}`);
          break;
      }
    },
  });

  const shutdown = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n${c('yellow', 'Shutting down...')}`);
    console.log(`  Total pings: ${lastPingCount}`);
    session.stop();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await session.done;
}

function findBrowserExecutable(browserPreference?: string): string {
  const browserPaths: Record<string, string[]> = {
    brave: [
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/usr/bin/brave-browser',
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    ],
    chrome: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ],
    chromium: [
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ],
    edge: [
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/usr/bin/microsoft-edge',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ],
    arc: ['/Applications/Arc.app/Contents/MacOS/Arc'],
  };

  const allPaths: string[] = [];
  const defaultOrder = ['brave', 'chrome', 'chromium', 'edge', 'arc'];

  if (browserPreference && browserPreference in browserPaths) {
    allPaths.push(...browserPaths[browserPreference]);
    for (const b of defaultOrder) {
      if (b !== browserPreference) {
        allPaths.push(...browserPaths[b]);
      }
    }
  } else {
    for (const b of defaultOrder) {
      allPaths.push(...browserPaths[b]);
    }
  }

  for (const p of allPaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  throw new Error('No supported browser found. Please install Chrome, Brave, Chromium, Edge, or Arc.');
}

async function cmdPresence(options: {
  refreshInterval?: string;
  headless?: boolean;
  debugPort?: string;
  quiet?: boolean;
  browser?: string;
  profile?: string;
  forceLogin?: boolean;
  cacheDir?: string;
  debug?: boolean;
  channel?: string;
}): Promise<void> {
  const refreshIntervalSec = parseInt(options.refreshInterval || '300', 10);
  let headless = options.headless !== false;
  const debugPort = options.debugPort ? parseInt(options.debugPort, 10) : undefined;
  const quiet = options.quiet || false;
  const forceLogin = options.forceLogin || false;
  const debug = options.debug || false;
  const channel = options.channel || 'AAAAWFu1kqo';

  const dbg = (msg: string) => {
    if (debug) {
      const ts = new Date().toISOString();
      console.log(`${c('dim', `[${ts}]`)} ${c('yellow', 'DBG')} ${msg}`);
    }
  };

  printHeader('Playwright Presence');
  console.log(`  Mode: ${headless ? 'headless' : 'visible browser'}`);
  console.log(`  Channel: ${channel}`);
  console.log(`  Typing interval: ${refreshIntervalSec}s`);
  console.log(`  Debug: ${debug ? 'on' : 'off'}`);
  if (debugPort) console.log(`  Debug port: ${debugPort}`);
  console.log(`  Press Ctrl+C to stop\n`);

  const askQuestion = (prompt: string): Promise<string> => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(prompt, ans => { rl.close(); resolve(ans.trim()); }));
  };

  const testProfileAuth = (browserType: BrowserType, profile: string): { valid: boolean; keys: string[] } => {
    try {
      setBrowser(browserType);
      setProfile(profile);
      invalidateCookieCache('.');
      const cookies = getCookies();
      const required = ['SID', 'HSID', 'SSID', 'OSID'];
      const found = required.filter(k => k in cookies && cookies[k]);
      return { valid: found.length === required.length, keys: found };
    } catch {
      return { valid: false, keys: [] };
    }
  };

  let selectedBrowserType = options.browser;
  let selectedProfile = options.profile;

  const browsersWithProfiles = listBrowsersWithProfiles();
  dbg(`Discovered ${browsersWithProfiles.length} browser(s)`);

  if (browsersWithProfiles.length === 0) {
    printError('No supported browsers found. Please install Chrome, Brave, Edge, Chromium, or Arc.');
    process.exit(1);
  }

  if (!selectedBrowserType) {
    console.log(c('bold', '\n  Available browsers:\n'));
    browsersWithProfiles.forEach(({ browser: b, profiles }, i) => {
      const profileList = profiles.length > 0 ? ` (${profiles.length} profile${profiles.length > 1 ? 's' : ''})` : '';
      console.log(`    ${c('cyan', `[${i + 1}]`)} ${b.name}${c('dim', profileList)}`);
      dbg(`  ${b.type} → ${b.basePath}`);
    });
    console.log();

    const choice = await askQuestion(`  Select browser [1-${browsersWithProfiles.length}]: `);
    const idx = parseInt(choice, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= browsersWithProfiles.length) {
      printError(`Invalid choice: "${choice}"`);
      process.exit(1);
    }
    selectedBrowserType = browsersWithProfiles[idx].browser.type;
    dbg(`User selected browser: ${selectedBrowserType}`);
  }

  setBrowser(selectedBrowserType as BrowserType);

  const matchedEntry = browsersWithProfiles.find(
    e => e.browser.type === selectedBrowserType
  );
  const availableProfiles = matchedEntry?.profiles || [];
  dbg(`Available profiles for ${selectedBrowserType}: ${JSON.stringify(availableProfiles)}`);

  if (availableProfiles.length > 0) {
    printInfo(`Testing auth for ${availableProfiles.length} profile(s)...`);
    console.log();

    const profileResults: Array<{ profile: string; valid: boolean; keys: string[] }> = [];
    for (const p of availableProfiles) {
      const result = testProfileAuth(selectedBrowserType as BrowserType, p);
      profileResults.push({ profile: p, ...result });
      const status = result.valid
        ? c('green', 'valid')
        : result.keys.length > 0
          ? c('yellow', `partial (${result.keys.join(', ')})`)
          : c('red', 'no cookies');
      const isDefault = p === 'Default' ? c('dim', ' (default)') : '';
      const idx = profileResults.length;
      console.log(`    ${c('cyan', `[${idx}]`)} ${p}${isDefault}  →  ${status}`);
      dbg(`  Profile "${p}": valid=${result.valid}, keys=[${result.keys.join(',')}]`);
    }
    console.log();

    if (!selectedProfile) {
      const validProfiles = profileResults.filter(r => r.valid);
      if (validProfiles.length === 1 && availableProfiles.length > 1) {
        selectedProfile = validProfiles[0].profile;
        printInfo(`Auto-selected "${selectedProfile}" (only profile with valid cookies)`);
      } else if (availableProfiles.length === 1) {
        selectedProfile = availableProfiles[0];
        dbg(`Auto-selected only profile: ${selectedProfile}`);
      } else {
        const choice = await askQuestion(`  Select profile [1-${availableProfiles.length}]: `);
        const idx = parseInt(choice, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= availableProfiles.length) {
          printError(`Invalid choice: "${choice}"`);
          process.exit(1);
        }
        selectedProfile = availableProfiles[idx];
        dbg(`User selected profile: ${selectedProfile}`);
      }
    }
  }

  if (selectedProfile) {
    setBrowser(selectedBrowserType as BrowserType);
    setProfile(selectedProfile);
    printInfo(`Using profile: ${selectedProfile}`);
  }

  const cacheDir = resolveCacheDir(options);
  mkdirSync(cacheDir, { recursive: true });
  const stateFilePath = path.join(cacheDir, 'presence-state.json');
  dbg(`Cache dir: ${cacheDir}`);
  dbg(`State file: ${stateFilePath}`);

  if (forceLogin && existsSync(stateFilePath)) {
    printInfo('Clearing saved authentication state...');
    unlinkSync(stateFilePath);
  }

  const executablePath = findBrowserExecutable(selectedBrowserType);
  printInfo(`Using browser executable: ${executablePath}`);

  const { chromium } = await import('playwright-core');

  type PlaywrightBrowser = Awaited<ReturnType<typeof chromium.launch>>;
  type PlaywrightContext = Awaited<ReturnType<PlaywrightBrowser['newContext']>>;
  let browser: PlaywrightBrowser | null = null;
  let context: PlaywrightContext | null = null;
  let isShuttingDown = false;
  let refreshCount = 0;

  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n${c('yellow', 'Shutting down...')}`);
    console.log(`  Total refreshes: ${refreshCount}`);
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    printInfo('Launching browser...');
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--window-size=1280,720',
    ];
    if (debugPort) {
      launchArgs.push(`--remote-debugging-port=${debugPort}`);
    }

    const hasState = existsSync(stateFilePath);
    dbg(`Saved state exists: ${hasState}`);
    if (!hasState) {
      printInfo('No saved state — will prompt for login');
      headless = false; 
    }

    dbg(`Launching browser: headless=${headless}, exe=${executablePath}`);
    dbg(`Launch args: ${JSON.stringify(launchArgs)}`);
    browser = await chromium.launch({
      headless,
      executablePath,
      args: launchArgs,
    });
    dbg('Browser launched OK');

    const contextOptions: Record<string, unknown> = {};
    if (hasState) {
      try {
        printInfo('Loading saved authentication state...');
        const raw = readFileSync(stateFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        dbg(`State file cookies: ${parsed.cookies?.length ?? 0}, origins: ${parsed.origins?.length ?? 0}`);
        contextOptions.storageState = stateFilePath;
      } catch (err) {
        printError(`Failed to load state: ${(err as Error).message}`);
        printInfo('Clearing corrupted state...');
        unlinkSync(stateFilePath);
      }
    }

    context = await browser.newContext({
      ...contextOptions,
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
      timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    await context.addInitScript({ content: 'Object.defineProperty(navigator, "webdriver", { get: () => undefined })' });

    const page = await context.newPage();
    dbg('New page created');

    if (debug) {
      page.on('console', msg => dbg(`PAGE ${msg.type()}: ${msg.text()}`));
      page.on('pageerror', err => dbg(`PAGE ERROR: ${err.message}`));
      page.on('requestfailed', req => dbg(`REQUEST FAILED: ${req.url()} → ${req.failure()?.errorText}`));
    }

    const injectBannerAndWait = async (message: string) => {
      await page.evaluate((msg: string) => {
        if ((globalThis as any).__gchat_continue) return;
        (globalThis as any).__gchat_continue = false;

        const banner = (globalThis as any).document.createElement('div');
        banner.id = 'gchat-presence-banner';
        Object.assign(banner.style, {
          position: 'fixed', top: '0', left: '0', right: '0', zIndex: '2147483647',
          background: 'linear-gradient(135deg, #1a73e8, #174ea6)',
          color: 'white', padding: '14px 24px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          fontFamily: "'Google Sans', Roboto, Arial, sans-serif",
          fontSize: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        });

        const span = (globalThis as any).document.createElement('span');
        span.textContent = msg;

        const btn = (globalThis as any).document.createElement('button');
        btn.textContent = 'Save Session & Start';
        Object.assign(btn.style, {
          background: 'white', color: '#1a73e8', border: 'none',
          borderRadius: '4px', padding: '8px 24px', fontSize: '14px',
          fontWeight: '600', cursor: 'pointer', marginLeft: '16px',
          whiteSpace: 'nowrap',
          fontFamily: "'Google Sans', Roboto, Arial, sans-serif",
        });
        btn.addEventListener('click', () => {
          (globalThis as any).__gchat_continue = true;
          banner.remove();
        });

        banner.appendChild(span);
        banner.appendChild(btn);
        (globalThis as any).document.body.appendChild(banner);
      }, message);

      await page.waitForFunction(() => (globalThis as any).__gchat_continue === true, { timeout: 0 });
    };

    const chatUrl = 'https://mail.google.com/chat';
    printInfo(`Navigating to ${chatUrl}...`);
    try {
      await page.goto(chatUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      dbg(`Navigation complete, URL: ${page.url()}`);
    } catch (err) {
      dbg(`Navigation threw: ${(err as Error).message}`);
      printInfo('Initial navigation slow, continuing...');
    }

    dbg('Waiting 5s for page to settle...');
    await new Promise(r => setTimeout(r, 5000));

    const currentUrl = page.url();
    dbg(`Current URL: ${currentUrl}`);
    const pageTitle = await page.title().catch(() => '(unknown)');
    dbg(`Page title: ${pageTitle}`);

    const earlyScreenshot = path.join(tmpdir(), 'gchat-presence-early.png');
    await page.screenshot({ path: earlyScreenshot, fullPage: true }).catch(() => {});
    dbg(`Early screenshot: ${earlyScreenshot}`);

    const isChatPage = (u: string) =>
      u.includes('mail.google.com/chat') ||
      u.includes('chat.google.com') ||
      u.includes('mail.google.com/mail') 
    ;

    if (!isChatPage(currentUrl)) {
      dbg(`Auth required — current URL is not a Chat page: ${currentUrl}`);

      if (currentUrl.includes('workspace.google.com')) {
        dbg('Redirected to marketing page — navigating to accounts.google.com sign-in');
        await page.goto('https://accounts.google.com/ServiceLogin?continue=https://mail.google.com/chat', {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        }).catch(() => {});
        dbg(`After sign-in redirect, URL: ${page.url()}`);
      }

      printInfo('Not logged in. Please log in manually in the browser window...');
      printInfo('Waiting for you to reach Google Chat (up to 5 minutes)...');

      try {
        await page.waitForURL(url => isChatPage(url.toString()), {
          timeout: 300000, 
        });
        dbg(`Login redirect detected, new URL: ${page.url()}`);
      } catch {
        const failUrl = page.url();
        dbg(`Login timeout, final URL: ${failUrl}`);
        const failScreenshot = path.join(tmpdir(), 'gchat-presence-login-fail.png');
        await page.screenshot({ path: failScreenshot, fullPage: true }).catch(() => {});
        printError(`Login timeout — stuck at: ${failUrl}`);
        printInfo(`Screenshot: ${failScreenshot}`);
        printInfo('Please try again with --force-login');
        if (context) await context.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
        process.exit(1);
      }

      dbg('Waiting 5s for Chat UI to settle after login...');
      await new Promise(r => setTimeout(r, 5000));
      dbg(`Post-login URL: ${page.url()}`);
    } else {
      printInfo('Already logged in');
    }

    if (!headless) {
      printInfo('Click "Save Session & Start" in the browser when ready...');
      dbg('Injecting confirmation banner...');
      await injectBannerAndWait("gchat presence is ready. Verify you see your chats, then click the button.");
      dbg('User clicked the banner');
    } else {
      dbg('Headless mode — skipping banner confirmation');
    }

    printInfo('Saving authentication state...');
    await context.storageState({ path: stateFilePath });
    printInfo(`Saved to ${stateFilePath}`);
    dbg(`State file size: ${readFileSync(stateFilePath, 'utf-8').length} bytes`);

    const screenshotPath = path.join(tmpdir(), 'gchat-presence-logged-in.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const timestamp = new Date().toISOString();
    console.log(`${c('dim', `[${timestamp}]`)} ${c('green', '✓')} Connected to Google Chat`);
    console.log(`${c('dim', `[${timestamp}]`)} ${c('cyan', '→')} Screenshot: ${screenshotPath}`);

    const cookies = getCookies();
    dbg(`API cookies extracted: ${Object.keys(cookies).length} keys`);
    try {
      printInfo('Verifying user...');
      const client = new GoogleChatClient(cookies, cacheDir);
      await client.authenticate(true);
      const user = await client.getSelfUser();
      if (user?.email) {
        console.log(`${c('dim', `[${timestamp}]`)} ${c('cyan', '→')} Logged in as: ${c('green', user.email)}`);
        if (user.name) {
          console.log(`${c('dim', `[${timestamp}]`)} ${c('cyan', '→')} Name: ${c('blue', user.name)}`);
        }
      }
    } catch (err) {
      dbg(`User verification failed: ${(err as Error).stack}`);
      console.log(`${c('dim', `[${timestamp}]`)} ${c('yellow', '⚠')} Failed to fetch user: ${(err as Error).message}`);
    }

    const channelUrl = `https://mail.google.com/chat/u/0/#chat/space/${channel}`;
    printInfo(`Opening channel: ${channelUrl}`);
    try {
      await page.goto(channelUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      dbg(`Channel URL loaded: ${page.url()}`);
    } catch {
      dbg('Channel navigation slow, continuing...');
    }

    dbg('Waiting 10s for channel to render...');
    await new Promise(r => setTimeout(r, 10000));

    if (debug) {
      const chanScreenshot = path.join(tmpdir(), 'gchat-presence-channel.png');
      await page.screenshot({ path: chanScreenshot, fullPage: true }).catch(() => {});
      dbg(`Channel screenshot: ${chanScreenshot}`);
    }

    const inputSelectors = [
      'div[role="textbox"][aria-label*="message" i]',
      'div[role="textbox"][aria-label*="Message" i]',
      'div[role="textbox"][contenteditable="true"]',
      'div[contenteditable="true"][aria-label*="chat" i]',
      'div[contenteditable="true"][aria-label*="message" i]',
      'div[role="textbox"]',
      'textarea[aria-label*="message" i]',
      'div[contenteditable="true"][data-placeholder]',
      'div[contenteditable="plaintext-only"]',
      'div[contenteditable="true"]',
    ];

    const dumpEditables = async (frame: { evaluate: typeof page.evaluate }, label: string) => {
      try {
        const elements = await frame.evaluate(() => {
          const results: string[] = [];
          (globalThis as any).document.querySelectorAll('[contenteditable], [role="textbox"], textarea, iframe').forEach((el: any) => {
            const tag = el.tagName.toLowerCase();
            const role = el.getAttribute('role') || '';
            const aria = el.getAttribute('aria-label') || '';
            const ce = el.getAttribute('contenteditable') || '';
            const ph = el.getAttribute('data-placeholder') || el.getAttribute('placeholder') || '';
            const src = tag === 'iframe' ? (el.getAttribute('src') || '').slice(0, 100) : '';
            results.push(`<${tag} role="${role}" aria-label="${aria}" contenteditable="${ce}" placeholder="${ph}"${src ? ` src="${src}"` : ''}>`);
          });
          return results;
        });
        dbg(`[${label}] Found ${elements.length} editable/iframe element(s):`);
        for (const e of elements) dbg(`  ${e}`);
      } catch (err) {
        dbg(`[${label}] Failed to dump editables: ${(err as Error).message}`);
      }
    };

    if (debug) {
      await dumpEditables(page, 'main');
      const frames = page.frames();
      dbg(`Page has ${frames.length} frame(s)`);
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        dbg(`  Frame ${i}: ${f.url().slice(0, 120)}`);
        await dumpEditables(f, `frame-${i}`);
      }
    }

    const isComposeBox = async (el: Awaited<ReturnType<typeof page.$>>) => {
      if (!el) return false;
      try {
        const info = await el.evaluate((node: any) => ({
          text: (node.textContent || '').trim(),
          height: node.getBoundingClientRect().height,
          ariaLabel: node.getAttribute('aria-label') || '',
        }));
        dbg(`  Candidate: text="${info.text.slice(0, 40)}" height=${info.height} aria="${info.ariaLabel}"`);
        return info.text.length === 0 && info.height < 200;
      } catch {
        return false;
      }
    };

    const focusInput = async (): Promise<boolean> => {
      const searchFrame = async (frame: typeof page | ReturnType<typeof page.frames>[0], label: string): Promise<boolean> => {
        for (const sel of inputSelectors) {
          try {
            const els = await frame.$$(sel);
            for (const el of els) {
              if (await isComposeBox(el)) {
                await el.click();
                dbg(`Focused compose box [${label}]: ${sel}`);
                return true;
              }
            }
          } catch {}
        }
        return false;
      };

      if (await searchFrame(page, 'main')) return true;

      const frames = page.frames();
      for (let i = 0; i < frames.length; i++) {
        if (await searchFrame(frames[i], `frame-${i}`)) return true;
      }

      dbg('Could not find compose box in any frame');
      return false;
    };

    const simulateTyping = async () => {
      const focused = await focusInput();
      if (!focused) return;

      const numChars = 2 + Math.floor(Math.random() * 3); 
      const chars = 'abcdefghijklmnopqrstuvwxyz';

      for (let i = 0; i < numChars; i++) {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        await page.keyboard.type(ch, { delay: 80 + Math.random() * 120 });
        await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
      }

      await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));

      for (let i = 0; i < numChars; i++) {
        await page.keyboard.press('Backspace');
        await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
      }
    };

    await new Promise(r => setTimeout(r, 3000));
    console.log(`${c('dim', `[${timestamp}]`)} ${c('cyan', '→')} Starting typing simulation in channel ${channel}...`);
    await simulateTyping();
    console.log(`${c('dim', `[${new Date().toISOString()}]`)} ${c('green', '●')} ONLINE`);

    const refreshLoop = async () => {
      while (!isShuttingDown) {
        await new Promise(resolve => setTimeout(resolve, refreshIntervalSec * 1000));
        if (isShuttingDown) break;

        refreshCount++;
        const ts = new Date().toISOString();
        try {
          await simulateTyping();

          if (!quiet) {
            console.log(`${c('dim', `[${ts}]`)} ${c('green', '♥')} Typing #${refreshCount}`);
          }
        } catch (err) {
          console.log(`${c('dim', `[${ts}]`)} ${c('red', '✗')} Typing #${refreshCount} failed: ${(err as Error).message}`);
        }
      }
    };

    await refreshLoop();
  } catch (err) {
    if (!isShuttingDown) {
      printError((err as Error).message);
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
      process.exit(1);
    }
  }
}

const program = new Command();

program
  .name('gchat')
  .description('Google Chat CLI client (extracts cookies from browser automatically)')
  .version('1.0.0')
  .option('--no-color', 'Disable colored output')
  .option('-b, --browser <type>', 'Browser to use: chrome, brave, edge, chromium, arc (run "gchat browsers" to list)')
  .option('-p, --profile <name>', 'Browser profile to use (run "gchat profiles" to list)')
  .option('--cookie-path <path>', 'Custom path to cookie database file')
  .option('--cache-dir <path>', `Cache directory for auth state (default: ${DEFAULT_CACHE_DIR})`)
  .option('--refresh', 'Force refresh authentication (re-extract cookies from browser)')
  .option('--json', 'Output as JSON')
  .option('--debug', 'Enable debug output')
  .option('--log-level <level>', 'Set log level (error, warn, info, debug, silent)', 'info')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.color === false || !process.stdout.isTTY) {
      useColors = false;
      setLogColors(false);
    }
    if (opts.debug) {
      setDebugMode(true);
      setLogLevel('debug');
    } else if (opts.logLevel) {
      setLogLevel(opts.logLevel as LogLevel);
    }
    if (opts.cookiePath) {
      setCustomCookiePath(opts.cookiePath);
    } else if (opts.browser) {
      setBrowser(opts.browser as BrowserType);
    }
    if (opts.profile) {
      setProfile(opts.profile);
    }
  });

program
  .command('browsers')
  .description('List available browsers and their profiles')
  .option('--json', 'Output as JSON')
  .action((opts) => {
    try {
      const browsersWithProfiles = listBrowsersWithProfiles();

      if (browsersWithProfiles.length === 0) {
        printError('No supported browsers found');
        process.exit(1);
      }

      if (opts.json) {
        console.log(JSON.stringify(browsersWithProfiles, null, 2));
        return;
      }

      printHeader('Available Browsers');
      console.log();

      for (const { browser, profiles } of browsersWithProfiles) {
        console.log(`  ${c('green', browser.name)} (${c('dim', browser.type)})`);
        console.log(`    Path: ${c('dim', browser.basePath)}`);
        console.log(`    Profiles: ${profiles.length > 0 ? profiles.map(p => c('cyan', p)).join(', ') : c('dim', 'none')}`);
        console.log();
      }

      console.log(`Use ${c('yellow', '--browser <type>')} to select a browser (chrome, brave, edge, chromium, arc)`);
      console.log(`Use ${c('yellow', '--profile <name>')} to select a profile`);
      console.log(`Use ${c('yellow', '--cookie-path <path>')} to use a custom cookie database`);
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('profiles')
  .description('List available browser profiles')
  .option('--browser <type>', 'Browser type (chrome, brave, edge, chromium, arc)', 'chrome')
  .action((opts) => {
    try {
      if (opts.browser) {
        setBrowser(opts.browser as BrowserType);
      }

      const profiles = listProfiles();
      const browserName = getBrowser();

      if (profiles.length === 0) {
        printError(`No profiles found for ${browserName}`);
        process.exit(1);
      }

      printHeader(`Found ${profiles.length} ${browserName} profiles`);
      for (const profile of profiles) {
        console.log(`  ${c('cyan', profile)}`);
      }
      console.log(`\nUse ${c('yellow', '--profile <name>')} to select a profile`);
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

const authCmd = program
  .command('auth')
  .description('Authentication and cookie helpers')
  .action(async () => {
    try {
      await cmdAuth(program.opts());
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

authCmd
  .command('status')
  .description('Show cached XSRF token age/expiry')
  .action(async () => {
    try {
      await cmdAuthCheckExpires(program.opts());
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

authCmd
  .command('refresh')
  .description('Force refresh authentication (bypass cache)')
  .action(async () => {
    try {
      await cmdAuthForceRefresh(program.opts());
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

authCmd
  .command('clear-cache')
  .description('Clear cached cookies and XSRF token')
  .action(() => {
    try {
      cmdAuthRemoveCache(program.opts());
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

authCmd
  .command('watch')
  .description('Continuously refresh authentication every N minutes (default: 5)')
  .option('-i, --interval <minutes>', 'Refresh interval in minutes (default: 5)', '5')
  .action(async (opts) => {
    try {
      await cmdAuthWatch({ ...program.opts(), ...opts });
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

authCmd
  .command('browsers')
  .description('List available browsers and their profiles')
  .option('--json', 'Output as JSON')
  .action((opts) => {
    try {
      const browsersWithProfiles = listBrowsersWithProfiles();

      if (browsersWithProfiles.length === 0) {
        printError('No supported browsers found');
        process.exit(1);
      }

      if (opts.json) {
        console.log(JSON.stringify(browsersWithProfiles, null, 2));
        return;
      }

      printHeader('Available Browsers');
      console.log();

      for (const { browser, profiles } of browsersWithProfiles) {
        console.log(`  ${c('green', browser.name)} (${c('dim', browser.type)})`);
        console.log(`    Path: ${c('dim', browser.basePath)}`);
        console.log(`    Profiles: ${profiles.length > 0 ? profiles.map(p => c('cyan', p)).join(', ') : c('dim', 'none')}`);
        console.log();
      }

      console.log(`Use ${c('yellow', '--browser <type>')} to select a browser (chrome, brave, edge, chromium, arc)`);
      console.log(`Use ${c('yellow', '--profile <name>')} to select a profile`);
      console.log(`Use ${c('yellow', '--cookie-path <path>')} to use a custom cookie database`);
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

authCmd
  .command('profiles')
  .description('List available browser profiles')
  .option('--browser <type>', 'Browser type (chrome, brave, edge, chromium, arc)', 'chrome')
  .action((opts) => {
    try {
      if (opts.browser) {
        setBrowser(opts.browser as BrowserType);
      }

      const profiles = listProfiles();
      const browserName = getBrowser();

      if (profiles.length === 0) {
        printError(`No profiles found for ${browserName}`);
        process.exit(1);
      }

      printHeader(`Found ${profiles.length} ${browserName} profiles`);
      for (const profile of profiles) {
        console.log(`  ${c('cyan', profile)}`);
      }
      console.log(`\nUse ${c('yellow', '--profile <name>')} to select a profile`);
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

authCmd
  .command('export-cookies')
  .description('Export cookies from browser to stdout or file')
  .option('-o, --output <file>', 'Output file (default: stdout)')
  .action(async (opts) => {
    try {
      const client = await createClient({ ...program.opts(), ...opts });
      const cookieString = client.getCookieString();

      if (opts.output) {
        writeFileSync(opts.output, cookieString);
        printSuccess(`Cookies exported to ${opts.output}`);
      } else {
        console.log(cookieString);
      }
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

authCmd
  .command('inject')
  .description('Inject cookies into Chrome profile (Chrome must be closed)')
  .option('-f, --file <path>', 'Cookie file path (default: cookies.txt)', 'cookies.txt')
  .option('-d, --domain <domain>', 'Domain for cookies (default: .google.com)', '.google.com')
  .option('-e, --expires <days>', 'Days until expiration (default: 365)', '365')
  .action(async (opts) => {
    try {
      await cmdAuthInjectCookies({ ...program.opts(), ...opts });
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

authCmd
  .command('inject-remote')
  .description('Inject cookies into Chromium on remote machine via SSH')
  .requiredOption('-H, --host <host>', 'SSH host (e.g., user@hostname or homelab)')
  .option('-f, --file <path>', 'Cookie file path (default: cookies.txt)', 'cookies.txt')
  .option('-d, --domain <domain>', 'Domain for cookies (default: .google.com)', '.google.com')
  .option('-e, --expires <days>', 'Days until expiration (default: 365)', '365')
  .option('-b, --browser-path <path>', 'Remote cookie database path (default: ~/snap/chromium/common/chromium/Default/Cookies)')
  .option('--password <password>', 'Encryption password for Linux (default: peanuts)', 'peanuts')
  .action(async (opts) => {
    try {
      await cmdAuthInjectCookiesRemote({ ...program.opts(), ...opts });
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('auth-force-refresh')
  .description('[deprecated] Use "gchat auth refresh"')
  .action(async () => {
    try {
      await cmdAuthForceRefresh(program.opts());
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('auth-check-expires')
  .description('[deprecated] Use "gchat auth status"')
  .action(async () => {
    try {
      await cmdAuthCheckExpires(program.opts());
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('auth-remove-cache')
  .description('[deprecated] Use "gchat auth clear-cache"')
  .action(() => {
    try {
      cmdAuthRemoveCache(program.opts());
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('auth-watch')
  .description('[deprecated] Use "gchat auth watch"')
  .option('-i, --interval <minutes>', 'Refresh interval in minutes (default: 5)', '5')
  .action(async (opts) => {
    try {
      await cmdAuthWatch({ ...program.opts(), ...opts });
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('export-cookies')
  .description('[deprecated] Use "gchat auth export-cookies"')
  .option('-o, --output <file>', 'Output file (default: stdout)')
  .action(async (opts) => {
    try {
      const client = await createClient({ ...program.opts(), ...opts });
      const cookieString = client.getCookieString();

      if (opts.output) {
        writeFileSync(opts.output, cookieString);
        printSuccess(`Cookies exported to ${opts.output}`);
      } else {
        console.log(cookieString);
      }
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('auth-inject-cookies')
  .description('[deprecated] Use "gchat auth inject"')
  .option('-f, --file <path>', 'Cookie file path (default: cookies.txt)', 'cookies.txt')
  .option('-d, --domain <domain>', 'Domain for cookies (default: .google.com)', '.google.com')
  .option('-e, --expires <days>', 'Days until expiration (default: 365)', '365')
  .action(async (opts) => {
    try {
      await cmdAuthInjectCookies({ ...program.opts(), ...opts });
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('auth-inject-cookies-remote')
  .description('[deprecated] Use "gchat auth inject-remote"')
  .requiredOption('-H, --host <host>', 'SSH host (e.g., user@hostname or homelab)')
  .option('-f, --file <path>', 'Cookie file path (default: cookies.txt)', 'cookies.txt')
  .option('-d, --domain <domain>', 'Domain for cookies (default: .google.com)', '.google.com')
  .option('-e, --expires <days>', 'Days until expiration (default: 365)', '365')
  .option('-b, --browser-path <path>', 'Remote cookie database path (default: ~/snap/chromium/common/chromium/Default/Cookies)')
  .option('--password <password>', 'Encryption password for Linux (default: peanuts)', 'peanuts')
  .action(async (opts) => {
    try {
      await cmdAuthInjectCookiesRemote({ ...program.opts(), ...opts });
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('spaces')
  .description('List all spaces')
  .action(async () => {
    try {
      await cmdSpaces(program.opts());
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('notifications')
  .description('List unread counts, mentions, and direct messages')
  .option('--all', 'Include all world items in output')
  .option('--dump-auth', 'Write raw paginated_world data to the auth tmp dir')
  .option('-m, --show-messages', 'Fetch and display actual messages for each unread space')
  .option('-n, --messages-limit <num>', 'Number of messages per space (default: 3)', '3')
  .option('--mentions', 'Show only direct @mentions')
  .option('--threads', 'Show only subscribed threads')
  .option('--spaces', 'Show only subscribed spaces')
  .option('--dms', 'Show only direct messages')
  .option('--read', 'Show read items (no unread activity)')
  .option('--unread', 'Show only unread items (default behavior)')
  .option('--me', 'Show only spaces where YOU are directly @mentioned (uses mentions-shortcut channel)')
  .option('--at-all', 'Show only spaces with @all mentions (not direct @me)')
  .option('-s, --space <id>', 'Filter to a specific space ID')
  .option('-l, --limit <num>', 'Limit number of spaces to process (for faster results)')
  .option('-o, --offset <num>', 'Skip first N spaces (for pagination)', '0')
  .option('-p, --parallel <num>', 'Number of parallel requests when fetching messages (default: 5)', '5')
  .action(async (opts) => {
    try {
      await cmdNotifications({ ...program.opts(), ...opts });
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('messages <space_id>')
  .description('Get messages from a space')
  .option('-n, --limit <num>', 'Number of messages', '20')
  .action(async (spaceId, opts) => {
    try {
      await cmdMessages(spaceId, { ...program.opts(), ...opts });
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('threads <space_id>')
  .description('Get threaded messages with pagination')
  .option('-p, --pages <num>', 'Number of pages', '1')
  .option('-s, --page-size <num>', 'Topics per page', '25')
  .option('--full', 'Fetch full thread contents')
  .option('--cursor <timestamp>', 'Pagination cursor')
  .action(async (spaceId, opts) => {
    try {
      await cmdThreads(spaceId, { ...program.opts(), ...opts });
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('thread <space_id> <topic_id>')
  .description('Get all messages in a specific thread')
  .action(async (spaceId, topicId) => {
    try {
      await cmdThread(spaceId, topicId, program.opts());
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('dms')
  .description('Get all direct message conversations with messages')
  .option('-l, --limit <num>', 'Limit number of DM conversations to fetch')
  .option('-n, --messages-limit <num>', 'Number of messages per DM (default: 10)', '10')
  .option('-p, --parallel <num>', 'Number of parallel requests (default: 5)', '5')
  .option('--unread', 'Show only unread DMs')
  .action(async (opts) => {
    try {
      await cmdDMs({ ...program.opts(), ...opts });
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('search <query>')
  .description('Search messages')
  .option('-s, --space <space_id>', 'Limit to specific space')
  .action(async (query, opts) => {
    try {
      await cmdSearch(query, { ...program.opts(), ...opts });
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('find-space <query>')
  .description('Search for spaces by name')
  .action(async (query) => {
    try {
      await cmdFindSpace(query, program.opts());
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('send <space_id> <message>')
  .description('Send a new message to a space (creates new thread)')
  .action(async (spaceId, message) => {
    try {
      const client = await createClient(program.opts());
      printInfo(`Sending message to ${spaceId}...`);
      const result = await client.sendMessage(spaceId, message);
      if (result.success) {
        printSuccess(`Message sent!`);
        printInfo(`  Topic ID: ${result.topic_id}`);
        printInfo(`  Message ID: ${result.message_id}`);
      } else {
        printError(result.error || 'Failed to send message');
        process.exit(1);
      }
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('reply <space_id> <topic_id> <message>')
  .description('Reply to an existing thread')
  .action(async (spaceId, topicId, message) => {
    try {
      const client = await createClient(program.opts());
      printInfo(`Replying to thread ${topicId}...`);
      const result = await client.replyToThread(spaceId, topicId, message);
      if (result.success) {
        printSuccess(`Reply sent!`);
        printInfo(`  Message ID: ${result.message_id}`);
      } else {
        printError(result.error || 'Failed to send reply');
        process.exit(1);
      }
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('mark-read <space_id>')
  .description('Mark a space or DM as read')
  .option('--count <number>', 'Unread count (defaults to 1)')
  .action(async (spaceId, opts) => {
    try {
      const client = await createClient(program.opts());
      printInfo(`Marking ${spaceId} as read...`);
      const count = opts.count ? parseInt(opts.count, 10) : undefined;
      const result = await client.markAsRead(spaceId, count);
      if (result.success) {
        printSuccess(`Marked as read!`);
        printInfo(`  Group ID: ${result.groupId}`);
        printInfo(`  Unread Count: ${result.unreadMessageCount}`);
      } else {
        printError(result.error || 'Failed to mark as read');
        process.exit(1);
      }
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('whoami')
  .description('Show current authenticated user info')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    try {
      const client = await createClient(program.opts());
      printInfo('Fetching user info...');
      const user = await client.getSelfUser();

      if (opts.json) {
        console.log(JSON.stringify(user, null, 2));
        return;
      }

      printHeader('Current User');
      console.log(`  User ID: ${c('cyan', user.userId)}`);
      if (user.name) {
        console.log(`  Name: ${c('blue', user.name)}`);
      }
      if (user.email) {
        console.log(`  Email: ${c('green', user.email)}`);
      }
      if (user.firstName || user.lastName) {
        const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
        console.log(`  Full Name: ${fullName}`);
      }
      if (user.avatarUrl) {
        console.log(`  Avatar: ${c('dim', user.avatarUrl)}`);
      }
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('api')
  .description('Start JSON API server')
  .option('--port <port>', 'Port to listen on', '3000')
  .option('--host <host>', 'Host to bind to', 'localhost')
  .action(async (opts) => {
    try {
      await startApiServer({ ...program.opts(), ...opts });
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('keepalive')
  .description('Periodically ping Google Chat to keep session cookies alive (runs 9AM-6PM London time)')
  .option('--interval <minutes>', 'Interval between pings in minutes', '3')
  .option('--dormant-check <minutes>', 'How often to check time when dormant', '20')
  .option('--quiet', 'Only log errors, not successful pings')
  .option('--no-time-check', 'Disable London business hours check (9AM-6PM)')
  .action(async (opts) => {
    const intervalMs = parseInt(opts.interval, 10) * 60 * 1000;
    const dormantCheckMs = parseInt(opts.dormantCheck, 10) * 60 * 1000;
    const quiet = opts.quiet || false;
    const timeCheckEnabled = opts.timeCheck !== false;

    const isWithinLondonBusinessHours = (): { inHours: boolean; londonTime: string; hour: number } => {
      const now = new Date();
      const londonTime = now.toLocaleString('en-GB', { timeZone: 'Europe/London', hour12: false });
      const londonHourStr = now.toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false });
      const hour = parseInt(londonHourStr, 10);
      const inHours = hour >= 9 && hour < 18; 
      return { inHours, londonTime, hour };
    };

    printHeader('Session Keepalive');
    console.log(`  Ping interval: ${opts.interval} minutes`);
    console.log(`  Dormant check interval: ${opts.dormantCheck} minutes`);
    if (timeCheckEnabled) {
      const { londonTime, inHours } = isWithinLondonBusinessHours();
      console.log(`  London time check: ${c('green', 'enabled')} (9AM-6PM)`);
      console.log(`  Current London time: ${londonTime}`);
      console.log(`  Current status: ${inHours ? c('green', 'within business hours') : c('yellow', 'outside business hours (dormant)')}`);
    } else {
      console.log(`  London time check: ${c('yellow', 'disabled')}`);
    }
    console.log(`  Press Ctrl+C to stop\n`);

    let client: GoogleChatClient | null = null;
    let pingCount = 0;
    let errorCount = 0;
    let isActive = false;
    let currentTimer: ReturnType<typeof setTimeout> | null = null;

    const shutdown = (reason?: string) => {
      if (currentTimer) clearTimeout(currentTimer);
      console.log(`\n${c('yellow', 'Shutting down...')}${reason ? ` (${reason})` : ''}`);
      console.log(`  Total pings: ${pingCount}`);
      console.log(`  Errors: ${errorCount}`);
      process.exit(0);
    };

    const ensureClient = async (): Promise<GoogleChatClient> => {
      if (!client) {
        client = await createClient(program.opts());
      }
      return client;
    };

    const ping = async () => {
      pingCount++;
      const timestamp = new Date().toISOString();
      try {
        const c1 = await ensureClient();
        await c1.authenticate(true);

        const spaces = await c1.listSpaces();
        if (!quiet) {
          console.log(`${c('dim', `[${timestamp}]`)} ${c('green', '✓')} Ping #${pingCount} OK - fetched ${spaces.length} spaces`);
        }
      } catch (e) {
        errorCount++;
        console.log(`${c('dim', `[${timestamp}]`)} ${c('red', '✗')} Ping #${pingCount} FAILED - ${(e as Error).message}`);

        if ((e as Error).message.includes('auth') || (e as Error).message.includes('401')) {
          console.log(`${c('yellow', '  → Attempting to re-authenticate...')}`);
          try {
            const c1 = await ensureClient();
            await c1.authenticate(true);
            console.log(`${c('green', '  → Re-authentication successful')}`);
          } catch (authErr) {
            console.log(`${c('red', '  → Re-authentication failed:')} ${(authErr as Error).message}`);
          }
        }
      }
    };

    const enterDormantMode = () => {
      if (!isActive) return; 
      isActive = false;
      const timestamp = new Date().toISOString();
      const { londonTime, hour } = isWithinLondonBusinessHours();
      console.log(`${c('dim', `[${timestamp}]`)} ${c('yellow', '😴')} Entering dormant mode - outside business hours`);
      console.log(`  London time: ${londonTime} (hour: ${hour})`);
      console.log(`  Will check again in ${opts.dormantCheck} minutes`);
    };

    const enterActiveMode = () => {
      if (isActive) return; 
      isActive = true;
      const timestamp = new Date().toISOString();
      const { londonTime } = isWithinLondonBusinessHours();
      console.log(`${c('dim', `[${timestamp}]`)} ${c('green', '🌅')} Entering active mode - within business hours`);
      console.log(`  London time: ${londonTime}`);
      console.log(`  Will ping every ${opts.interval} minutes`);
    };

    const scheduleNext = async () => {
      const { inHours, londonTime, hour } = isWithinLondonBusinessHours();

      if (!timeCheckEnabled || inHours) {
        if (!isActive && timeCheckEnabled) {
          enterActiveMode();
        }
        isActive = true;

        await ping();

        currentTimer = setTimeout(async () => {
          await scheduleNext();
        }, intervalMs);
      } else {
        if (isActive || pingCount === 0) {
          enterDormantMode();
        } else {
          const timestamp = new Date().toISOString();
          if (!quiet) {
            console.log(`${c('dim', `[${timestamp}]`)} ${c('dim', '💤')} Still dormant - London time: ${londonTime} (hour: ${hour})`);
          }
        }
        isActive = false;

        currentTimer = setTimeout(async () => {
          await scheduleNext();
        }, dormantCheckMs);
      }
    };

    await scheduleNext();

    process.on('SIGINT', () => shutdown());
    process.on('SIGTERM', () => shutdown());
  });

program
  .command('export <space_id>')
  .description('Export a space/DM to JSON with batching and resume support')
  .option('-o, --output <file>', 'Output JSON file (default: export-{spaceId}-{date}.json)')
  .option('--batch-size <num>', 'Topics per page (default: 100)', '100')
  .option('--since <time>', 'Oldest boundary (ISO 8601, seconds/usec, or relative like 7d)')
  .option('--until <time>', 'Newest boundary (ISO 8601, seconds/usec, or relative like 24h)')
  .option('--full-threads', 'Fetch ALL replies for each thread (slower but complete)')
  .option('--max-pages <num>', 'Safety limit for pages (default: 1000)', '1000')
  .option('--dry-run', 'Do not write files')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('-v, --verbose', 'Show detailed progress')
  .action(async (spaceId, opts) => {
    try {
      await cmdExport(spaceId, { ...program.opts(), ...opts });
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('stay-online')
  .description('Keep your Google Chat presence as "online" by maintaining a channel connection')
  .option('--ping-interval <seconds>', 'Seconds between activity pings', '60')
  .option('--presence-timeout <seconds>', 'Presence shared timeout in seconds', '120')
  .option('--subscribe', 'Subscribe to all spaces for real-time events')
  .option('--quiet', 'Only log errors and connection status')
  .action(async (opts) => {
    try {
      await cmdStayOnline({ ...program.opts(), ...opts });
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('presence')
  .description('Maintain online presence by typing in a channel')
  .option('-c, --channel <id>', 'Space/channel ID to type in (default: AAAAWFu1kqo)', 'AAAAWFu1kqo')
  .option('-r, --refresh-interval <seconds>', 'Seconds between typing bursts (default: 300)', '300')
  .option('--headless', 'Run in headless mode (default: true)', true)
  .option('--no-headless', 'Run in visible mode')
  .option('--debug-port <port>', 'Chrome DevTools remote debugging port')
  .option('--force-login', 'Force re-authentication (clear saved state)')
  .option('--profile <name>', 'Browser profile to use (e.g. "Default", "Profile 1")')
  .option('--debug', 'Enable verbose debug logging')
  .option('-q, --quiet', 'Suppress periodic refresh messages')
  .action(async (opts) => {
    try {
      await cmdPresence({ ...program.opts(), ...opts });
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

program
  .command('download <space_id>')
  .description('[deprecated] Use "gchat export"')
  .option('-o, --output <filename>', 'Output filename (default: channel name)')
  .option('-b, --batch-size <num>', 'Messages per page', '30')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (spaceId, opts) => {
    try {
      await cmdDownload(spaceId, { ...program.opts(), ...opts });
    } catch (e) {
      printError((e as Error).message);
      process.exit(1);
    }
  });

export function createProgram(): Command {
  return program;
}
