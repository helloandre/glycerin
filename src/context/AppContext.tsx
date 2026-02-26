/**
 * Global application state management using React Context
 */

import type React from "react";
import { createContext, type ReactNode, useContext, useReducer } from "react";
import type { AppAction, AppState, Chat, Thread } from "../types/index.js";

// Initial state
const initialState: AppState = {
  chats: {},
  threads: {},
  active: {
    chat: null,
    thread: null,
    search: false,
  },
  search: {
    mode: null,
    available: [],
    loading: false,
  },
  unread: [],
  focused: "chats",
  loading: {},
};

// Reducer function
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "CHATS_LOADED": {
      const chatsById: Record<string, Chat> = {};
      action.payload.forEach((chat) => {
        chatsById[chat.id] = chat;
      });
      return {
        ...state,
        chats: chatsById,
        unread: action.payload
          .filter((c) => c.isUnread)
          .sort((a, b) => (b.mostRecentAt || 0) - (a.mostRecentAt || 0)),
      };
    }

    case "CHAT_SELECTED":
      return {
        ...state,
        active: {
          ...state.active,
          chat: action.payload.id,
          // For DMs, auto-select the special 'dm' thread; for spaces, reset thread
          thread: action.payload.type === "dm" ? "dm" : null,
        },
        focused: action.payload.type === "dm" ? "input" : "threads",
      };

    case "THREAD_SELECTED":
      return {
        ...state,
        active: {
          ...state.active,
          thread: action.payload.topic_id,
        },
        focused: "input",
      };

    case "THREADS_LOADED": {
      const threadsById: Record<string, Thread> = {};
      action.payload.threads.forEach((thread) => {
        threadsById[thread.topic_id] = thread;
      });
      return {
        ...state,
        threads: {
          ...state.threads,
          [action.payload.chatId]: threadsById,
        },
      };
    }

    case "MESSAGES_LOADED": {
      // Messages are stored within threads (replies field in Topic)
      const chatThreads = state.threads[action.payload.chatId] || {};
      const thread = chatThreads[action.payload.threadId];

      const updatedThread = thread
        ? { ...thread, replies: action.payload.messages }
        : {
            topic_id: action.payload.threadId,
            space_id: action.payload.chatId,
            replies: action.payload.messages,
            isUnread: false,
            message_count: action.payload.messages.length,
          };

      return {
        ...state,
        threads: {
          ...state.threads,
          [action.payload.chatId]: {
            ...chatThreads,
            [action.payload.threadId]: updatedThread,
          },
        },
      };
    }

    case "MESSAGE_RECEIVED": {
      // Handle real-time message updates
      const msg = action.payload;
      if (!msg || !msg.space_id) {
        return state; // Ignore invalid messages
      }

      const chatId = msg.space_id;
      const threadId = msg.topic_id || "dm";

      // Update the messages in the appropriate thread
      if (state.threads[chatId]?.[threadId]) {
        const thread = state.threads[chatId][threadId];
        const updatedThread = {
          ...thread,
          replies: [...(thread.replies || []), msg],
          message_count: (thread.message_count || 0) + 1,
          isUnread: true,
        };

        return {
          ...state,
          threads: {
            ...state.threads,
            [chatId]: {
              ...state.threads[chatId],
              [threadId]: updatedThread,
            },
          },
          // Update chat unread status if not currently active
          chats: {
            ...state.chats,
            [chatId]: {
              ...state.chats[chatId],
              isUnread: state.active.chat !== chatId,
            },
          },
        };
      }

      // If thread doesn't exist in state yet, just mark chat as unread
      return {
        ...state,
        chats: {
          ...state.chats,
          [chatId]: {
            ...state.chats[chatId],
            isUnread: state.active.chat !== chatId,
          },
        },
      };
    }

    case "SEARCH_OPENED":
      return {
        ...state,
        active: {
          ...state.active,
          search: true,
        },
        search: {
          ...state.search,
          mode: action.payload,
          loading: action.payload === "remote",
        },
        focused: "search",
      };

    case "SEARCH_CLOSED":
      return {
        ...state,
        active: {
          ...state.active,
          search: false,
        },
        search: {
          mode: null,
          available: [],
          loading: false,
        },
        focused: state.active.chat ? "input" : "chats",
      };

    case "SEARCH_RESULTS":
      return {
        ...state,
        search: {
          ...state.search,
          available: action.payload,
          loading: false,
        },
      };

    case "FOCUS_CHANGED":
      return {
        ...state,
        focused: action.payload,
      };

    case "MARK_READ": {
      const chat = state.chats[action.payload.chatId];
      if (chat) {
        chat.isUnread = false;
      }
      if (action.payload.threadId && state.threads[action.payload.chatId]) {
        const thread =
          state.threads[action.payload.chatId][action.payload.threadId];
        if (thread) {
          thread.isUnread = false;
        }
      }
      return {
        ...state,
        unread: state.unread.filter((c) => c.id !== action.payload.chatId),
      };
    }

    case "LOADING_START":
      return {
        ...state,
        loading: {
          ...state.loading,
          [action.payload]: true,
        },
      };

    case "LOADING_END": {
      const { [action.payload]: _, ...restLoading } = state.loading;
      return {
        ...state,
        loading: restLoading,
      };
    }

    default:
      return state;
  }
}

// Context type
interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

// Create context
const AppContext = createContext<AppContextType | undefined>(undefined);

// Provider component
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

// Custom hook to use the context
export function useAppState() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }
  return context;
}

// Convenience selectors
export function useChats() {
  const { state } = useAppState();
  return Object.values(state.chats).sort(
    (a, b) =>
      (b.sortTimestamp || b.mostRecentAt || 0) -
      (a.sortTimestamp || a.mostRecentAt || 0),
  );
}

export function useCurrentChat() {
  const { state } = useAppState();
  return state.active.chat ? state.chats[state.active.chat] : null;
}

export function useCurrentThread() {
  const { state } = useAppState();
  if (!state.active.chat || !state.active.thread) return null;
  const thread = state.threads[state.active.chat]?.[state.active.thread];
  // If thread doesn't exist and it's a 'dm' thread, create a virtual thread
  if (!thread && state.active.thread === "dm") {
    return {
      topic_id: "dm",
      space_id: state.active.chat,
      replies: [],
      isUnread: false,
    } as any;
  }
  return thread || null;
}

export function useThreads() {
  const { state } = useAppState();
  if (!state.active.chat) return [];
  const chatThreads = state.threads[state.active.chat] || {};
  return Object.values(chatThreads).sort(
    (a, b) => (a.sort_time || 0) - (b.sort_time || 0),
  );
}

export function useFocused() {
  const { state } = useAppState();
  return state.focused;
}

export function useIsLoading(key?: string) {
  const { state } = useAppState();
  if (key) {
    return state.loading[key] || false;
  }
  return Object.keys(state.loading).length > 0;
}
