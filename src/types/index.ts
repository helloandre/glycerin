/**
 * Core type definitions for Glycerin
 * References google-chat-api types where possible
 */

// Re-export types from google-chat-api
import type {
  Annotation,
  AnnotationType,
  Message,
  SelfUser,
  Space,
  Topic,
  UserPresence,
} from 'google-chat-api/packages/gchat/dist/index.js';

export type {
  Space,
  Message,
  Topic,
  Annotation,
  AnnotationType,
  UserPresence,
  SelfUser,
};

// Our simplified chat type (combining spaces and DMs)
export interface Chat extends Space {
  isUnread: boolean;
  isFave?: boolean;
  normalizedName: string;
  mostRecentAt?: number;
  mostRecentReadAt?: number;
}

// Thread is essentially a Topic with UI state
export interface Thread extends Topic {
  isUnread: boolean;
  loading?: boolean;
}

// UI-specific types
export type FocusTarget = 'chats' | 'threads' | 'messages' | 'input' | 'search';
export type SearchMode = 'local' | 'remote';

// App state structure
export interface AppState {
  // Data
  chats: Record<string, Chat>;
  threads: Record<string, Record<string, Thread>>; // chatId -> threadId -> Thread

  // Active selections
  active: {
    chat: string | null; // Currently selected chat ID
    thread: string | null; // Currently selected thread ID
    search: boolean; // Is search modal open
  };

  // Search state
  search: {
    mode: SearchMode | null;
    available: Chat[];
    loading: boolean;
  };

  // Unread tracking
  unread: Chat[];

  // UI state
  focused: FocusTarget;
  loading: Record<string, boolean>;
}

// Action types for state reducer
export type AppAction =
  | { type: 'CHATS_LOADED'; payload: Chat[] }
  | { type: 'CHAT_SELECTED'; payload: Chat }
  | { type: 'THREAD_SELECTED'; payload: Thread }
  | {
      type: 'THREADS_LOADED';
      payload: { chatId: string; threads: Thread[]; hasMore: boolean };
    }
  | {
      type: 'MESSAGES_LOADED';
      payload: { chatId: string; threadId: string; messages: Message[] };
    }
  | { type: 'MESSAGE_RECEIVED'; payload: Message }
  | { type: 'SEARCH_OPENED'; payload: SearchMode }
  | { type: 'SEARCH_CLOSED' }
  | { type: 'SEARCH_RESULTS'; payload: Chat[] }
  | { type: 'FOCUS_CHANGED'; payload: FocusTarget }
  | { type: 'MARK_READ'; payload: { chatId: string; threadId?: string } }
  | { type: 'LOADING_START'; payload: string }
  | { type: 'LOADING_END'; payload: string };

// App actions interface
export interface AppActions {
  selectChat: (chat: Chat) => Promise<void>;
  selectThread: (thread: Thread) => void;
  sendMessage: (text: string) => Promise<void>;
  openSearch: (mode: SearchMode) => void;
  closeSearch: () => void;
  searchLocal: (query: string) => void;
  searchRemote: (query: string) => Promise<void>;
  markRead: (chatId: string, threadId?: string) => void;
  goToNextUnread: () => void;
  leaveChat: (chat: Chat) => Promise<void>;
  setFocus: (target: FocusTarget) => void;
}
