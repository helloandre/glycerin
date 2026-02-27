/**
 * ChatsPanel Component
 * Displays list of chats (spaces and DMs) in the left sidebar
 * Features: scrollable viewport, lazy loading
 */

import { Box, Text, useStdout } from 'ink';
import { useEffect, useState } from 'react';
import {
  useAppState,
  useChats,
  useCurrentChat,
} from '../context/AppContext.js';
import { useFocus } from '../hooks/useFocus.js';
import { useKeyHandler } from '../hooks/useKeyHandler.js';
import type { Chat } from '../types/index.js';

export function ChatsPanel() {
  const chats = useChats();
  const currentChat = useCurrentChat();
  const { dispatch } = useAppState();
  const { isFocused } = useFocus('chats');
  const { stdout } = useStdout();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Calculate viewport height based on terminal height
  //
  // Layout breakdown:
  // - Title bar: 3 lines (1 text + 2 borders)
  // - ChatsPanel chrome:
  //   - Top border: 1 line
  //   - Header "Rooms & DMs": 1 line
  //   - Header margin: 1 line
  //   - Footer help (when focused): 3 lines (2 borders + 1 text)
  //   - Bottom border: 1 line (shared with footer if focused, else separate)
  //
  // Total overhead when focused: 3 (title) + 1 (border) + 2 (header) + 3 (footer) + 1 (border) = 10 lines
  // Total overhead when unfocused: 3 (title) + 1 (border) + 2 (header) + 1 (border) = 7 lines
  //
  // Use conservative estimate (focused state): stdout.rows - 10
  const panelOverhead = isFocused ? 10 : 7;
  const viewportHeight = Math.max(5, stdout.rows - panelOverhead);

  // Update selected index when current chat changes
  useEffect(() => {
    if (currentChat) {
      const index = chats.findIndex(c => c.id === currentChat.id);
      if (index !== -1) {
        setSelectedIndex(index);
      }
    }
  }, [currentChat, chats]);

  // Auto-scroll to keep selected item visible
  useEffect(() => {
    if (selectedIndex < scrollOffset) {
      // Scroll up
      setScrollOffset(selectedIndex);
    } else if (selectedIndex >= scrollOffset + viewportHeight) {
      // Scroll down
      setScrollOffset(selectedIndex - viewportHeight + 1);
    }
  }, [selectedIndex, viewportHeight, scrollOffset]);

  // Keyboard handlers
  useKeyHandler(
    {
      j: () => handleDown(),
      down: () => handleDown(),
      k: () => handleUp(),
      up: () => handleUp(),
      g: () => setSelectedIndex(0),
      'shift+g': () => setSelectedIndex(Math.max(0, chats.length - 1)),
      enter: () => handleSelect(),
    },
    { enabled: isFocused }
  );

  const handleDown = () => {
    setSelectedIndex(Math.min(chats.length - 1, selectedIndex + 1));
  };

  const handleUp = () => {
    setSelectedIndex(Math.max(0, selectedIndex - 1));
  };

  const handleSelect = () => {
    const chat = chats[selectedIndex];
    if (chat) {
      dispatch({ type: 'CHAT_SELECTED', payload: chat });
    }
  };

  const formatChatLine = (chat: Chat, index: number) => {
    const isSelected = index === selectedIndex;
    const _isCurrent = currentChat?.id === chat.id;

    // Determine colors
    let color = 'white';
    if (isFocused) {
      color = isSelected ? 'cyan' : 'white';
    } else {
      color = isSelected ? 'gray' : 'gray';
    }

    // Build display name
    let displayName = chat.name || chat.id;
    if (displayName.length > 20) {
      displayName = `${displayName.substring(0, 17)}...`;
    }

    // Add indicators
    const unreadIndicator = chat.isUnread ? '● ' : '  ';
    const typeIndicator = chat.type === 'dm' ? '👤 ' : '# ';
    const selectionIndicator = isSelected ? '❯ ' : '  ';

    return (
      <Box key={chat.id}>
        <Text color={color} bold={isSelected && isFocused}>
          {selectionIndicator}
          {unreadIndicator}
          {typeIndicator}
          {displayName}
        </Text>
      </Box>
    );
  };

  // Calculate visible chats based on viewport
  const visibleChats = chats.slice(scrollOffset, scrollOffset + viewportHeight);
  const hasMore = scrollOffset + viewportHeight < chats.length;
  const hasScrolledUp = scrollOffset > 0;

  return (
    <Box
      flexDirection="column"
      width="25%"
      height="100%"
      borderStyle="single"
      borderColor={isFocused ? 'cyan' : 'gray'}
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text bold color={isFocused ? 'cyan' : 'gray'}>
          Rooms & DMs {chats.length > 0 && `(${chats.length})`}
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {chats.length === 0 ? (
          <Text color="gray">No chats available</Text>
        ) : (
          <>
            {hasScrolledUp && (
              <Box>
                <Text color="gray" dimColor>
                  ↑ {scrollOffset} more above
                </Text>
              </Box>
            )}
            {visibleChats.map((chat, viewportIndex) => {
              const actualIndex = scrollOffset + viewportIndex;
              return formatChatLine(chat, actualIndex);
            })}
            {hasMore && (
              <Box>
                <Text color="gray" dimColor>
                  ↓ {chats.length - (scrollOffset + viewportHeight)} more below
                </Text>
              </Box>
            )}
          </>
        )}
      </Box>

      {isFocused && (
        <Box borderStyle="single" borderColor="gray" marginTop={1} paddingX={1}>
          <Text dimColor>↑↓:nav j/k:vim ⏎:select g/G:top/bottom</Text>
        </Box>
      )}
    </Box>
  );
}
