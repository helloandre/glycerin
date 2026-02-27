#!/usr/bin/env node

/**
 * Glycerin - Google Chat TUI
 * Main entry point
 */

// Disable google-chat-api logging to prevent interference with TUI
// Must be set before importing any google-chat-api modules
if (!process.env.LOG_LEVEL) {
  process.env.LOG_LEVEL = 'silent';
}

import { docopt } from 'docopt';
import { render } from 'ink';
import React from 'react';
import { App } from './components/App.js';
import { initAuth } from './lib/auth.js';
import { GlycerinChatClient } from './lib/chat-client.js';

const doc = `
Glycerin - Google Chat Terminal User Interface

Usage:
  gln [options]
  gln leave [--auth]
  gln --help

Options:
  -h --help       Show This Message
  -a --auth       Force reauthenticate with browser
  --browser=<b>   Browser to use for auth [default: chrome]
                  Options: chrome, chromium, brave, edge, arc
`;

async function main() {
  const opts = docopt(doc);

  try {
    // Initialize authentication
    // By default, this will launch a Playwright browser if no cached cookies exist
    const cookies = await initAuth({
      forceReauth: opts['--auth'] || false,
      // Note: --browser option only applies if tryBrowserExtraction is true
    });

    // Initialize chat client
    const client = new GlycerinChatClient();
    await client.init(cookies);

    // Render the app with explicit terminal configuration
    const { waitUntilExit } = render(React.createElement(App, { client }), {
      stdout: process.stdout,
      stdin: process.stdin,
      stderr: process.stderr,
      exitOnCtrlC: true,
      patchConsole: true,
    });

    // Ensure proper cleanup on exit
    await waitUntilExit();
    process.exit(0);
  } catch (error) {
    console.error(
      'Failed to start Glycerin:',
      error instanceof Error ? error.message : String(error)
    );
    console.error('\nTroubleshooting:');
    console.error(
      '  1. Complete the Google Chat login in the Playwright browser window'
    );
    console.error(
      '  2. Try running with --auth flag to force re-authentication'
    );
    process.exit(1);
  }
}

main();
