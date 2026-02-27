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
import { useFocus } from '../hooks/useFocus.js';
import { useKeyHandler } from '../hooks/useKeyHandler.js';
import type { Message } from '../types/index.js';

export function MessagesPanel() {
  const currentThread = useCurrentThread();
  const currentChat = useCurrentChat();
  const { dispatch } = useAppState();
  const { isFocused } = useFocus('messages');
  const { stdout } = useStdout();
  const [scrollOffset, setScrollOffset] = useState(0);

  // Get messages from current thread or chat
  const messages: Message[] = currentThread?.replies || [];

  // Calculate viewport height dynamically
  // Each message takes ~3 lines (sender+time line, text line, margin line)
  //
  // Layout breakdown:
  // - Title bar: 3 lines
  // - ThreadsPanel (when shown): 30% of available space
  // - InputBox: 4 lines (fixed height)
  // - MessagesPanel: 70% of available space (or 100% if no threads panel)
  // - MessagesPanel chrome:
  //   - Top border: 1 line
  //   - Header + margin: 2 lines
  //   - Bottom border: 1 line
  const titleBarHeight = 3;
  const inputBoxHeight = 4;
  const headerFooterOverhead = 4; // header + borders
  const totalAvailableHeight = stdout.rows - titleBarHeight - inputBoxHeight;

  // Messages panel takes 70% if threads panel is shown, otherwise 100%
  const showThreadsPanel = currentChat && currentChat.type !== 'dm';
  const messagesPanelHeight = showThreadsPanel
    ? Math.floor(totalAvailableHeight * 0.7)
    : totalAvailableHeight;
  const availableLines = Math.max(
    9,
    messagesPanelHeight - headerFooterOverhead
  );
  const viewportHeight = Math.max(3, Math.floor(availableLines / 3));

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    setScrollOffset(Math.max(0, messages.length - viewportHeight));
  }, [messages.length, viewportHeight]);

  // Keyboard handlers for scrolling
  useKeyHandler(
    {
      'ctrl+k': () => handleScrollUp(),
      'ctrl+j': () => handleScrollDown(),
      'ctrl+g': () => setScrollOffset(0),
      'ctrl+l': () =>
        setScrollOffset(Math.max(0, messages.length - viewportHeight)),
      enter: () => {
        // Go to input to reply
        dispatch({ type: 'FOCUS_CHANGED', payload: 'input' });
      },
      escape: () => {
        // Go back to threads for spaces, or chats for DMs
        if (currentChat?.type === 'dm') {
          dispatch({ type: 'FOCUS_CHANGED', payload: 'chats' });
        } else {
          dispatch({ type: 'FOCUS_CHANGED', payload: 'threads' });
        }
      },
    },
    { enabled: isFocused }
  );

  const handleScrollUp = () => {
    setScrollOffset(Math.max(0, scrollOffset - 1));
  };

  const handleScrollDown = () => {
    setScrollOffset(
      Math.min(Math.max(0, messages.length - viewportHeight), scrollOffset + 1)
    );
  };

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
          <Text bold color="blue">
            {userName}
          </Text>
          <Text color="gray"> {timeStr}</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>{text}</Text>
        </Box>
      </Box>
    );
  };

  // Calculate visible messages
  const visibleMessages = messages.slice(
    scrollOffset,
    scrollOffset + viewportHeight
  );

  const showScrollIndicator = messages.length > viewportHeight;
  const scrollPosition =
    messages.length > 0
      ? Math.round(
          (scrollOffset / Math.max(1, messages.length - viewportHeight)) * 100
        )
      : 0;

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      minHeight={0}
      borderStyle="single"
      borderColor={isFocused ? 'cyan' : 'gray'}
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text bold color={isFocused ? 'cyan' : 'gray'}>
          Messages {messages.length > 0 && `(${messages.length})`}
          {showScrollIndicator && ` - ${scrollPosition}%`}
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
        {!currentChat && !currentThread ? (
          <Text color="gray">Select a chat to view messages</Text>
        ) : currentThread?.topic_id === 'new' ? (
          <Text color="gray">Start a new thread - type your message below</Text>
        ) : messages.length === 0 ? (
          <Text color="gray">No messages yet</Text>
        ) : (
          visibleMessages.map((msg, idx) => formatMessage(msg, idx))
        )}
      </Box>
    </Box>
  );
}
