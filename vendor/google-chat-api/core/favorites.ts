import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const STATE_FILE = 'gchat-state.json';

type State = {
  favorites: Favorite[];
  hidden: HiddenSpace[];
  lastViewed: LastViewed | null;
};

let stateCache: State | null = null;
let statePathCache: string | null = null;

function resolveDataDir(): string {
  return process.env.GCHAT_DATA_DIR || process.env.GCHAT_CACHE_DIR || join(homedir(), '.gchat');
}

function getStatePath(): string {
  return join(resolveDataDir(), STATE_FILE);
}

function defaultState(): State {
  return { favorites: [], hidden: [], lastViewed: null };
}

function loadState(path: string): State {
  try {
    if (!existsSync(path)) return defaultState();
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<State> | null;
    return {
      favorites: Array.isArray(parsed?.favorites) ? (parsed!.favorites as Favorite[]) : [],
      hidden: Array.isArray(parsed?.hidden) ? (parsed!.hidden as HiddenSpace[]) : [],
      lastViewed: (parsed as any)?.lastViewed || null,
    };
  } catch {
    return defaultState();
  }
}

function getState(): State {
  const statePath = getStatePath();
  if (stateCache && statePathCache === statePath) return stateCache;
  statePathCache = statePath;
  stateCache = loadState(statePath);
  return stateCache;
}

function saveState(next: State): void {
  const dataDir = resolveDataDir();
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  const statePath = getStatePath();
  writeFileSync(statePath, JSON.stringify(next, null, 2));
  stateCache = next;
  statePathCache = statePath;
}

export interface Favorite {
  id: string;
  name: string;
  type: 'space' | 'dm';
  created_at: number;
}

export function getFavorites(): Favorite[] {
  const state = getState();
  return [...state.favorites].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}

export function isFavorite(id: string): boolean {
  return getState().favorites.some((f) => f.id === id);
}

export function addFavorite(id: string, name: string, type: 'space' | 'dm'): Favorite {
  const created_at = Math.floor(Date.now() / 1000);
  const favorite: Favorite = { id, name, type, created_at };

  const state = getState();
  const favorites = state.favorites.filter((f) => f.id !== id);
  favorites.unshift(favorite);
  saveState({ ...state, favorites });

  return favorite;
}

export function removeFavorite(id: string): boolean {
  const state = getState();
  const before = state.favorites.length;
  const favorites = state.favorites.filter((f) => f.id !== id);
  if (favorites.length === before) return false;
  saveState({ ...state, favorites });
  return true;
}

export function getFavoriteIds(): Set<string> {
  return new Set(getState().favorites.map((f) => f.id));
}

export function closeDb(): void {
  stateCache = null;
  statePathCache = null;
}

export interface HiddenSpace {
  id: string;
  name: string;
  type: 'space' | 'dm';
  created_at: number;
}

export function getHidden(): HiddenSpace[] {
  const state = getState();
  return [...state.hidden].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}

export function isHidden(id: string): boolean {
  return getState().hidden.some((h) => h.id === id);
}

export function addHidden(id: string, name: string, type: 'space' | 'dm'): HiddenSpace {
  const created_at = Math.floor(Date.now() / 1000);
  const hidden: HiddenSpace = { id, name, type, created_at };

  const state = getState();
  const nextHidden = state.hidden.filter((h) => h.id !== id);
  nextHidden.unshift(hidden);
  saveState({ ...state, hidden: nextHidden });

  return hidden;
}

export function removeHidden(id: string): boolean {
  const state = getState();
  const before = state.hidden.length;
  const hidden = state.hidden.filter((h) => h.id !== id);
  if (hidden.length === before) return false;
  saveState({ ...state, hidden });
  return true;
}

export function getHiddenIds(): Set<string> {
  return new Set(getState().hidden.map((h) => h.id));
}

export interface LastViewed {
  channel_id: string;
  channel_type: 'space' | 'dm';
  updated_at: number;
}

export function getLastViewed(): LastViewed | null {
  const state = getState();
  const lv = state.lastViewed;
  if (!lv?.channel_id || (lv.channel_type !== 'space' && lv.channel_type !== 'dm')) return null;
  return lv;
}

export function setLastViewed(channel_id: string, channel_type: 'space' | 'dm'): LastViewed {
  const updated_at = Math.floor(Date.now() / 1000);
  const lastViewed: LastViewed = { channel_id, channel_type, updated_at };
  const state = getState();
  saveState({ ...state, lastViewed });
  return lastViewed;
}
