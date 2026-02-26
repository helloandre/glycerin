/**
 * Authentication module for Glycerin
 * Uses Playwright for browser-based authentication
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  extractCookiesFromBrowser,
  getProfile,
  listProfiles,
  loadCachedCookies,
  saveCachedCookies,
  setBrowser,
  setProfile,
} from 'google-chat-api/packages/gchat/dist/core/auth.js';
import { type Browser, type BrowserContext, chromium } from 'playwright';
import { logger } from './logger.js';

const DEFAULT_CACHE_DIR = path.join(os.homedir(), '.glycerin');
const REQUIRED_COOKIES = ['SID', 'HSID', 'SSID', 'OSID'];

export interface AuthOptions {
  cacheDir?: string;
  browser?: 'chrome' | 'brave' | 'edge' | 'chromium' | 'arc';
  profile?: string;
  forceReauth?: boolean;
  openBrowserOnMissingCookies?: boolean;
  tryBrowserExtraction?: boolean; // Try to extract from browser cookie DB (requires keychain access)
}

/**
 * Check if cookies contain all required values
 */
function hasRequiredCookies(cookies: Record<string, string> | null): boolean {
  if (!cookies || Object.keys(cookies).length === 0) {
    return false;
  }
  return REQUIRED_COOKIES.every(key => key in cookies && cookies[key]);
}

/**
 * Ensure Playwright browsers are installed
 */
async function ensurePlaywrightBrowsers(): Promise<void> {
  try {
    // Try to get the executable path - this will throw if not installed
    const executablePath = chromium.executablePath();
    if (fs.existsSync(executablePath)) {
      return; // Browser already installed
    }
  } catch {
    // Browser not installed, continue to installation
  }

  logger.info(
    'Installing Playwright Chromium browser (this only needs to happen once)'
  );

  try {
    execSync('npx playwright install chromium', {
      stdio: 'inherit',
      encoding: 'utf-8',
    });
    logger.info('Browser installation complete');
  } catch (error) {
    throw new Error(
      `Failed to install Playwright browsers: ${error.message}\nPlease run: npx playwright install chromium`
    );
  }
}

/**
 * Launch browser with Playwright and wait for user to log in
 * Returns cookies once authentication is complete
 */
async function launchBrowserForLogin(
  cacheDir: string
): Promise<Record<string, string>> {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    // Ensure Playwright browsers are installed
    await ensurePlaywrightBrowsers();

    logger.info(
      'Launching browser for authentication - please log in to your Google Chat account'
    );

    // Launch browser in headed mode
    browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });

    // Create a new context
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
      timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    const page = await context.newPage();

    // Navigate to Google Chat
    await page.goto('https://chat.google.com', {
      waitUntil: 'domcontentloaded',
    });

    logger.info(
      'Waiting for login completion and checking for authentication cookies'
    );

    // Poll for required cookies
    let authenticated = false;
    while (!authenticated) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Check every 2 seconds

      const cookies = await context.cookies();
      const cookieMap: Record<string, string> = {};

      for (const cookie of cookies) {
        // Filter for Google domain cookies
        if (
          cookie.domain.includes('google.com') ||
          cookie.domain.includes('chat.google.com')
        ) {
          cookieMap[cookie.name] = cookie.value;
        }
      }

      if (hasRequiredCookies(cookieMap)) {
        authenticated = true;
        logger.info('Authentication successful - cookies saved to cache');

        // Save cookies to cache
        saveCachedCookies(cookieMap, cacheDir);

        await browser.close();
        return cookieMap;
      }
    }

    throw new Error('Unexpected error: loop exited without authentication');
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    throw error;
  }
}

/**
 * Initialize authentication
 * By default, checks cache then launches Playwright browser for login.
 * Can optionally try extracting from browser cookie database (requires keychain access).
 */
export async function initAuth(
  options: AuthOptions = {}
): Promise<Record<string, string>> {
  const cacheDir = options.cacheDir || DEFAULT_CACHE_DIR;
  const openBrowserOnMissing = options.openBrowserOnMissingCookies ?? true; // Default to true
  const tryExtraction = options.tryBrowserExtraction ?? false; // Default to false

  // Ensure cache directory exists
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  // Try to load cached cookies first (unless forced to reauth)
  if (!options.forceReauth) {
    try {
      const cached = loadCachedCookies(cacheDir);
      if (hasRequiredCookies(cached)) {
        logger.info('Using cached authentication');
        return cached;
      }
    } catch (_error) {
      // No cached cookies, continue
    }
  }

  // Optionally try to extract cookies from browser database
  // NOTE: This requires macOS Keychain access and will trigger a password popup
  if (tryExtraction) {
    logger.info(
      'Extracting cookies from browser - please ensure you are logged into Google Chat'
    );

    try {
      // Set browser preference if specified
      if (options.browser) {
        setBrowser(options.browser);
      }

      // Handle profile selection
      if (options.profile) {
        setProfile(options.profile);
      } else {
        // Auto-detect: try 'Default' first, then fall back to available profiles
        const profiles = listProfiles();
        if (profiles && profiles.length > 0) {
          const defaultProfile = profiles.find((p: string) => p === 'Default');
          const profileToUse = defaultProfile || profiles[0];
          setProfile(profileToUse);
          logger.info(`Using browser profile: ${profileToUse}`);
        }
      }

      const cookies = await extractCookiesFromBrowser();

      if (hasRequiredCookies(cookies)) {
        saveCachedCookies(cookies, cacheDir);
        logger.info('Cookies extracted and cached successfully');
        return cookies;
      }
    } catch (error) {
      logger.warn(`Could not extract cookies from browser: ${error.message}`);
    }
  }

  // Launch browser for login
  if (openBrowserOnMissing) {
    if (!tryExtraction) {
      logger.info('No cached authentication found');
    } else {
      logger.info('No valid cookies found in browser or cache');
    }

    const cookies = await launchBrowserForLogin(cacheDir);
    return cookies;
  }

  // No cookies found and browser login not enabled
  throw new Error(
    'No valid authentication cookies found. Please enable openBrowserOnMissingCookies or tryBrowserExtraction option.'
  );
}

/**
 * Clear cached authentication
 */
export function clearAuth(cacheDir: string = DEFAULT_CACHE_DIR): void {
  const fs = require('node:fs');
  const cookiePath = path.join(cacheDir, 'cookies.json');

  try {
    if (fs.existsSync(cookiePath)) {
      fs.unlinkSync(cookiePath);
      logger.info('Cached authentication cleared');
    }
  } catch (error) {
    logger.error('Failed to clear auth', error);
  }
}

/**
 * Check if we have valid cached authentication
 */
export function hasValidAuth(cacheDir: string = DEFAULT_CACHE_DIR): boolean {
  try {
    const cookies = loadCachedCookies(cacheDir);
    return cookies && Object.keys(cookies).length > 0;
  } catch {
    return false;
  }
}
