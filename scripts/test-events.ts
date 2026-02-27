#!/usr/bin/env node --loader ts-node/esm

/**
 * Test script for verifying event listening capabilities
 *
 * This script tests the ability to listen to incoming Google Chat events
 * including new messages, typing indicators, read receipts, and more.
 *
 * Prerequisites:
 *   Run the main Glycerin app first to authenticate (npm run dev)
 *   This will cache your auth cookies in ~/.glycerin/
 *
 * Usage:
 *   npx ts-node --esm test-events.ts
 *
 * The script will:
 * 1. Load cached cookies from ~/.glycerin/ (same as main app)
 * 2. Connect to Google Chat
 * 3. Subscribe to all conversations
 * 4. Listen for and log all incoming events
 * 5. Run for 2 minutes or until Ctrl+C is pressed
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadCachedCookies } from '../vendor/google-chat-api/core/auth.js';
import type { ChannelEvent } from '../vendor/google-chat-api/core/channel.js';
import { GoogleChatClient } from '../vendor/google-chat-api/core/client.js';
import { startStayOnline } from '../vendor/google-chat-api/utils/stay-online.js';

// Default cache directory (same as main app)
const DEFAULT_CACHE_DIR = path.join(os.homedir(), '.glycerin');
const CACHED_COOKIES_FILE = path.join(DEFAULT_CACHE_DIR, 'cached_cookies.json');

// ANSI color codes for prettier output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};

function log(color: string, prefix: string, ...args: any[]) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  console.log(
    `${colors.gray}[${timestamp}]${colors.reset} ${color}${prefix}${colors.reset}`,
    ...args
  );
}

function logEvent(eventType: string, details: string) {
  log(colors.cyan, `[${eventType.toUpperCase()}]`, details);
}

function logSuccess(message: string) {
  log(colors.green, '[✓]', message);
}

function logError(message: string, error?: any) {
  log(colors.red, '[✗]', message);
  if (error) {
    console.error(colors.gray, error, colors.reset);
  }
}

function logInfo(message: string) {
  log(colors.blue, '[ℹ]', message);
}

async function main() {
  console.log(
    '\n' +
      colors.bright +
      '=== Google Chat Event Listener Test ===' +
      colors.reset +
      '\n'
  );

  // Load cookies from cache (same as main app)
  logInfo(`Cache directory: ${DEFAULT_CACHE_DIR}`);
  logInfo(`Loading cached cookies from ${CACHED_COOKIES_FILE}...`);

  let cookies: Record<string, string> | null = null;

  // Try to load directly from the file
  try {
    if (fs.existsSync(CACHED_COOKIES_FILE)) {
      logInfo('Cached cookies file found, reading...');
      const data = fs.readFileSync(CACHED_COOKIES_FILE, 'utf-8');
      cookies = JSON.parse(data);

      // Verify required cookies are present
      const required = ['SID', 'HSID', 'SSID', 'OSID'];
      if (!required.every(name => cookies && name in cookies)) {
        logError('Cached cookies file exists but is missing required cookies');
        cookies = null;
      }
    } else {
      logError('Cached cookies file does not exist');
    }
  } catch (error) {
    logError('Failed to read cached cookies file:', error);
  }

  // Fallback to loadCachedCookies if direct read failed
  if (!cookies) {
    logInfo('Trying loadCachedCookies fallback...');
    cookies = loadCachedCookies(DEFAULT_CACHE_DIR);
  }

  if (!cookies) {
    logError('No cached cookies found');
    logInfo('Please run the main Glycerin app first to authenticate:');
    logInfo('  npm run dev');
    logInfo('Or authenticate manually and save cookies to:');
    logInfo(`  ${CACHED_COOKIES_FILE}`);
    process.exit(1);
  }

  logSuccess('Cached cookies loaded successfully!');
  logInfo('Initializing Google Chat client...');
  const client = new GoogleChatClient(cookies, DEFAULT_CACHE_DIR);

  // Track statistics
  const stats = {
    connected: false,
    subscribed: 0,
    messages: 0,
    typing: 0,
    readReceipts: 0,
    reactions: 0,
    userStatus: 0,
    membershipChanges: 0,
    groupUpdates: 0,
    otherEvents: 0,
    errors: 0,
    pings: 0,
  };

  // Event handler
  const handleEvent = (evt: any) => {
    switch (evt.type) {
      case 'connect':
        stats.connected = true;
        logSuccess(`Connected to Google Chat at ${evt.timestamp}`);
        break;

      case 'disconnect':
        stats.connected = false;
        logError('Disconnected from Google Chat');
        break;

      case 'subscribed':
        stats.subscribed = evt.conversations || 0;
        logSuccess(`Subscribed to ${stats.subscribed} conversation(s)`);
        break;

      case 'message':
        stats.messages++;
        logMessage(evt.event);
        break;

      case 'typing':
        stats.typing++;
        logTyping(evt.event);
        break;

      case 'readReceipt':
        stats.readReceipts++;
        logReadReceipt(evt.event);
        break;

      case 'reaction':
        stats.reactions++;
        logReaction(evt.event);
        break;

      case 'userStatus':
        stats.userStatus++;
        logUserStatus(evt.event);
        break;

      case 'membershipChanged':
        stats.membershipChanges++;
        logMembershipChange(evt.event);
        break;

      case 'groupUpdated':
        stats.groupUpdates++;
        logGroupUpdate(evt.event);
        break;

      case 'ping':
        stats.pings++;
        logEvent('ping', `Ping #${evt.count} sent`);
        break;

      case 'error':
        stats.errors++;
        logError('Event error:', evt.error);
        break;

      default:
        stats.otherEvents++;
        logEvent(
          'unknown',
          `Type: ${evt.type}, Data: ${JSON.stringify(evt).slice(0, 100)}...`
        );
    }
  };

  // Detailed event loggers
  function logMessage(event: ChannelEvent) {
    const message = event.body?.message;
    const groupId = event.groupId?.id || 'unknown';
    const groupType = event.groupId?.type || 'unknown';
    const sender = message?.creator?.name || message?.creator?.id || 'unknown';
    const text = message?.text?.slice(0, 100) || '(no text)';
    const messageId = message?.id || 'unknown';

    logEvent(
      'message',
      `${colors.bright}${sender}${colors.reset}${colors.cyan} in ${groupType}/${groupId.slice(0, 12)}...\n` +
        `         ${colors.gray}Text: ${text}${colors.reset}\n` +
        `         ${colors.gray}ID: ${messageId}${colors.reset}`
    );
  }

  function logTyping(event: ChannelEvent) {
    const userId = event.body?.typing?.userId || 'unknown';
    const state = event.body?.typing?.state;
    const groupId = event.groupId?.id?.slice(0, 12) || 'unknown';
    const stateText = state === 1 ? 'started typing' : 'stopped typing';

    logEvent('typing', `User ${userId} ${stateText} in ${groupId}...`);
  }

  function logReadReceipt(event: ChannelEvent) {
    const userId = event.body?.readReceipt?.userId || 'unknown';
    const readTime = event.body?.readReceipt?.readTime || 'unknown';
    const groupId = event.groupId?.id?.slice(0, 12) || 'unknown';

    logEvent(
      'read',
      `User ${userId} read message in ${groupId}... at ${readTime}`
    );
  }

  function logReaction(event: ChannelEvent) {
    const groupId = event.groupId?.id?.slice(0, 12) || 'unknown';

    logEvent('reaction', `Reaction in ${groupId}...`);
  }

  function logUserStatus(event: ChannelEvent) {
    const status = event.body?.userStatus;
    const userId = status?.userId || 'unknown';

    logEvent('status', `User ${userId} status changed`);
  }

  function logMembershipChange(event: ChannelEvent) {
    const groupId = event.groupId?.id?.slice(0, 12) || 'unknown';

    logEvent('membership', `Membership changed in ${groupId}...`);
  }

  function logGroupUpdate(event: ChannelEvent) {
    const groupId = event.groupId?.id?.slice(0, 12) || 'unknown';

    logEvent('group', `Group ${groupId}... updated`);
  }

  // Print statistics periodically
  function printStats() {
    console.log(`\n${colors.bright}--- Statistics ---${colors.reset}`);
    console.log(
      `${colors.green}Connected:${colors.reset}       ${stats.connected ? 'Yes' : 'No'}`
    );
    console.log(
      `${colors.green}Subscriptions:${colors.reset}   ${stats.subscribed}`
    );
    console.log(
      `${colors.cyan}Messages:${colors.reset}        ${stats.messages}`
    );
    console.log(
      `${colors.cyan}Typing events:${colors.reset}   ${stats.typing}`
    );
    console.log(
      `${colors.cyan}Read receipts:${colors.reset}   ${stats.readReceipts}`
    );
    console.log(
      `${colors.cyan}Reactions:${colors.reset}       ${stats.reactions}`
    );
    console.log(
      `${colors.cyan}User status:${colors.reset}     ${stats.userStatus}`
    );
    console.log(
      `${colors.cyan}Membership:${colors.reset}      ${stats.membershipChanges}`
    );
    console.log(
      `${colors.cyan}Group updates:${colors.reset}   ${stats.groupUpdates}`
    );
    console.log(
      `${colors.cyan}Other events:${colors.reset}    ${stats.otherEvents}`
    );
    console.log(`${colors.gray}Pings sent:${colors.reset}      ${stats.pings}`);
    console.log(`${colors.red}Errors:${colors.reset}          ${stats.errors}`);
    console.log('');
  }

  let session: any;
  let statsInterval: NodeJS.Timeout;

  try {
    logInfo('Starting event listener with auto-subscribe and ping...');

    // Start the stay-online session
    session = await startStayOnline(client, {
      pingIntervalSec: 30, // Ping every 30 seconds
      presenceTimeoutSec: 120, // Presence timeout
      subscribe: true, // Auto-subscribe to all conversations
      fetchConversations: true, // Auto-fetch conversation list
      onEvent: handleEvent,
    });

    logSuccess('Event listener started successfully!');
    logInfo('Listening for events... (Press Ctrl+C to stop)');
    logInfo('Try sending a message in Google Chat to see events appear here\n');

    // Print stats every 30 seconds
    statsInterval = setInterval(printStats, 30000);

    // Setup graceful shutdown
    let stopping = false;
    const shutdown = async () => {
      if (stopping) return;
      stopping = true;

      console.log('\n');
      logInfo('Shutting down...');

      clearInterval(statsInterval);

      if (session) {
        session.stop();
        await session.done;
      }

      printStats();
      logSuccess('Test completed successfully!');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Run for 2 minutes then auto-shutdown
    const timeoutMs = 2 * 60 * 1000; // 2 minutes
    logInfo(`Test will auto-shutdown in ${timeoutMs / 1000} seconds`);

    setTimeout(async () => {
      logInfo('Auto-shutdown timeout reached');
      await shutdown();
    }, timeoutMs);

    // Wait for session to complete
    await session.done;
  } catch (error) {
    logError('Failed to start event listener:', error);
    clearInterval(statsInterval!);
    process.exit(1);
  }
}

// Run the test
main().catch(error => {
  console.error(`\n${colors.red}Unhandled error:${colors.reset}`, error);
  process.exit(1);
});
