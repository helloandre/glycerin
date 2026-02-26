/**
 * ThreadsPanel Component
 * Displays list of threads for the selected chat
 */

import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';
import {
  useAppState,
  useCurrentChat,
  useCurrentThread,
  useThreads,
} from '../context/AppContext.js';
import { useFocus } from '../hooks/useFocus.js';
import { useKeyHandler } from '../hooks/useKeyHandler.js';
import type { Thread } from '../types/index.js';

export function ThreadsPanel() {
  const threads = useThreads();
  const currentThread = useCurrentThread();
  const currentChat = useCurrentChat();
  const { dispatch } = useAppState();
  const { isFocused } = useFocus('threads');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Update selected index when current thread changes
  useEffect(() => {
    if (currentThread) {
      const index = threads.findIndex(
        t => t.topic_id === currentThread.topic_id
      );
      if (index !== -1) {
        setSelectedIndex(index);
      }
    }
  }, [currentThread, threads]);

  // Keyboard handlers
  useKeyHandler(
    {
      j: () => handleDown(),
      down: () => handleDown(),
      k: () => handleUp(),
      up: () => handleUp(),
      g: () => setSelectedIndex(0),
      'shift+g': () => setSelectedIndex(Math.max(0, threads.length - 1)),
      enter: () => handleSelect(),
      escape: () => dispatch({ type: 'FOCUS_CHANGED', payload: 'chats' }),
    },
    { enabled: isFocused }
  );

  const handleDown = () => {
    setSelectedIndex(Math.min(threads.length - 1, selectedIndex + 1));
  };

  const handleUp = () => {
    setSelectedIndex(Math.max(0, selectedIndex - 1));
  };

  const handleSelect = () => {
    const thread = threads[selectedIndex];
    if (thread) {
      dispatch({ type: 'THREAD_SELECTED', payload: thread });
    }
  };

  const formatThreadLine = (thread: Thread, index: number) => {
    const isSelected = index === selectedIndex;
    const _isCurrent = currentThread?.topic_id === thread.topic_id;

    // Determine colors
    let color = 'white';
    if (isFocused) {
      color = isSelected ? 'cyan' : 'white';
    } else {
      color = isSelected ? 'gray' : 'gray';
    }

    // Get first message as thread preview
    const firstMessage = thread.replies?.[0];
    let preview = firstMessage?.text || 'No messages';
    if (preview.length > 40) {
      preview = `${preview.substring(0, 37)}...`;
    }

    // Add indicators
    const unreadIndicator = thread.isUnread ? '● ' : '  ';
    const selectionIndicator = isSelected ? '❯ ' : '  ';
    const messageCount =
      thread.message_count > 0 ? ` (${thread.message_count})` : '';

    return (
      <Box key={thread.topic_id}>
        <Text color={color} bold={isSelected && isFocused}>
          {selectionIndicator}
          {unreadIndicator}
          {preview}
          {messageCount}
        </Text>
      </Box>
    );
  };

  // Don't show threads panel for DMs
  if (!currentChat || currentChat.type === 'dm') {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      width="75%"
      height="25%"
      borderStyle="single"
      borderColor={isFocused ? 'cyan' : 'gray'}
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text bold color={isFocused ? 'cyan' : 'gray'}>
          Threads {threads.length > 0 && `(${threads.length})`}
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {threads.length === 0 ? (
          <Text color="gray">No threads in this space</Text>
        ) : (
          threads.map((thread, index) => formatThreadLine(thread, index))
        )}
      </Box>

      {isFocused && (
        <Box borderStyle="single" borderColor="gray" marginTop={1} paddingX={1}>
          <Text dimColor>↑↓:nav ⏎:select esc:back</Text>
        </Box>
      )}
    </Box>
  );
}
