/**
 * MessagesPanel Component
 * Displays messages for the selected thread or DM
 * Features: scrollable viewport with dynamic sizing
 */

import { Box, Text, useStdout } from 'ink';
import { useEffect, useState } from 'react';
import {
  useAppState,
  useCurrentChat,
  useCurrentThread,
} from '../context/AppContext.js';
import { useKeyHandler } from '../hooks/useKeyHandler.js';
import type { GlycerinChatClient } from '../lib/chat-client.js';
import { logger } from '../lib/logger.js';
import { colors } from '../theme/colors.js';
import type { Message } from '../types/index.js';
import { Panel } from './common/Panel.js';

interface MessagesPanelProps {
  client: GlycerinChatClient;
}

export function MessagesPanel({ client }: MessagesPanelProps) {
  const currentThread = useCurrentThread();
  const currentChat = useCurrentChat();
  const { state, dispatch } = useAppState();
  const { stdout } = useStdout();
  const scrollOffset = state.messagesScrollOffset;
  const [loadingFullThread, setLoadingFullThread] = useState(false);

  // Get messages from current thread or chat
  // Messages should already be in chronological order (oldest first, newest last)
  const messages: Message[] = currentThread?.replies || [];

  // Check if this thread has collapsed messages (Google Chat pattern)
  // has_more_replies indicates there are messages not loaded
  const hasCollapsedMessages = currentThread?.has_more_replies || false;
  const totalMessageCount = currentThread?.message_count || messages.length;

  // Calculate viewport height dynamically
  // Each message takes ~3 lines (sender+time line, text line, margin line)
  //
  // Layout breakdown:
  // - Title bar: 3 lines
  // - ThreadsPanel (when shown): 12 lines (10 threads + 2 chrome)
  // - InputBox: 4 lines (2 input + 2 chrome)
  // - MessagesPanel: remaining space (fills the rest)
  // - MessagesPanel chrome:
  //   - Header + margin: 2 lines
  // - Spacers: 2 lines total (1 above, 1 below)
  const titleBarHeight = 3;
  const threadsPanelHeight = 12; // 10 threads + 2 chrome
  const inputBoxHeight = 4;
  const spacersHeight = 2; // spacers between panels
  const headerFooterOverhead = 2; // header + margin only (no borders)

  // Messages panel fills remaining space
  const showThreadsPanel = currentChat && currentChat.type !== 'dm';
  const messagesPanelHeight = showThreadsPanel
    ? stdout.rows -
      titleBarHeight -
      threadsPanelHeight -
      inputBoxHeight -
      spacersHeight
    : stdout.rows - titleBarHeight - inputBoxHeight - spacersHeight;
  const availableLines = Math.max(
    9,
    messagesPanelHeight - headerFooterOverhead
  );
  const viewportHeight = Math.max(3, Math.floor(availableLines / 3));

  // Function to load all messages in a collapsed thread
  const loadAllMessages = async () => {
    if (!hasCollapsedMessages || !currentThread || !currentChat) return;
    if (loadingFullThread) return;

    setLoadingFullThread(true);
    try {
      const result = await client.getThreadMessages(
        currentChat.id,
        currentThread.topic_id
      );
      dispatch({
        type: 'MESSAGES_LOADED',
        payload: {
          chatId: currentChat.id,
          threadId: currentThread.topic_id,
          messages: result.messages || [],
        },
      });
    } catch (error) {
      logger.error('Failed to load all messages', error);
    } finally {
      setLoadingFullThread(false);
    }
  };

  // Handle Ctrl+O to load all messages
  useKeyHandler(
    {
      'ctrl+o': () => {
        if (hasCollapsedMessages && !loadingFullThread) {
          loadAllMessages();
        }
      },
    },
    { enabled: true }
  );

  // Auto-scroll to bottom when thread changes or new messages arrive
  // biome-ignore lint/correctness/useExhaustiveDependencies: We want to scroll when thread ID changes
  useEffect(() => {
    dispatch({ type: 'MESSAGES_SCROLL_RESET' });
  }, [currentThread?.topic_id, dispatch]);

  // Clamp scroll offset to valid range
  const maxScrollOffset = Math.max(0, messages.length - viewportHeight);
  const clampedScrollOffset = Math.min(scrollOffset, maxScrollOffset);

  const formatMessage = (message: Message, index: number) => {
    // Format timestamp
    const timestamp = message.timestamp_usec || 0;
    const date = new Date(timestamp / 1000);
    const timeStr = date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    // Get user name
    const userName = message.sender || 'Unknown';

    // Get message text
    const text = message.text || '';

    return (
      <Box
        key={message.message_id || index}
        flexDirection="column"
        marginBottom={1}
      >
        <Box>
          <Text bold color={colors.accent.focusPrimary}>
            {userName}
          </Text>
          <Text color={colors.text.secondary}> {timeStr}</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text color={colors.text.primary}>{text}</Text>
        </Box>
      </Box>
    );
  };

  // Calculate visible messages, accounting for collapsed messages
  // When messages are collapsed, we show: first message, gap indicator, recent messages
  let visibleMessages: Message[] = [];
  let gapIndicatorPosition = -1; // -1 means no gap
  let hiddenMessageCount = 0;

  if (hasCollapsedMessages && messages.length > 1) {
    // Google Chat pattern: first message + recent messages with gap in between
    const firstMessage = messages[0];
    const recentMessages = messages.slice(1); // All except first
    hiddenMessageCount = totalMessageCount - messages.length;

    // Apply scrolling to recent messages only (first message always visible)
    const scrolledRecentMessages = recentMessages.slice(
      clampedScrollOffset,
      clampedScrollOffset + Math.max(1, viewportHeight - 1) // Reserve 1 slot for first message
    );

    // Build visible messages: [first message, gap indicator position marker, ...recent messages]
    visibleMessages = [firstMessage];
    gapIndicatorPosition = 1; // Gap appears after first message
    visibleMessages.push(...scrolledRecentMessages);
  } else {
    // Normal scrolling behavior
    visibleMessages = messages.slice(
      clampedScrollOffset,
      clampedScrollOffset + viewportHeight
    );
  }

  const showScrollIndicator = messages.length > viewportHeight;
  // Scroll position (0 = top, max = bottom)
  const scrollPosition =
    messages.length > 0
      ? Math.round(
          (clampedScrollOffset /
            Math.max(1, messages.length - viewportHeight)) *
            100
        )
      : 0;

  return (
    <Panel
      level={3}
      isFocused={false}
      flexGrow={1}
      paddingX={1}
      flexDirection="column"
    >
      <Box marginBottom={1}>
        <Text bold color={colors.text.muted}>
          Messages {messages.length > 0 && `(${messages.length})`}
          {showScrollIndicator && ` - ${scrollPosition}%`}
        </Text>
      </Box>

      <Box
        flexDirection="column"
        flexGrow={1}
        minHeight={0}
        overflow="hidden"
        justifyContent="flex-end"
      >
        {!currentChat && !currentThread ? (
          <Text color={colors.text.muted}>Select a chat to view messages</Text>
        ) : currentThread?.topic_id === 'new' ? (
          <Text color={colors.text.muted}>
            Start a new thread - type your message below
          </Text>
        ) : messages.length === 0 ? (
          <Text color={colors.text.muted}>No messages yet</Text>
        ) : (
          <>
            {visibleMessages.map((msg, idx) => {
              // Show gap indicator after the first message if messages are collapsed
              if (idx === gapIndicatorPosition) {
                return (
                  <Box
                    key={`gap-${msg.message_id || idx}`}
                    flexDirection="column"
                  >
                    {formatMessage(visibleMessages[idx - 1], idx - 1)}
                    <Box
                      marginY={1}
                      paddingY={1}
                      paddingX={2}
                      borderStyle="single"
                      borderColor={colors.accent.inactive}
                    >
                      {loadingFullThread ? (
                        <Text color={colors.accent.focusPrimary}>
                          Loading all messages...
                        </Text>
                      ) : (
                        <>
                          <Text color={colors.text.secondary}>
                            {hiddenMessageCount} message
                            {hiddenMessageCount !== 1 ? 's' : ''} not shown
                          </Text>
                          <Text color={colors.text.muted}>
                            {' '}
                            (Press Ctrl+O to load all)
                          </Text>
                        </>
                      )}
                    </Box>
                  </Box>
                );
              }

              // Don't render the first message again (it was already rendered in the gap)
              if (gapIndicatorPosition > 0 && idx === 0) {
                return null;
              }

              return formatMessage(msg, idx);
            })}
          </>
        )}
      </Box>
    </Panel>
  );
}
