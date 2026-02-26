#!/usr/bin/env node

/**
 * Debug script to list available browser profiles
 */

import {
  listBrowsersWithProfiles,
  listProfiles,
  setBrowser,
  getBrowser,
} from "google-chat-api/packages/gchat/dist/core/auth.js";

console.log("Available browsers and their profiles:\n");

const browsersWithProfiles = listBrowsersWithProfiles();
for (const [browser, profiles] of Object.entries(browsersWithProfiles)) {
  console.log(`${browser}:`);
  if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
    console.log("  (no profiles found)");
  } else {
    profiles.forEach((profile) => {
      console.log(`  - ${profile}`);
    });
  }
  console.log("");
}

// Also check the currently selected browser
console.log(`\nCurrently selected browser: ${getBrowser()}`);

setBrowser("chromium");
console.log(`\nProfiles for Chromium:`);
const chromiumProfiles = listProfiles();
if (chromiumProfiles.length === 0) {
  console.log("  (no profiles found)");
} else {
  chromiumProfiles.forEach((profile) => {
    console.log(`  - ${profile}`);
  });
}
