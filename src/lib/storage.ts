/**
 * Storage utility for persisting user preferences
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ChatDisplayMode } from '../types/index.js';

export interface UserPreferences {
  chatDisplayMode: ChatDisplayMode;
  showOnlyUnread: boolean;
  showMuted: boolean;
}

const CONFIG_DIR = path.join(os.homedir(), '.config', 'glycerin');
const PREFERENCES_FILE = path.join(CONFIG_DIR, 'preferences.json');

const DEFAULT_PREFERENCES: UserPreferences = {
  chatDisplayMode: 'home',
  showOnlyUnread: true,
  showMuted: false,
};

/**
 * Ensure the config directory exists
 */
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load user preferences from disk
 */
export function loadPreferences(): UserPreferences {
  try {
    if (fs.existsSync(PREFERENCES_FILE)) {
      const data = fs.readFileSync(PREFERENCES_FILE, 'utf-8');
      const saved = JSON.parse(data) as Partial<UserPreferences>;
      // Merge with defaults to handle new preference keys
      return {
        ...DEFAULT_PREFERENCES,
        ...saved,
      };
    }
  } catch (error) {
    console.error('Failed to load preferences:', error);
  }
  return DEFAULT_PREFERENCES;
}

/**
 * Save user preferences to disk
 */
export function savePreferences(preferences: UserPreferences): void {
  try {
    ensureConfigDir();
    fs.writeFileSync(PREFERENCES_FILE, JSON.stringify(preferences, null, 2));
  } catch (error) {
    console.error('Failed to save preferences:', error);
  }
}
