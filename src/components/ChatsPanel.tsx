/**
 * ChatsPanel Component
 * Displays list of chats (spaces and DMs) in the left sidebar
 * Features: scrollable viewport, lazy loading
 */

import { Box, Text, useInput, useStdout } from 'ink';
import { useEffect, useState } from 'react';
import type { Space } from '../../vendor/google-chat-api/index.js';
import {
  useAppState,
  useChats,
  useCurrentChat,
} from '../context/AppContext.js';
import { useFocus } from '../hooks/useFocus.js';
import { useKeyHandler } from '../hooks/useKeyHandler.js';
import { getChatClient } from '../lib/chat-client.js';
import type { Chat } from '../types/index.js';

type PanelMode = 'normal' | 'search' | 'browse';

export function ChatsPanel() {
  const chats = useChats();
  const currentChat = useCurrentChat();
  const { dispatch } = useAppState();
  const { isFocused } = useFocus('chats');
  const { stdout } = useStdout();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [mode, setMode] = useState<PanelMode>('normal');
  const [searchQuery, setSearchQuery] = useState('');
  const [browseRooms, setBrowseRooms] = useState<Space[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [previewedRoom, setPreviewedRoom] = useState<Space | null>(null);

  // Filter chats based on search query
  const filteredChats =
    mode === 'search'
      ? chats.filter(chat =>
          chat.normalizedName.includes(searchQuery.toLowerCase())
        )
      : chats;

  // Use browse rooms or filtered chats depending on mode
  const displayItems = mode === 'browse' ? browseRooms : filteredChats;

  // Calculate viewport height based on terminal height
  //
  // Layout breakdown:
  // - Title bar: 3 lines (1 text + 2 borders)
  // - ChatsPanel chrome:
  //   - Top border: 1 line
  //   - Header "Rooms & DMs" or search input: 1 line
  //   - Header margin: 1 line
  //   - Footer help (when focused): 3 lines (2 borders + 1 text)
  //   - Bottom border: 1 line (shared with footer if focused, else separate)
  //
  // Total overhead: 3 (title) + 2 (borders) + 2 (header) + footer (3 if focused, 0 if not)
  const titleBarHeight = 3;
  const chatsPanelChrome = isFocused ? 7 : 4; // borders + header + footer
  const availableHeight = stdout.rows - titleBarHeight - chatsPanelChrome;
  const viewportHeight = Math.max(5, availableHeight);

  // Reset search/browse when mode changes
  useEffect(() => {
    setSelectedIndex(0);
    setScrollOffset(0);
    if (mode === 'search') {
      setSearchQuery('');
    } else if (mode === 'browse' && browseRooms.length === 0) {
      // Fetch all rooms for browsing
      setLoadingRooms(true);
      getChatClient()
        .getChats()
        .then(rooms => {
          setBrowseRooms(rooms);
          setLoadingRooms(false);
        })
        .catch(err => {
          console.error('Failed to load rooms:', err);
          setLoadingRooms(false);
        });
    }
  }, [mode]);

  // Update selected index when current chat changes (only in normal mode)
  useEffect(() => {
    if (mode === 'normal' && currentChat) {
      const index = chats.findIndex(c => c.id === currentChat.id);
      if (index !== -1) {
        setSelectedIndex(index);
      }
    }
  }, [currentChat, chats, mode]);

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

  // Handle search input
  useInput((input, key) => {
    if (!isFocused || mode !== 'search') return;

    if (key.return) {
      // Exit search mode on Enter
      setMode('normal');
      setSearchQuery('');
    } else if (key.escape) {
      // Exit search mode on Escape
      setMode('normal');
      setSearchQuery('');
    } else if (key.backspace || key.delete) {
      setSearchQuery(prev => prev.slice(0, -1));
    } else if (!key.ctrl && !key.meta && input) {
      setSearchQuery(prev => prev + input);
    }
  });

  // Keyboard handlers for navigation (normal and browse modes)
  useKeyHandler(
    {
      j: () => handleDown(),
      down: () => handleDown(),
      k: () => handleUp(),
      up: () => handleUp(),
      g: () => setSelectedIndex(0),
      'shift+g': () => setSelectedIndex(Math.max(0, displayItems.length - 1)),
      enter: () => handleSelect(),
      'ctrl+f': () => {
        if (mode === 'normal') {
          setMode('search');
        }
      },
      'ctrl+b': () => {
        if (mode === 'normal') {
          setMode('browse');
        } else if (mode === 'browse') {
          // Exit browse mode
          setMode('normal');
          setPreviewedRoom(null);
        }
      },
      'ctrl+j': () => {
        if (mode === 'browse' && !previewedRoom) {
          handleJoinRoom();
        }
      },
      escape: () => {
        if (mode === 'browse' || mode === 'search') {
          setMode('normal');
          setPreviewedRoom(null);
        }
      },
    },
    { enabled: isFocused && mode !== 'search' }
  );

  const handleDown = () => {
    setSelectedIndex(Math.min(displayItems.length - 1, selectedIndex + 1));
  };

  const handleUp = () => {
    setSelectedIndex(Math.max(0, selectedIndex - 1));
  };

  const handleSelect = () => {
    if (mode === 'browse') {
      const room = browseRooms[selectedIndex];
      if (room) {
        if (previewedRoom?.id === room.id) {
          // Join the room if already previewing
          handleJoinRoom();
        } else {
          // Preview the room
          setPreviewedRoom(room);
          // Load threads for preview
          dispatch({
            type: 'CHAT_SELECTED',
            payload: {
              ...room,
              isUnread: false,
              normalizedName: room.name?.toLowerCase() || '',
            } as Chat,
          });
        }
      }
    } else {
      const chat = displayItems[selectedIndex] as Chat;
      if (chat) {
        dispatch({ type: 'CHAT_SELECTED', payload: chat });
        if (mode === 'search') {
          setMode('normal');
          setSearchQuery('');
        }
      }
    }
  };

  const handleJoinRoom = () => {
    const room = previewedRoom || browseRooms[selectedIndex];
    if (!room) return;

    // Add to chats list by selecting it
    const newChat: Chat = {
      ...room,
      isUnread: false,
      normalizedName: room.name?.toLowerCase() || '',
    };
    dispatch({ type: 'CHAT_SELECTED', payload: newChat });
    // Exit browse mode
    setMode('normal');
    setPreviewedRoom(null);
  };

  const formatChatLine = (item: Chat | Space, index: number) => {
    const isSelected = index === selectedIndex;
    const chat = item as Chat;
    const _isCurrent = currentChat?.id === chat.id;

    // Different color scheme for browse mode
    const isBrowse = mode === 'browse';
    const isPreviewed = isBrowse && previewedRoom?.id === chat.id;

    // Determine colors
    let color = 'white';
    if (isBrowse) {
      if (isFocused) {
        color = isPreviewed ? 'yellow' : isSelected ? 'magenta' : 'white';
      } else {
        color = 'gray';
      }
    } else {
      if (isFocused) {
        color = isSelected ? 'cyan' : 'white';
      } else {
        color = isSelected ? 'gray' : 'gray';
      }
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
    const previewIndicator = isPreviewed ? '👁 ' : '';

    return (
      <Box key={chat.id}>
        <Text color={color} bold={isSelected && isFocused}>
          {selectionIndicator}
          {!isBrowse && unreadIndicator}
          {!isBrowse && typeIndicator}
          {previewIndicator}
          {displayName}
        </Text>
      </Box>
    );
  };

  // Calculate visible items based on viewport
  const visibleItems = displayItems.slice(
    scrollOffset,
    scrollOffset + viewportHeight
  );
  const hasMore = scrollOffset + viewportHeight < displayItems.length;
  const hasScrolledUp = scrollOffset > 0;

  // Determine border color based on mode
  let borderColor = isFocused ? 'cyan' : 'gray';
  if (mode === 'browse' && isFocused) {
    borderColor = 'magenta';
  }

  // Determine header text and color
  let headerText = 'Rooms & DMs';
  let headerColor = isFocused ? 'cyan' : 'gray';
  if (mode === 'browse') {
    headerText = 'Browse Rooms';
    headerColor = isFocused ? 'magenta' : 'gray';
  }

  return (
    <Box
      flexDirection="column"
      width="25%"
      flexGrow={1}
      minHeight={0}
      borderStyle="single"
      borderColor={borderColor}
      paddingX={1}
    >
      {mode === 'search' ? (
        <Box marginBottom={1}>
          <Text bold color={isFocused ? 'cyan' : 'gray'}>
            Search: {searchQuery}
          </Text>
        </Box>
      ) : (
        <Box marginBottom={1}>
          <Text bold color={headerColor}>
            {headerText}
          </Text>
        </Box>
      )}

      <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
        {loadingRooms ? (
          <Text color="gray">Loading rooms...</Text>
        ) : displayItems.length === 0 ? (
          <Text color="gray">
            {mode === 'search' ? 'No matches' : 'No chats available'}
          </Text>
        ) : (
          <>
            {hasScrolledUp && (
              <Box>
                <Text color="gray" dimColor>
                  ↑ {scrollOffset} more above
                </Text>
              </Box>
            )}
            {visibleItems.map((item, viewportIndex) => {
              const actualIndex = scrollOffset + viewportIndex;
              return formatChatLine(item, actualIndex);
            })}
            {hasMore && (
              <Box>
                <Text color="gray" dimColor>
                  ↓ {displayItems.length - (scrollOffset + viewportHeight)} more
                  below
                </Text>
              </Box>
            )}
          </>
        )}
      </Box>

      {isFocused && (
        <Box borderStyle="single" borderColor="gray" marginTop={1} paddingX={1}>
          {mode === 'browse' ? (
            <Text dimColor>⏎:preview/join ^J:join ^B:exit ESC:exit</Text>
          ) : mode === 'search' ? (
            <Text dimColor>type to search ⏎/ESC:exit</Text>
          ) : (
            <Text dimColor>↑↓:nav ⏎:select ^F:search ^B:browse</Text>
          )}
        </Box>
      )}
    </Box>
  );
}
