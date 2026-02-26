#!/usr/bin/env tsx
/**
 * Example: Browser-based authentication with Playwright
 *
 * By default, initAuth will:
 * 1. Check for cached cookies (~/.glycerin/cached_cookies.json)
 * 2. If none found, launch Playwright browser for login
 *
 * The browser will stay open until you complete the login,
 * then automatically close and save the cookies.
 */

import { initAuth } from "./src/lib/auth.js";

async function main() {
  console.log("Starting authentication...\n");

  try {
    // Simple usage - defaults work great!
    const cookies = await initAuth();

    // Or with options:
    // const cookies = await initAuth({
    //   // Force re-authentication even if cached cookies exist
    //   forceReauth: true,
    //
    //   // Try extracting from browser cookie DB first (triggers password popup on macOS)
    //   tryBrowserExtraction: true,
    //   browser: "chrome", // Options: chrome, brave, edge, chromium, arc
    //   profile: "Default",
    // });

    console.log("\n✅ Authentication successful!");
    console.log("Cookies obtained:", Object.keys(cookies));
  } catch (error) {
    console.error("\n❌ Authentication failed:", error.message);
    process.exit(1);
  }
}

main();
