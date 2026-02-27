/**
 * ChatsPanel Component
 * Displays list of chats (spaces and DMs) in the left sidebar
 * Features: scrollable viewport, lazy loading
 */

import { Box, Text, useInput, useStdout } from 'ink';
import { useEffect, useMemo, useState } from 'react';
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
  const { state, dispatch } = useAppState();
  const { isFocused } = useFocus('chats');
  const { stdout } = useStdout();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [mode, setMode] = useState<PanelMode>('normal');
  const [searchQuery, setSearchQuery] = useState('');
  const [browseRooms, setBrowseRooms] = useState<Space[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [previewedRoom, setPreviewedRoom] = useState<Space | null>(null);

  const displayMode = state.chatDisplayMode;
  const showOnlyUnread = state.showOnlyUnread;
  const showMuted = state.showMuted;

  // Filter chats based on search query
  const searchFilteredChats =
    mode === 'search'
      ? chats.filter(chat =>
          chat.normalizedName.includes(searchQuery.toLowerCase())
        )
      : chats;

  // Filter browse rooms based on search query
  const filteredBrowseRooms = browseRooms.filter(
    room =>
      room.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      room.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Apply display mode filtering
  let displayChats = searchFilteredChats;

  if (mode === 'normal') {
    // Filter out muted chats if showMuted is false
    if (!showMuted) {
      displayChats = displayChats.filter(chat => !chat.isMuted);
    }

    if (displayMode === 'mentions') {
      // Show only chats with mentions
      displayChats = displayChats.filter(chat => chat.hasMention);
    }

    // Apply unread filter if enabled (for home and mentions modes)
    if (
      (displayMode === 'home' || displayMode === 'mentions') &&
      showOnlyUnread
    ) {
      displayChats = displayChats.filter(chat => chat.isUnread);
    }
  }

  // Group chats by type for 'list' mode
  type DisplayItem =
    | { type: 'section'; title: string }
    | { type: 'chat'; chat: Chat | Space };

  const displayItems = useMemo<DisplayItem[]>(() => {
    const items: DisplayItem[] = [];

    if (mode === 'browse') {
      // Browse mode: show filtered rooms as chats
      items.push(
        ...filteredBrowseRooms.map(room => ({
          type: 'chat' as const,
          chat: room,
        }))
      );
    } else if (mode === 'normal' && displayMode === 'list') {
      // List mode: group by sections
      const dms = displayChats.filter(chat => chat.type === 'dm');
      const spaces = displayChats.filter(chat => chat.type === 'space');

      if (dms.length > 0) {
        items.push({ type: 'section', title: 'Direct Messages' });
        items.push(...dms.map(chat => ({ type: 'chat' as const, chat })));
      }

      if (spaces.length > 0) {
        items.push({ type: 'section', title: 'Spaces' });
        items.push(...spaces.map(chat => ({ type: 'chat' as const, chat })));
      }

      // Apps section (placeholder for now)
      items.push({ type: 'section', title: 'Apps' });
    } else {
      // Home or Mentions mode: flat list
      items.push(
        ...displayChats.map(chat => ({ type: 'chat' as const, chat }))
      );
    }

    return items;
  }, [mode, displayMode, displayChats, filteredBrowseRooms]);

  // Calculate viewport height based on terminal height
  //
  // Layout breakdown:
  // - Title bar: 3 lines (1 text + 2 borders)
  // - ChatsPanel chrome:
  //   - Top border: 1 line
  //   - Header input box: 1 line
  //   - Header margin: 1 line
  //   - Bottom border: 1 line
  //
  // Total overhead: 3 (title) + 2 (borders) + 2 (header)
  const titleBarHeight = 3;
  const chatsPanelChrome = 4; // borders + header
  const availableHeight = stdout.rows - titleBarHeight - chatsPanelChrome;
  const viewportHeight = Math.max(5, availableHeight);

  // Reset search/browse when mode changes
  useEffect(() => {
    setSelectedIndex(0);
    setScrollOffset(0);
    if (mode === 'search') {
      setSearchQuery('');
    } else if (mode === 'browse') {
      // Always show loading state and fetch rooms when entering browse mode
      setSearchQuery('');
      setLoadingRooms(true);
      // Fetch all available rooms (not just ones we're a member of)
      getChatClient()
        .findSpaces('') // Empty query returns all spaces
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

  // Listen for global chat search trigger
  useEffect(() => {
    if (state.chatSearchTrigger > 0 && mode !== 'search') {
      setMode('search');
    }
  }, [state.chatSearchTrigger, mode]);

  // Update selected index when current chat changes (only in normal mode)
  useEffect(() => {
    if (mode === 'normal' && currentChat) {
      const index = displayItems.findIndex(
        item =>
          item.type === 'chat' && (item.chat as Chat).id === currentChat.id
      );
      if (index !== -1) {
        setSelectedIndex(index);
      }
    }
  }, [currentChat, displayItems, mode]);

  // Ensure selected index is valid (not a section header)
  useEffect(() => {
    if (
      displayItems.length > 0 &&
      displayItems[selectedIndex]?.type === 'section'
    ) {
      // Find next valid chat item
      let nextIndex = selectedIndex + 1;
      while (
        nextIndex < displayItems.length &&
        displayItems[nextIndex].type === 'section'
      ) {
        nextIndex++;
      }
      if (nextIndex < displayItems.length) {
        setSelectedIndex(nextIndex);
      } else {
        // Try going backwards
        let prevIndex = selectedIndex - 1;
        while (prevIndex >= 0 && displayItems[prevIndex].type === 'section') {
          prevIndex--;
        }
        if (prevIndex >= 0) {
          setSelectedIndex(prevIndex);
        }
      }
    }
  }, [displayItems, selectedIndex]);

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

  // Handle search/browse input
  useInput((input, key) => {
    if (!isFocused || (mode !== 'search' && mode !== 'browse')) return;

    if (key.return) {
      // In both search and browse mode, Enter selects the highlighted item
      handleSelect();
    } else if (key.escape) {
      // Exit search/browse mode on Escape
      setMode('normal');
      setSearchQuery('');
      setPreviewedRoom(null);
    } else if (key.ctrl && input === 'l' && mode === 'search') {
      // Handle leave space in search mode only (not browse mode)
      handleLeaveSpace();
    } else if (key.backspace || key.delete) {
      setSearchQuery(prev => prev.slice(0, -1));
    } else if (!key.ctrl && !key.meta && input) {
      setSearchQuery(prev => prev + input);
    }
  });

  // Keyboard handlers for navigation and shortcuts
  useKeyHandler(
    {
      j: () => handleDown(),
      down: () => handleDown(),
      k: () => handleUp(),
      up: () => handleUp(),
      g: () => {
        // Jump to first chat item (skip sections)
        let firstIndex = 0;
        while (
          firstIndex < displayItems.length &&
          displayItems[firstIndex].type === 'section'
        ) {
          firstIndex++;
        }
        if (firstIndex < displayItems.length) {
          setSelectedIndex(firstIndex);
        }
      },
      'shift+g': () => {
        // Jump to last chat item (skip sections)
        let lastIndex = displayItems.length - 1;
        while (lastIndex >= 0 && displayItems[lastIndex].type === 'section') {
          lastIndex--;
        }
        if (lastIndex >= 0) {
          setSelectedIndex(lastIndex);
        }
      },
      enter: () => handleSelect(),
      'ctrl+n': () => handleNewThread(),
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
        if (mode === 'browse') {
          handleJoinRoom();
        }
      },
      'ctrl+u': () => {
        if (
          mode === 'normal' &&
          (displayMode === 'home' || displayMode === 'mentions')
        ) {
          dispatch({ type: 'SHOW_ONLY_UNREAD_TOGGLED' });
        }
      },
      'ctrl+m': () => {
        if (mode === 'normal') {
          dispatch({ type: 'SHOW_MUTED_TOGGLED' });
        }
      },
      'ctrl+shift+m': () => {
        if (mode === 'normal') {
          const item = displayItems[selectedIndex];
          if (item && item.type === 'chat') {
            const chat = item.chat as Chat;
            dispatch({
              type: 'CHAT_MUTE_TOGGLED',
              payload: { chatId: chat.id },
            });
          }
        }
      },
      '1': () => {
        if (mode === 'normal') {
          dispatch({ type: 'CHAT_DISPLAY_MODE_CHANGED', payload: 'home' });
          setSelectedIndex(0);
        }
      },
      '2': () => {
        if (mode === 'normal') {
          dispatch({ type: 'CHAT_DISPLAY_MODE_CHANGED', payload: 'mentions' });
          setSelectedIndex(0);
        }
      },
      '3': () => {
        if (mode === 'normal') {
          dispatch({ type: 'CHAT_DISPLAY_MODE_CHANGED', payload: 'list' });
          setSelectedIndex(0);
        }
      },
      'ctrl+l': () => {
        if (mode === 'normal') {
          handleLeaveSpace();
        }
      },
      escape: () => {
        if (mode === 'browse' || mode === 'search') {
          setMode('normal');
          setSearchQuery('');
          setPreviewedRoom(null);
        }
      },
    },
    { enabled: isFocused && mode !== 'search' }
  );

  const handleDown = () => {
    let nextIndex = selectedIndex + 1;

    // Skip section headers
    while (
      nextIndex < displayItems.length &&
      displayItems[nextIndex].type === 'section'
    ) {
      nextIndex++;
    }

    if (nextIndex < displayItems.length) {
      setSelectedIndex(nextIndex);
    }
  };

  const handleUp = () => {
    let prevIndex = selectedIndex - 1;

    // Skip section headers
    while (prevIndex >= 0 && displayItems[prevIndex].type === 'section') {
      prevIndex--;
    }

    if (prevIndex >= 0) {
      setSelectedIndex(prevIndex);
    }
  };

  const handleNewThread = () => {
    const item = displayItems[selectedIndex];
    if (!item || item.type !== 'chat') return;

    const chat = item.chat as Chat;

    if (chat.type === 'dm') {
      // For DMs, behave like normal selection (open messages and focus input)
      dispatch({ type: 'CHAT_SELECTED', payload: chat });
    } else {
      // For spaces, start a new thread
      dispatch({ type: 'NEW_THREAD_STARTED', payload: { chatId: chat.id } });
    }
  };

  const handleSelect = () => {
    const item = displayItems[selectedIndex];
    if (!item) return;

    // Ignore section headers
    if (item.type === 'section') return;

    const chat = item.chat as Chat;

    if (mode === 'browse') {
      if (previewedRoom?.id === chat.id) {
        // Second Enter: Join the room
        handleJoinRoom();
      } else {
        // First Enter: Preview the room
        setPreviewedRoom(chat as Space);
        // Load threads for preview
        dispatch({
          type: 'CHAT_SELECTED',
          payload: {
            ...chat,
            isUnread: false,
            normalizedName: chat.name?.toLowerCase() || '',
          } as Chat,
        });
      }
    } else {
      dispatch({ type: 'CHAT_SELECTED', payload: chat });
      if (mode === 'search') {
        setMode('normal');
        setSearchQuery('');
      }
    }
  };

  const handleJoinRoom = () => {
    const room = previewedRoom || filteredBrowseRooms[selectedIndex];
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
    setSearchQuery('');
    setPreviewedRoom(null);
  };

  const handleLeaveSpace = () => {
    const item = displayItems[selectedIndex];
    if (!item || item.type !== 'chat') return;

    const chat = item.chat as Chat;

    // Only allow leaving spaces, not DMs
    if (chat.type !== 'space') {
      return;
    }

    // Show confirmation modal
    dispatch({
      type: 'CONFIRMATION_OPENED',
      payload: {
        isOpen: true,
        title: 'Leave Space',
        message: `Are you sure you want to leave "${chat.name || chat.id}"?`,
        onConfirm: async () => {
          try {
            await getChatClient().leaveSpace(chat.id);
            dispatch({ type: 'CHAT_LEFT', payload: { chatId: chat.id } });
          } catch (error) {
            console.error('Failed to leave space:', error);
          }
        },
        onCancel: () => {
          // Do nothing, just close the modal
        },
      },
    });
  };

  const formatDisplayItem = (item: DisplayItem, index: number) => {
    const isSelected = index === selectedIndex;

    // Handle section headers
    if (item.type === 'section') {
      return (
        <Box key={`section-${item.title}`}>
          <Text color="blue" bold>
            {item.title}
          </Text>
        </Box>
      );
    }

    // Handle chat items
    const chat = item.chat as Chat;

    // Different color scheme for browse mode
    const isBrowse = mode === 'browse';
    const isPreviewed = isBrowse && previewedRoom?.id === chat.id;

    // Determine colors - browse mode uses magenta, normal/search uses cyan
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
    const mentionIndicator = chat.hasMention ? '@' : '';
    const mutedIndicator = chat.isMuted ? '🔇 ' : '';

    return (
      <Box key={chat.id}>
        <Text
          color={color}
          bold={isSelected && isFocused}
          dimColor={chat.isMuted}
        >
          {selectionIndicator}
          {!isBrowse && unreadIndicator}
          {!isBrowse && typeIndicator}
          {previewIndicator}
          {mentionIndicator && `${mentionIndicator} `}
          {mutedIndicator}
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

  // Determine placeholder text and color for input box
  let placeholderText = 'Rooms & DMs';
  let inputColor = isFocused ? 'cyan' : 'gray';

  if (mode === 'browse') {
    placeholderText = 'Browse Rooms';
    inputColor = isFocused ? 'magenta' : 'gray';
  } else if (mode === 'search') {
    placeholderText = 'Search';
  } else if (mode === 'normal') {
    // Update text based on display mode
    if (displayMode === 'home') {
      placeholderText = showOnlyUnread ? 'Home (Unread)' : 'Home (All)';
    } else if (displayMode === 'mentions') {
      placeholderText = showOnlyUnread ? 'Mentions (Unread)' : 'Mentions (All)';
    } else if (displayMode === 'list') {
      placeholderText = 'List';
    }

    // Add muted indicator if showing muted items
    if (showMuted) {
      placeholderText += ' +Muted';
    }
  }

  // Display text in input box
  const displayText =
    mode === 'search' || mode === 'browse' ? searchQuery : placeholderText;

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
      <Box marginBottom={1}>
        <Text bold color={inputColor}>
          {displayText}
        </Text>
      </Box>

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
              return formatDisplayItem(item, actualIndex);
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
    </Box>
  );
}
