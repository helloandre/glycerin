/**
 * MessagesPanel Component
 * Displays messages for the selected thread or DM
 */

import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';
import { useCurrentChat, useCurrentThread } from '../context/AppContext.js';
import { useFocus } from '../hooks/useFocus.js';
import { useKeyHandler } from '../hooks/useKeyHandler.js';
import type { Message } from '../types/index.js';

export function MessagesPanel() {
  const currentThread = useCurrentThread();
  const currentChat = useCurrentChat();
  const { isFocused } = useFocus('messages');
  const [scrollOffset, setScrollOffset] = useState(0);

  // Get messages from current thread or chat
  const messages = currentThread?.replies || [];

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    setScrollOffset(Math.max(0, messages.length - 10));
  }, [messages.length]);

  // Keyboard handlers for scrolling
  useKeyHandler(
    {
      'ctrl+k': () => handleScrollUp(),
      'ctrl+j': () => handleScrollDown(),
      'ctrl+g': () => setScrollOffset(0),
      'ctrl+l': () => setScrollOffset(Math.max(0, messages.length - 10)),
    },
    { enabled: isFocused }
  );

  const handleScrollUp = () => {
    setScrollOffset(Math.max(0, scrollOffset - 1));
  };

  const handleScrollDown = () => {
    setScrollOffset(
      Math.min(Math.max(0, messages.length - 10), scrollOffset + 1)
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
  const visibleMessages = messages.slice(scrollOffset, scrollOffset + 10);

  const showScrollIndicator = messages.length > 10;
  const scrollPosition =
    messages.length > 0
      ? Math.round((scrollOffset / Math.max(1, messages.length - 10)) * 100)
      : 0;

  return (
    <Box
      flexDirection="column"
      width="75%"
      height={currentChat?.type === 'dm' ? '90%' : '65%'}
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

      <Box flexDirection="column" flexGrow={1}>
        {!currentChat && !currentThread ? (
          <Text color="gray">Select a chat to view messages</Text>
        ) : messages.length === 0 ? (
          <Text color="gray">No messages yet</Text>
        ) : (
          visibleMessages.map((msg, idx) => formatMessage(msg, idx))
        )}
      </Box>

      {isFocused && (
        <Box borderStyle="single" borderColor="gray" marginTop={1} paddingX={1}>
          <Text dimColor>^K/^J:scroll ^G/^L:top/bottom</Text>
        </Box>
      )}
    </Box>
  );
}
