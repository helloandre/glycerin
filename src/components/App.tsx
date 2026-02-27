/**
 * Main App Component
 * Layout and orchestration of all UI components
 */

import { Box, Text, useApp, useStdout } from 'ink';
import { useEffect } from 'react';
import { AppStateProvider, useAppState } from '../context/AppContext.js';
import { useKeyHandler } from '../hooks/useKeyHandler.js';
import type { GlycerinChatClient } from '../lib/chat-client.js';
import { logger } from '../lib/logger.js';
import type { Chat } from '../types/index.js';
import { ChatsPanel } from './ChatsPanel.js';
import { EventBridge } from './EventBridge.js';
import { InputBox } from './InputBox.js';
import { LoadingIndicator } from './LoadingIndicator.js';
import { MessagesPanel } from './MessagesPanel.js';
import { ThreadsPanel } from './ThreadsPanel.js';

interface AppProps {
  client: GlycerinChatClient;
}

function AppContent({ client }: AppProps) {
  const { state, dispatch } = useAppState();
  const { stdout } = useStdout();
  const { exit } = useApp();

  // Global hotkeys (work regardless of focus)
  useKeyHandler(
    {
      'ctrl+c': () => exit(),
      'ctrl+f': () => {
        // TODO: Implement search modal
        logger.info('Search not yet implemented');
      },
    },
    { enabled: true }
  );

  // Log terminal dimensions for debugging (can be removed after testing)
  useEffect(() => {
    if (process.env.DEBUG) {
      logger.debug(`Terminal size: ${stdout.columns}x${stdout.rows}`);
    }
  }, [stdout.columns, stdout.rows]);

  // Function to load more threads
  const loadMoreThreads = async (chatId: string) => {
    const pagination = state.threadsPagination[chatId];
    if (!pagination?.hasMore || !pagination.cursor) return;

    dispatch({ type: 'LOADING_START', payload: 'threads' });
    try {
      const result = await client.getThreads(chatId, {
        pageSize: 25,
        cursor: pagination.cursor,
      });
      const threads = (result.topics || []).map((topic: any) => ({
        ...topic,
        isUnread: false, // TODO: Determine from API data
      }));
      dispatch({
        type: 'THREADS_LOADED',
        payload: {
          chatId,
          threads,
          hasMore: result.pagination?.has_more || false,
          cursor: result.pagination?.next_cursor,
          append: true,
        },
      });
    } catch (error) {
      logger.error('Failed to load more threads', error);
    } finally {
      dispatch({ type: 'LOADING_END', payload: 'threads' });
    }
  };

  // Load chats on mount
  useEffect(() => {
    const loadChats = async () => {
      dispatch({ type: 'LOADING_START', payload: 'chats' });
      try {
        // Use listWorldItems which includes unread counts
        const worldItems = await client.getChatsWithUnread();
        const chats: Chat[] = worldItems.map((item: any) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          sortTimestamp: item.lastMentionTime || 0,
          isUnread: (item.unreadCount || 0) > 0,
          normalizedName: (item.name || item.id).toLowerCase(),
        }));
        dispatch({ type: 'CHATS_LOADED', payload: chats });
      } catch (error) {
        logger.error('Failed to load chats', error);
      } finally {
        dispatch({ type: 'LOADING_END', payload: 'chats' });
      }
    };

    loadChats();
  }, [client, dispatch]);

  // Load threads when a space (non-DM) chat is selected
  useEffect(() => {
    const loadThreads = async () => {
      if (!state.active.chat) return;

      const currentChat = state.chats[state.active.chat];
      if (!currentChat || currentChat.type === 'dm') return; // DMs don't have threads

      dispatch({ type: 'LOADING_START', payload: 'threads' });
      try {
        const result = await client.getThreads(state.active.chat, {
          pageSize: 25,
        });
        const threads = (result.topics || []).map((topic: any) => ({
          ...topic,
          isUnread: false, // TODO: Determine from API data
        }));
        dispatch({
          type: 'THREADS_LOADED',
          payload: {
            chatId: state.active.chat,
            threads,
            hasMore: result.pagination?.has_more || false,
            cursor: result.pagination?.next_cursor,
            append: false,
          },
        });
      } catch (error) {
        logger.error('Failed to load threads', error);
      } finally {
        dispatch({ type: 'LOADING_END', payload: 'threads' });
      }
    };

    loadThreads();
  }, [state.active.chat, state.chats, client, dispatch]);

  // Load messages when a thread or DM is selected
  useEffect(() => {
    const loadMessages = async () => {
      if (!state.active.chat) return;

      const currentChat = state.chats[state.active.chat];
      if (!currentChat) return;

      dispatch({ type: 'LOADING_START', payload: 'messages' });
      try {
        if (currentChat.type === 'dm') {
          // For DMs, load all messages directly
          const result = await client.getAllMessages(state.active.chat);
          dispatch({
            type: 'MESSAGES_LOADED',
            payload: {
              chatId: state.active.chat,
              threadId: 'dm', // Special ID for DM messages
              messages: result.messages || [],
            },
          });
        } else if (state.active.thread) {
          // For spaces, load messages for the selected thread
          const result = await client.getThreadMessages(
            state.active.chat,
            state.active.thread
          );
          dispatch({
            type: 'MESSAGES_LOADED',
            payload: {
              chatId: state.active.chat,
              threadId: state.active.thread,
              messages: result.messages || [],
            },
          });
        }
      } catch (error) {
        logger.error('Failed to load messages', error);
      } finally {
        dispatch({ type: 'LOADING_END', payload: 'messages' });
      }
    };

    loadMessages();
  }, [state.active.chat, state.active.thread, state.chats, client, dispatch]);

  return (
    <Box flexDirection="column" height="100%">
      {/* Title Bar */}
      <Box
        borderStyle="single"
        borderColor="cyan"
        paddingX={1}
        flexShrink={0}
        minHeight={0}
        justifyContent="space-between"
      >
        <Box>
          <Text bold color="cyan">
            Glycerin - Google Chat TUI
          </Text>
          <Text color="gray"> | </Text>
          <Text color="gray">Ctrl+C: Quit | Ctrl+F: Search</Text>
        </Box>
        <Box>
          <LoadingIndicator loadingKey="chats" message="Loading chats..." />
          <LoadingIndicator loadingKey="threads" message="Loading threads..." />
          <LoadingIndicator
            loadingKey="messages"
            message="Loading messages..."
          />
          {!state.loading && <Text color="green">✓ Ready</Text>}
        </Box>
      </Box>

      {/* Main Content Area */}
      <Box flexGrow={1} minHeight={0} overflow="hidden">
        {/* Left Sidebar - Chats */}
        <ChatsPanel />

        {/* Right Side - Threads, Messages, Input */}
        <Box flexDirection="column" width="75%" flexGrow={1} minHeight={0}>
          <ThreadsPanel client={client} onLoadMore={loadMoreThreads} />
          <MessagesPanel />
          <InputBox client={client} />
        </Box>
      </Box>
    </Box>
  );
}

export function App({ client }: AppProps) {
  return (
    <AppStateProvider>
      <EventBridge client={client} />
      <AppContent client={client} />
    </AppStateProvider>
  );
}
