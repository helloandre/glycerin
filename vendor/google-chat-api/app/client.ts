import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { getCookies, invalidateCache, setProfile } from '../core/auth.js';
import { GoogleChatClient } from '../core/client.js';

export interface CreateClientOptions {
  refresh?: boolean;
  profile?: string;
  cacheDir?: string;
}

export const DEFAULT_CACHE_DIR = process.env.GCHAT_CACHE_DIR || path.join(homedir(), '.gchat');

export function resolveCacheDir(options: { cacheDir?: string } = {}): string {
  const resolved = path.resolve(options.cacheDir || DEFAULT_CACHE_DIR);
  process.env.GCHAT_CACHE_DIR = resolved;
  return resolved;
}

export async function createClient(options: CreateClientOptions = {}): Promise<GoogleChatClient> {
  if (options.profile) {
    setProfile(options.profile);
  }

  const cacheDir = resolveCacheDir(options);
  try {
    mkdirSync(cacheDir, { recursive: true });
  } catch {
  }

  if (options.refresh) {
    invalidateCache(cacheDir);
  }

  const cookies = getCookies();

  const client = new GoogleChatClient(cookies, cacheDir);
  await client.authenticate(options.refresh);

  return client;
}

