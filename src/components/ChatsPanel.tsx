/**
 * ChatsPanel Component
 * Displays list of chats (spaces and DMs) in the left sidebar
 * Features: scrollable viewport, lazy loading
 */

import { Box, Text, useInput, useStdout } from 'ink';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Space } from '../../vendor/google-chat-api/index.js';
import {
  useAppState,
  useChats,
  useCurrentChat,
} from '../context/AppContext.js';
import { useFocus } from '../hooks/useFocus.js';
import { useKeyHandler } from '../hooks/useKeyHandler.js';
import { getChatClient } from '../lib/chat-client.js';
import { colors } from '../theme/colors.js';
import type { Chat } from '../types/index.js';
import { Panel } from './common/Panel.js';

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
  const lastSyncedChatId = useRef<string | null>(null);

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

  // Filter out muted chats if showMuted is false (applies to all modes)
  if (!showMuted) {
    displayChats = displayChats.filter(chat => !chat.isMuted);
  }

  if (mode === 'normal') {
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
  // - Title bar: 3 lines (1 text + 2 padding)
  // - ChatsPanel chrome:
  //   - Header: 1 line
  //   - Header margin: 1 line
  //
  // Total overhead: 3 (title) + 2 (header)
  const titleBarHeight = 3;
  const chatsPanelChrome = 2; // header + margin only (no borders)
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
  // Only sync when the chat ID actually changes, not when displayItems changes
  useEffect(() => {
    if (mode === 'normal' && currentChat) {
      // Only sync if the currentChat has actually changed
      if (lastSyncedChatId.current !== currentChat.id) {
        const index = displayItems.findIndex(
          item =>
            item.type === 'chat' && (item.chat as Chat).id === currentChat.id
        );
        if (index !== -1) {
          setSelectedIndex(index);
          lastSyncedChatId.current = currentChat.id;
        }
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
      dispatch({ type: 'CHAT_SEARCH_CLOSED' });
    } else if (key.upArrow) {
      // Navigate up in filtered list
      handleUp();
    } else if (key.downArrow) {
      // Navigate down in filtered list
      handleDown();
    } else if (key.ctrl && input === 'l' && mode === 'search') {
      // Handle leave space in search mode (requires ctrl modifier since 'l' is used for typing)
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
      n: () => handleNewThread(),
      b: () => {
        if (mode === 'normal') {
          setMode('browse');
        } else if (mode === 'browse') {
          // Exit browse mode
          setMode('normal');
          setPreviewedRoom(null);
        }
      },
      o: () => {
        if (mode === 'browse') {
          handleJoinRoom();
        }
      },
      u: () => {
        if (
          mode === 'normal' &&
          (displayMode === 'home' || displayMode === 'mentions')
        ) {
          dispatch({ type: 'SHOW_ONLY_UNREAD_TOGGLED' });
        }
      },
      m: () => {
        if (mode === 'normal') {
          dispatch({ type: 'SHOW_MUTED_TOGGLED' });
        }
      },
      'shift+m': () => {
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
      l: () => {
        if (mode === 'normal') {
          handleLeaveSpace();
        }
      },
      escape: () => {
        if (mode === 'browse' || mode === 'search') {
          setMode('normal');
          setSearchQuery('');
          setPreviewedRoom(null);
          dispatch({ type: 'CHAT_SEARCH_CLOSED' });
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
      // Exit search mode first, then dispatch CHAT_SELECTED
      // This ensures CHAT_SELECTED's focus change (to 'threads' for spaces) takes effect
      if (mode === 'search') {
        setMode('normal');
        setSearchQuery('');
        dispatch({ type: 'CHAT_SEARCH_CLOSED' });
      }
      dispatch({ type: 'CHAT_SELECTED', payload: chat });
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
          <Text color={colors.accent.focusPrimary} bold>
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

    // Determine colors - browse mode uses magenta, normal/search uses blue
    let color: string = colors.text.primary;
    if (isBrowse) {
      if (isFocused) {
        color = isPreviewed
          ? colors.semantic.warning
          : isSelected
            ? colors.semantic.magenta
            : colors.text.primary;
      } else {
        color = colors.text.muted;
      }
    } else {
      if (isFocused) {
        color = isSelected ? colors.accent.focusBright : colors.text.primary;
      } else {
        color = isSelected ? colors.text.secondary : colors.text.muted;
      }
    }

    // Calculate available width for display name
    // Panel is 25% of terminal width, minus padding (2), border (2), and indicators
    const panelWidth = Math.floor(stdout.columns * 0.25);
    const selectionIndicator = isSelected ? '❯ ' : '  ';
    const unreadIndicator = chat.isUnread ? '● ' : '  ';
    const mentionIndicator = chat.hasMention ? '@' : '';

    // Calculate space used by indicators (excluding browse mode unread indicator)
    const indicatorsWidth =
      selectionIndicator.length +
      (!isBrowse ? unreadIndicator.length : 0) +
      (mentionIndicator ? mentionIndicator.length + 1 : 0); // +1 for space after @

    // Available width for name: panel width - padding - border - indicators
    const availableWidth = panelWidth - 4 - indicatorsWidth;

    // Build display name with dynamic truncation
    let displayName = chat.name || chat.id;
    if (displayName.length > availableWidth) {
      displayName = `${displayName.substring(0, availableWidth - 3)}...`;
    }

    return (
      <Box key={chat.id}>
        <Text
          color={color}
          bold={isSelected && isFocused}
          dimColor={chat.isMuted}
        >
          {selectionIndicator}
          {!isBrowse && unreadIndicator}
          {mentionIndicator && `${mentionIndicator} `}
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
  let borderColor: string | undefined;
  if (mode === 'browse' && isFocused) {
    borderColor = colors.semantic.magenta;
  }

  // Determine placeholder text and color for input box
  let placeholderText = 'Rooms & DMs';
  let inputColor: string = isFocused
    ? colors.accent.focusBright
    : colors.text.muted;

  if (mode === 'browse') {
    placeholderText = 'Browse Rooms';
    inputColor = isFocused ? colors.semantic.magenta : colors.text.muted;
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
    <Panel
      level={1}
      isFocused={isFocused}
      borderColor={borderColor}
      backgroundColor="gray"
      width="25%"
      flexGrow={1}
      paddingX={1}
      flexDirection="column"
    >
      <ChatsPanelContent
        displayText={displayText}
        inputColor={inputColor}
        loadingRooms={loadingRooms}
        displayItems={displayItems}
        hasScrolledUp={hasScrolledUp}
        scrollOffset={scrollOffset}
        visibleItems={visibleItems}
        formatDisplayItem={formatDisplayItem}
        hasMore={hasMore}
        viewportHeight={viewportHeight}
        mode={mode}
      />
    </Panel>
  );
}

// Content component
function ChatsPanelContent({
  displayText,
  inputColor,
  loadingRooms,
  displayItems,
  hasScrolledUp,
  scrollOffset,
  visibleItems,
  formatDisplayItem,
  hasMore,
  viewportHeight,
  mode,
}: {
  displayText: string;
  inputColor: string;
  loadingRooms: boolean;
  displayItems: any[];
  hasScrolledUp: boolean;
  scrollOffset: number;
  visibleItems: any[];
  formatDisplayItem: (item: any, index: number) => JSX.Element;
  hasMore: boolean;
  viewportHeight: number;
  mode: string;
}) {
  return (
    <>
      <Box marginBottom={1}>
        <Text bold color={inputColor}>
          {displayText}
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
        {loadingRooms ? (
          <Text color={colors.text.muted}>Loading rooms...</Text>
        ) : displayItems.length === 0 ? (
          <Text color={colors.text.muted}>
            {mode === 'search' ? 'No matches' : 'No chats available'}
          </Text>
        ) : (
          <>
            {hasScrolledUp && (
              <Box>
                <Text color={colors.text.muted} dimColor>
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
                <Text color={colors.text.muted} dimColor>
                  ↓ {displayItems.length - (scrollOffset + viewportHeight)} more
                  below
                </Text>
              </Box>
            )}
          </>
        )}
      </Box>
    </>
  );
}
