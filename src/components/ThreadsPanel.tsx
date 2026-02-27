/**
 * ThreadsPanel Component
 * Displays list of threads for the selected chat
 * Features: scrollable viewport, pagination
 */

import { Box, Text, useStdout } from 'ink';
import { useEffect, useState } from 'react';
import {
  useAppState,
  useCurrentChat,
  useCurrentThread,
  useIsLoading,
  useThreads,
  useThreadsPagination,
} from '../context/AppContext.js';
import { useFocus } from '../hooks/useFocus.js';
import { useKeyHandler } from '../hooks/useKeyHandler.js';
import type { GlycerinChatClient } from '../lib/chat-client.js';
import type { Thread } from '../types/index.js';

interface ThreadsPanelProps {
  client: GlycerinChatClient;
  onLoadMore: (chatId: string) => Promise<void>;
}

export function ThreadsPanel({ client, onLoadMore }: ThreadsPanelProps) {
  const threads = useThreads();
  const currentThread = useCurrentThread();
  const currentChat = useCurrentChat();
  const { dispatch } = useAppState();
  const { isFocused } = useFocus('threads');
  const pagination = useThreadsPagination(currentChat?.id);
  const isLoading = useIsLoading('threads');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Reverse threads so most recent is at the bottom
  const reversedThreads = [...threads].reverse();

  // Dynamic viewport height based on terminal size
  // ThreadsPanel takes 30% of available space
  // Panel header: 2 lines (title + margin)
  // Panel footer (when focused): 3 lines (help text + 2 borders)
  // Panel borders: 2 lines (top + bottom border)
  const { stdout } = useStdout();
  const titleBarHeight = 3;
  const inputBoxHeight = 4;
  const headerFooterOverhead = isFocused ? 7 : 4; // header + footer + borders
  const totalAvailableHeight = stdout.rows - titleBarHeight - inputBoxHeight;
  const threadsPanelHeight = Math.floor(totalAvailableHeight * 0.3);
  const viewportHeight = Math.max(3, threadsPanelHeight - headerFooterOverhead);

  // Update selected index when current thread changes
  useEffect(() => {
    if (currentThread) {
      const index = reversedThreads.findIndex(
        t => t.topic_id === currentThread.topic_id
      );
      if (index !== -1) {
        setSelectedIndex(index);
      }
    } else if (reversedThreads.length > 0) {
      // Default to the most recent thread (last in reversed list = bottom)
      setSelectedIndex(reversedThreads.length - 1);
    }
  }, [currentThread, reversedThreads]);

  // Auto-scroll to keep selected item visible
  useEffect(() => {
    if (selectedIndex < scrollOffset) {
      // Scroll up
      setScrollOffset(selectedIndex);
    } else if (selectedIndex >= scrollOffset + viewportHeight) {
      // Scroll down
      setScrollOffset(selectedIndex - viewportHeight + 1);
    }
  }, [selectedIndex, scrollOffset]);

  // Function to load more threads
  const handleLoadMore = async () => {
    if (currentChat && pagination.hasMore && !isLoading) {
      await onLoadMore(currentChat.id);
    }
  };

  // Keyboard handlers
  useKeyHandler(
    {
      j: () => handleDown(),
      down: () => handleDown(),
      k: () => handleUp(),
      up: () => handleUp(),
      g: () => setSelectedIndex(0),
      'shift+g': () =>
        setSelectedIndex(Math.max(0, reversedThreads.length - 1)),
      pagedown: () => handleLoadMore(),
      'ctrl+d': () => handleLoadMore(),
      enter: () => handleSelect(),
      escape: () => dispatch({ type: 'FOCUS_CHANGED', payload: 'chats' }),
    },
    { enabled: isFocused }
  );

  const handleDown = () => {
    setSelectedIndex(Math.min(reversedThreads.length - 1, selectedIndex + 1));
  };

  const handleUp = () => {
    setSelectedIndex(Math.max(0, selectedIndex - 1));
  };

  const handleSelect = () => {
    const thread = reversedThreads[selectedIndex];
    if (thread) {
      dispatch({ type: 'THREAD_SELECTED', payload: thread });
    }
  };

  // Format time difference in a human-readable way
  const formatTimeAgo = (timestampUsec?: number): string => {
    if (!timestampUsec) return '';

    const now = Date.now();
    const messageTime = timestampUsec / 1000; // Convert microseconds to milliseconds
    const diffMs = now - messageTime;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return '< 1 min ago';
    if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
    if (diffHours < 24)
      return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    const diffWeeks = Math.floor(diffDays / 7);
    return `${diffWeeks} week${diffWeeks === 1 ? '' : 's'} ago`;
  };

  const formatThreadLine = (
    thread: Thread,
    index: number,
    availableWidth: number
  ) => {
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
    const userName = firstMessage?.sender || 'Unknown';
    const messageText = firstMessage?.text || 'No messages';

    // Calculate reply info
    const replyCount = Math.max(0, thread.message_count - 1); // Subtract 1 for original message
    const lastReplyTime = thread.sort_time;
    const timeAgo = formatTimeAgo(lastReplyTime);
    const replySuffix =
      replyCount > 0
        ? ` (${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}, ${timeAgo})`
        : ` (${timeAgo})`;

    // Add indicators
    const unreadIndicator = thread.isUnread ? '● ' : '  ';
    const selectionIndicator = isSelected ? '❯ ' : '  ';

    // Calculate available width for message text
    // Account for: selection indicator (2) + unread (2) + username + ': ' (2) + reply suffix + padding
    const prefixLength = selectionIndicator.length + unreadIndicator.length;
    const userNameLength = userName.length + 2; // +2 for ': '
    const suffixLength = replySuffix.length;
    const messageMaxLength = Math.max(
      10,
      availableWidth - prefixLength - userNameLength - suffixLength - 2
    );

    let truncatedMessage = messageText;
    if (messageText.length > messageMaxLength) {
      truncatedMessage = `${messageText.substring(0, messageMaxLength - 3)}...`;
    }

    return (
      <Box key={thread.topic_id}>
        <Text color={color} bold={isSelected && isFocused}>
          {selectionIndicator}
          {unreadIndicator}
          <Text color="cyan">{userName}</Text>
          {': '}
          {truncatedMessage}
          <Text dimColor>{replySuffix}</Text>
        </Text>
      </Box>
    );
  };

  // Calculate visible threads based on viewport
  const visibleThreads = reversedThreads.slice(
    scrollOffset,
    scrollOffset + viewportHeight
  );
  const hasMore = scrollOffset + viewportHeight < reversedThreads.length;
  const hasScrolledUp = scrollOffset > 0;

  // Determine if we should show threads panel content
  const showThreads = currentChat && currentChat.type === 'space';

  // Calculate available width for threads panel
  // Chats panel takes 25%, threads panel takes remaining 75%
  const threadsPanelWidth = Math.floor(stdout.columns * 0.75);
  const contentWidth = threadsPanelWidth - 4; // Account for borders and padding

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      flexShrink={1}
      minHeight={0}
      borderStyle="single"
      borderColor={isFocused ? 'cyan' : 'gray'}
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text bold color={isFocused ? 'cyan' : 'gray'}>
          {currentChat?.name || 'Threads'}
        </Text>
        {isLoading && (
          <>
            <Text color="gray"> </Text>
            <Text color="yellow">Loading...</Text>
          </>
        )}
      </Box>

      <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
        {!showThreads ? (
          <Text color="gray">Direct messages don't have threads</Text>
        ) : reversedThreads.length === 0 ? (
          <Text color="gray">
            {isLoading ? 'Loading threads...' : 'No threads in this space'}
          </Text>
        ) : (
          <>
            {hasScrolledUp && (
              <Box>
                <Text color="gray" dimColor>
                  ↑ {scrollOffset} more
                </Text>
              </Box>
            )}
            {visibleThreads.map((thread, viewportIndex) => {
              const actualIndex = scrollOffset + viewportIndex;
              return formatThreadLine(thread, actualIndex, contentWidth);
            })}
            {hasMore && (
              <Box>
                <Text color="gray" dimColor>
                  ↓ {reversedThreads.length - (scrollOffset + viewportHeight)}{' '}
                  more
                </Text>
              </Box>
            )}
            {pagination.hasMore && !hasMore && (
              <Box>
                <Text color="cyan" dimColor>
                  {isLoading
                    ? 'Loading...'
                    : `${pagination.hasMore ? 'Ctrl+D: Load older threads' : ''}`}
                </Text>
              </Box>
            )}
          </>
        )}
      </Box>

      {isFocused && (
        <Box borderStyle="single" borderColor="gray" marginTop={1} paddingX={1}>
          <Text dimColor>
            j/k:nav ⏎:select esc:back
            {pagination.hasMore && ' | Ctrl+D:load more'}
          </Text>
        </Box>
      )}
    </Box>
  );
}
