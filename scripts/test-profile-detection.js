#!/usr/bin/env node

/**
 * Test profile detection for Chrome
 */

import {
  listProfiles,
  setBrowser,
  getBrowser,
  getBrowserBasePath,
} from "google-chat-api/packages/gchat/dist/core/auth.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

console.log("Testing Chrome profile detection...\n");

setBrowser("chrome");
console.log(`Browser set to: ${getBrowser()}`);

const basePath = getBrowserBasePath();
console.log(`Browser base path: ${basePath}`);
console.log(`Base path exists: ${existsSync(basePath)}`);

const profiles = listProfiles();
console.log(`\nProfiles found: ${profiles.length}`);
profiles.forEach((profile) => {
  const cookiePath = join(basePath, profile, "Cookies");
  const exists = existsSync(cookiePath);
  console.log(
    `  - ${profile} ${exists ? "✓" : "✗"} (cookies ${exists ? "found" : "not found"})`,
  );
});

if (profiles.length === 0) {
  console.log(
    "\n⚠️  No profiles found. Checking for Default profile manually...",
  );
  const defaultCookiePath = join(basePath, "Default", "Cookies");
  console.log(`Default profile path: ${defaultCookiePath}`);
  console.log(`Default profile exists: ${existsSync(defaultCookiePath)}`);
}
