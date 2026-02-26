/**
 * Main App Component
 * Layout and orchestration of all UI components
 */

import { Box, Text, useStdout } from "ink";
import { useEffect } from "react";
import { AppStateProvider, useAppState } from "../context/AppContext.js";
import type { GlycerinChatClient } from "../lib/chat-client.js";
import type { Chat } from "../types/index.js";
import { ChatsPanel } from "./ChatsPanel.js";
import { EventBridge } from "./EventBridge.js";
import { InputBox } from "./InputBox.js";
import { LoadingIndicator } from "./LoadingIndicator.js";
import { MessagesPanel } from "./MessagesPanel.js";
import { ThreadsPanel } from "./ThreadsPanel.js";

interface AppProps {
  client: GlycerinChatClient;
}

function AppContent({ client }: AppProps) {
  const { state, dispatch } = useAppState();
  const { stdout } = useStdout();

  // Log terminal dimensions for debugging (can be removed after testing)
  useEffect(() => {
    if (process.env.DEBUG) {
      console.error(`Terminal size: ${stdout.columns}x${stdout.rows}`);
    }
  }, [stdout.columns, stdout.rows]);

  // Load chats on mount
  useEffect(() => {
    const loadChats = async () => {
      dispatch({ type: "LOADING_START", payload: "chats" });
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
        dispatch({ type: "CHATS_LOADED", payload: chats });
      } catch (error) {
        console.error("Failed to load chats:", error);
      } finally {
        dispatch({ type: "LOADING_END", payload: "chats" });
      }
    };

    loadChats();
  }, [client, dispatch]);

  // Load threads when a space (non-DM) chat is selected
  useEffect(() => {
    const loadThreads = async () => {
      if (!state.active.chat) return;

      const currentChat = state.chats[state.active.chat];
      if (!currentChat || currentChat.type === "dm") return; // DMs don't have threads

      dispatch({ type: "LOADING_START", payload: "threads" });
      try {
        const result = await client.getThreads(state.active.chat);
        const threads = (result.topics || []).map((topic: any) => ({
          ...topic,
          isUnread: false, // TODO: Determine from API data
        }));
        dispatch({
          type: "THREADS_LOADED",
          payload: {
            chatId: state.active.chat,
            threads,
            hasMore: result.hasMore || false,
          },
        });
      } catch (error) {
        console.error("Failed to load threads:", error);
      } finally {
        dispatch({ type: "LOADING_END", payload: "threads" });
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

      dispatch({ type: "LOADING_START", payload: "messages" });
      try {
        if (currentChat.type === "dm") {
          // For DMs, load all messages directly
          const result = await client.getAllMessages(state.active.chat);
          dispatch({
            type: "MESSAGES_LOADED",
            payload: {
              chatId: state.active.chat,
              threadId: "dm", // Special ID for DM messages
              messages: result.messages || [],
            },
          });
        } else if (state.active.thread) {
          // For spaces, load messages for the selected thread
          const result = await client.getThreadMessages(
            state.active.chat,
            state.active.thread,
          );
          dispatch({
            type: "MESSAGES_LOADED",
            payload: {
              chatId: state.active.chat,
              threadId: state.active.thread,
              messages: result.messages || [],
            },
          });
        }
      } catch (error) {
        console.error("Failed to load messages:", error);
      } finally {
        dispatch({ type: "LOADING_END", payload: "messages" });
      }
    };

    loadMessages();
  }, [state.active.chat, state.active.thread, state.chats, client, dispatch]);

  return (
    <Box flexDirection="column" height="100%">
      {/* Title Bar */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">
          Glycerin - Google Chat TUI
        </Text>
        <Text color="gray"> | </Text>
        <Text color="gray">Ctrl+D: Quit | Ctrl+F: Search</Text>
      </Box>

      {/* Main Content Area */}
      <Box flexGrow={1}>
        {/* Left Sidebar - Chats */}
        <ChatsPanel />

        {/* Right Side - Threads, Messages, Input */}
        <Box flexDirection="column" width="75%" flexGrow={1}>
          <ThreadsPanel />
          <MessagesPanel />
          <InputBox client={client} />
        </Box>
      </Box>

      {/* Status Bar / Loading Indicator */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <LoadingIndicator loadingKey="chats" message="Loading chats..." />
        <LoadingIndicator loadingKey="threads" message="Loading threads..." />
        <LoadingIndicator loadingKey="messages" message="Loading messages..." />
        {!useAppState().state.loading && <Text color="green">✓ Ready</Text>}
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
