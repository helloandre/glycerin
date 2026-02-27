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
} from '../../vendor/google-chat-api/index.js';

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
  isMuted?: boolean;
  normalizedName: string;
  mostRecentAt?: number;
  mostRecentReadAt?: number;
  hasMention?: boolean;
}

// Thread is essentially a Topic with UI state
export interface Thread extends Topic {
  isUnread: boolean;
  loading?: boolean;
}

// UI-specific types
export type FocusTarget =
  | 'chats'
  | 'threads'
  | 'messages'
  | 'input'
  | 'search'
  | 'confirmation';
export type SearchMode = 'local' | 'remote';
export type ChatDisplayMode = 'home' | 'mentions' | 'list';

export interface ConfirmationModal {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

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

  // Pagination state for threads
  threadsPagination: Record<
    string,
    {
      cursor?: number;
      hasMore: boolean;
    }
  >;

  // Unread tracking
  unread: Chat[];

  // UI state
  focused: FocusTarget;
  loading: Record<string, boolean>;
  chatSearchTrigger: number; // Timestamp to trigger chat search mode
  chatDisplayMode: ChatDisplayMode; // Display mode for chats panel
  showOnlyUnread: boolean; // Filter to show only unread items
  showMuted: boolean; // Show muted chats
  confirmationModal: ConfirmationModal | null; // Confirmation modal state
}

// Action types for state reducer
export type AppAction =
  | { type: 'CHATS_LOADED'; payload: Chat[] }
  | { type: 'CHAT_SELECTED'; payload: Chat }
  | { type: 'THREAD_SELECTED'; payload: Thread }
  | { type: 'NEW_THREAD_STARTED'; payload: { chatId: string } }
  | {
      type: 'THREADS_LOADED';
      payload: {
        chatId: string;
        threads: Thread[];
        hasMore: boolean;
        cursor?: number;
        append?: boolean;
      };
    }
  | {
      type: 'MESSAGES_LOADED';
      payload: { chatId: string; threadId: string; messages: Message[] };
    }
  | { type: 'MESSAGE_RECEIVED'; payload: Message }
  | { type: 'SEARCH_OPENED'; payload: SearchMode }
  | { type: 'SEARCH_CLOSED' }
  | { type: 'SEARCH_RESULTS'; payload: Chat[] }
  | { type: 'CHAT_SEARCH_OPENED' }
  | { type: 'FOCUS_CHANGED'; payload: FocusTarget }
  | { type: 'MARK_READ'; payload: { chatId: string; threadId?: string } }
  | { type: 'LOADING_START'; payload: string }
  | { type: 'LOADING_END'; payload: string }
  | { type: 'LOAD_MORE_THREADS'; payload: { chatId: string } }
  | { type: 'CHAT_DISPLAY_MODE_CHANGED'; payload: ChatDisplayMode }
  | { type: 'SHOW_ONLY_UNREAD_TOGGLED' }
  | { type: 'SHOW_MUTED_TOGGLED' }
  | { type: 'CHAT_MUTE_TOGGLED'; payload: { chatId: string } }
  | { type: 'CONFIRMATION_OPENED'; payload: ConfirmationModal }
  | { type: 'CONFIRMATION_CLOSED' }
  | { type: 'CHAT_LEFT'; payload: { chatId: string } };

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
