/**
 * ThreadsPanel Component
 * Displays list of threads for the selected chat
 * Features: scrollable viewport, pagination
 */

import { Box, Text, useStdout } from 'ink';
import { useEffect, useMemo, useState } from 'react';
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
import { colors } from '../theme/colors.js';
import type { Thread } from '../types/index.js';
import { Panel } from './common/Panel.js';

interface ThreadsPanelProps {
  onLoadMore: (chatId: string) => Promise<void>;
}

export function ThreadsPanel({ onLoadMore }: ThreadsPanelProps) {
  const threads = useThreads();
  const currentThread = useCurrentThread();
  const currentChat = useCurrentChat();
  const { dispatch } = useAppState();
  const { isFocused } = useFocus('threads');
  const pagination = useThreadsPagination(currentChat?.id);
  const isLoading = useIsLoading('threads');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Use threads directly (sorted oldest to newest, most recent at bottom)
  const sortedThreads = threads;

  // Fixed viewport height: 10 threads
  // Panel header: 2 lines (title + margin)
  const { stdout } = useStdout();
  const headerFooterOverhead = 2; // header + margin only (no borders)
  const viewportHeight = 10;

  // Update selected index when current thread changes
  useEffect(() => {
    if (currentThread) {
      const index = sortedThreads.findIndex(
        t => t.topic_id === currentThread.topic_id
      );
      if (index !== -1) {
        setSelectedIndex(index);
      }
    } else if (sortedThreads.length > 0) {
      // Default to the most recent thread (last in list = bottom)
      setSelectedIndex(sortedThreads.length - 1);
    }
  }, [currentThread?.topic_id, sortedThreads.length]);

  // Auto-scroll to keep selected item visible
  useEffect(() => {
    if (selectedIndex < scrollOffset) {
      // Scroll up
      setScrollOffset(selectedIndex);
    } else if (selectedIndex >= scrollOffset + viewportHeight) {
      // Scroll down
      setScrollOffset(selectedIndex - viewportHeight + 1);
    }
  }, [selectedIndex, scrollOffset, viewportHeight]);

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
      'shift+g': () => setSelectedIndex(Math.max(0, sortedThreads.length - 1)),
      pagedown: () => handleLoadMore(),
      enter: () => handleSelect(),
      'ctrl+n': () => handleNewThread(),
      escape: () => dispatch({ type: 'FOCUS_CHANGED', payload: 'chats' }),
    },
    { enabled: isFocused }
  );

  const handleDown = () => {
    setSelectedIndex(Math.min(sortedThreads.length - 1, selectedIndex + 1));
  };

  const handleUp = () => {
    setSelectedIndex(Math.max(0, selectedIndex - 1));
  };

  const handleSelect = () => {
    const thread = sortedThreads[selectedIndex];
    if (thread) {
      dispatch({ type: 'THREAD_SELECTED', payload: thread });
    }
  };

  const handleNewThread = () => {
    if (currentChat) {
      dispatch({
        type: 'NEW_THREAD_STARTED',
        payload: { chatId: currentChat.id },
      });
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

    if (diffMins < 1) return '< 1 min';
    if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'}`;
    if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? '' : 's'}`;
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'}`;
    const diffWeeks = Math.floor(diffDays / 7);
    return `${diffWeeks} week${diffWeeks === 1 ? '' : 's'}`;
  };

  const formatThreadLine = (
    thread: Thread,
    index: number,
    availableWidth: number
  ) => {
    const isSelected = index === selectedIndex;

    // Determine colors
    let color: string = colors.text.primary;
    if (isFocused) {
      color = isSelected ? colors.accent.focusBright : colors.text.primary;
    } else {
      color = isSelected ? colors.text.secondary : colors.text.muted;
    }

    // Get first message as thread preview
    const firstMessage = thread.replies?.[0];
    const userName = firstMessage?.sender || 'Unknown';
    // Remove newlines and extra whitespace from message text to ensure single line
    const messageText = (firstMessage?.text || 'No messages')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const threadCreatedTime = firstMessage?.timestamp_usec;

    // Calculate reply info
    const replyCount = Math.max(0, thread.message_count - 1); // Subtract 1 for original message
    const lastReplyTime = thread.sort_time;
    const createdTimeAgo = formatTimeAgo(threadCreatedTime);
    const lastReplyTimeAgo = formatTimeAgo(lastReplyTime);

    // Format reply count to appear after timestamp
    const replyInfo =
      replyCount > 0
        ? ` [${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}, ${lastReplyTimeAgo}]`
        : '';

    // Add indicators
    const unreadIndicator = thread.isUnread ? '● ' : '  ';
    const selectionIndicator = isSelected ? '❯ ' : '  ';

    // Build the prefix: <name> (X minutes ago) [X replies]:
    const prefix = `${userName} (${createdTimeAgo})${replyInfo}: `;

    // Calculate available width for message text
    // Account for: selection indicator + unread + prefix + padding
    const prefixLength = selectionIndicator.length + unreadIndicator.length;
    const messageMaxLength = Math.max(
      10,
      availableWidth - prefixLength - prefix.length - 2
    );

    let truncatedMessage = messageText;
    if (messageText.length > messageMaxLength) {
      truncatedMessage = `${messageText.substring(0, messageMaxLength - 3)}...`;
    }

    return (
      <Box key={thread.topic_id} flexShrink={0}>
        <Text color={color} bold={isSelected && isFocused} wrap="truncate-end">
          {selectionIndicator}
          {unreadIndicator}
          <Text color={colors.accent.focusPrimary}>{userName}</Text>
          {` (${createdTimeAgo})`}
          {replyInfo && <Text dimColor>{replyInfo}</Text>}
          {`: ${truncatedMessage}`}
        </Text>
      </Box>
    );
  };

  // Calculate visible threads based on viewport
  const visibleThreads = sortedThreads.slice(
    scrollOffset,
    scrollOffset + viewportHeight
  );
  const hasMore = scrollOffset + viewportHeight < sortedThreads.length;
  const hasScrolledUp = scrollOffset > 0;

  // Determine if we should show threads panel content
  const showThreads = currentChat && currentChat.type === 'space';

  // Calculate explicit height: 10 threads + chrome (header + margin)
  const threadsPanelHeight = viewportHeight + headerFooterOverhead;

  // Calculate available width for threads panel
  // Chats panel takes 25%, threads panel takes remaining 75%
  const threadsPanelWidth = Math.floor(stdout.columns * 0.75);
  const contentWidth = threadsPanelWidth - 4; // Account for borders and padding

  return (
    <Panel
      level={2}
      isFocused={isFocused}
      height={threadsPanelHeight}
      flexGrow={0}
      flexShrink={0}
      paddingX={1}
      flexDirection="column"
    >
      <Box marginBottom={1}>
        <Text
          bold
          color={isFocused ? colors.accent.focusBright : colors.text.muted}
        >
          {currentChat?.name || 'Threads'}
        </Text>
        {isLoading && (
          <>
            <Text color={colors.text.muted}> </Text>
            <Text color={colors.semantic.warning}>Loading...</Text>
          </>
        )}
      </Box>

      <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
        {!showThreads ? (
          <Text color={colors.text.muted}>
            Direct messages don't have threads
          </Text>
        ) : sortedThreads.length === 0 ? (
          <Text color={colors.text.muted}>
            {isLoading ? 'Loading threads...' : 'No threads in this space'}
          </Text>
        ) : (
          <>
            {hasScrolledUp && (
              <Box>
                <Text color={colors.text.muted} dimColor>
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
                <Text color={colors.text.muted} dimColor>
                  ↓ {sortedThreads.length - (scrollOffset + viewportHeight)}{' '}
                  more
                </Text>
              </Box>
            )}
            {pagination.hasMore && !hasMore && isLoading && (
              <Box>
                <Text color={colors.accent.focusPrimary} dimColor>
                  Loading...
                </Text>
              </Box>
            )}
          </>
        )}
      </Box>
    </Panel>
  );
}
