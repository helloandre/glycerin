/**
 * InputBox Component
 * Text input for sending messages
 */

import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useState } from 'react';
import {
  useAppState,
  useCurrentChat,
  useCurrentThread,
} from '../context/AppContext.js';
import { useFocus } from '../hooks/useFocus.js';
import type { GlycerinChatClient } from '../lib/chat-client.js';
import { logger } from '../lib/logger.js';

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

  // Handle escape to go to messages (so user can scroll)
  useInput(
    (input, key) => {
      if (key.escape && isFocused) {
        dispatch({ type: 'FOCUS_CHANGED', payload: 'messages' });
      }
    },
    { isActive: isFocused }
  );

  const handleSubmit = async (text: string) => {
    if (!text.trim() || !currentChat) return;

    setSending(true);
    try {
      if (
        currentChat.type === 'dm' ||
        !currentThread ||
        currentThread.topic_id === 'dm'
      ) {
        // Send as new message to chat (for DMs or when no thread selected)
        await client.sendMessage(currentChat.id, text);
      } else {
        // Reply to thread in space
        await client.replyToThread(
          currentChat.id,
          currentThread.topic_id,
          text
        );
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

  return (
    <Box
      flexDirection="column"
      width="75%"
      flexShrink={0}
      height={4}
      borderStyle="single"
      borderColor={isFocused ? 'cyan' : 'gray'}
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text bold color={isFocused ? 'cyan' : 'gray'}>
          {sending ? 'Sending...' : 'Message'}
        </Text>
      </Box>

      {!canInput ? (
        <Text color="gray">{emptyStateMessage}</Text>
      ) : isFocused ? (
        <>
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={handleSubmit}
            placeholder="Type a message..."
          />
          <Box marginTop={1}>
            <Text dimColor>⏎:send esc:back</Text>
          </Box>
        </>
      ) : (
        <Text color="gray">Press Enter to focus input</Text>
      )}
    </Box>
  );
}
