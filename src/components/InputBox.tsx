/**
 * InputBox Component
 * Text input for sending messages
 */

import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';
import type { SendMessageResult } from '../../vendor/google-chat-api/index.js';
import {
  useAppState,
  useCurrentChat,
  useCurrentThread,
} from '../context/AppContext.js';
import { useFocus } from '../hooks/useFocus.js';
import type { GlycerinChatClient } from '../lib/chat-client.js';
import { logger } from '../lib/logger.js';
import { colors } from '../theme/colors.js';
import { ControlledInput } from './common/ControlledInput.js';
import { Panel } from './common/Panel.js';

interface InputBoxProps {
  client: GlycerinChatClient;
}

export function InputBox({ client }: InputBoxProps) {
  const currentChat = useCurrentChat();
  const currentThread = useCurrentThread();
  const { dispatch } = useAppState();
  const { isFocused } = useFocus('input');
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);

  // Handle hotkeys for scrolling messages and navigation
  const handleKeyPress = (input: string, key: any): boolean => {
    // Handle scroll keys
    if (key.ctrl) {
      if (input === 'i') {
        dispatch({ type: 'MESSAGES_SCROLL_DOWN' });
        return true; // Prevent default input processing
      }
      if (input === 'u') {
        dispatch({ type: 'MESSAGES_SCROLL_UP' });
        return true;
      }
      if (input === 'g') {
        dispatch({ type: 'MESSAGES_SCROLL_TO_BOTTOM' });
        return true;
      }
      if (input === 'l') {
        dispatch({ type: 'MESSAGES_SCROLL_TO_TOP' });
        return true;
      }
    }

    // Handle escape for navigation
    if (key.escape) {
      if (currentChat?.type === 'dm') {
        dispatch({ type: 'FOCUS_CHANGED', payload: 'chats' });
      } else {
        dispatch({ type: 'FOCUS_CHANGED', payload: 'threads' });
      }
      return true;
    }

    return false; // Allow default input processing
  };

  // Clear input text when focus leaves the input panel
  useEffect(() => {
    if (!isFocused) {
      setValue('');
    }
  }, [isFocused]);

  const handleSubmit = async (text: string) => {
    if (!text.trim() || !currentChat) return;

    setSending(true);
    try {
      let result: SendMessageResult;
      if (
        currentChat.type === 'dm' ||
        !currentThread ||
        currentThread.topic_id === 'dm'
      ) {
        // Send as new message to chat (for DMs or when no thread selected)
        result = await client.sendMessage(currentChat.id, text);
      } else if (currentThread.topic_id === 'new') {
        // Create a new thread by sending a message to the space
        result = await client.sendMessage(currentChat.id, text);
      } else {
        // Reply to thread in space
        result = await client.replyToThread(
          currentChat.id,
          currentThread.topic_id,
          text
        );
      }

      // Create optimistic message object to update UI immediately
      if (result?.success && result.message_id) {
        dispatch({
          type: 'MESSAGE_SENT',
          payload: {
            message_id: result.message_id,
            topic_id: result.topic_id || currentThread?.topic_id || 'dm',
            space_id: currentChat.id,
            text,
            timestamp: new Date().toISOString(),
            timestamp_usec: Date.now() * 1000,
          },
        });
      }

      setValue('');
    } catch (error) {
      logger.error('Failed to send message', error);
    } finally {
      setSending(false);
    }
  };

  // Determine the appropriate empty state message
  let emptyStateMessage = '';
  let canInput = true;

  if (!currentChat) {
    emptyStateMessage = 'Select a chat to send messages';
    canInput = false;
  } else if (currentChat.type === 'space' && !currentThread) {
    emptyStateMessage = 'Select a thread to send messages';
    canInput = false;
  }

  // Height: 2 lines for input area + 2 lines for chrome (header + margin)
  const inputBoxHeight = 4;

  return (
    <Panel
      level={4}
      isFocused={isFocused}
      height={inputBoxHeight}
      flexShrink={0}
      paddingX={1}
      flexDirection="column"
    >
      <Box marginBottom={1}>
        <Text
          bold
          color={isFocused ? colors.accent.focusBright : colors.text.muted}
        >
          {sending ? 'Sending...' : 'Message'}
        </Text>
      </Box>

      {!canInput ? (
        <Text color={colors.text.muted}>{emptyStateMessage}</Text>
      ) : isFocused ? (
        <ControlledInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
        />
      ) : (
        <Text color={colors.text.muted}>Press Enter to focus input</Text>
      )}
    </Panel>
  );
}
