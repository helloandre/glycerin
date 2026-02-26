/**
 * InputBox Component
 * Text input for sending messages
 */

import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";
import { useCurrentChat, useCurrentThread } from "../context/AppContext.js";
import { useFocus } from "../hooks/useFocus.js";
import type { GlycerinChatClient } from "../lib/chat-client.js";

interface InputBoxProps {
  client: GlycerinChatClient;
}

export function InputBox({ client }: InputBoxProps) {
  const currentChat = useCurrentChat();
  const currentThread = useCurrentThread();
  const { isFocused } = useFocus("input");
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async (text: string) => {
    if (!text.trim() || !currentChat) return;

    setSending(true);
    try {
      if (
        currentChat.type === "dm" ||
        !currentThread ||
        currentThread.topic_id === "dm"
      ) {
        // Send as new message to chat (for DMs or when no thread selected)
        await client.sendMessage(currentChat.id, text);
      } else {
        // Reply to thread in space
        await client.replyToThread(
          currentChat.id,
          currentThread.topic_id,
          text,
        );
      }
      setValue("");
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setSending(false);
    }
  };

  // Don't show input if no chat is selected
  if (!currentChat) {
    return null;
  }

  // Don't show input if space selected but no thread
  if (currentChat.type === "space" && !currentThread) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      width="75%"
      flexShrink={0}
      height={4}
      borderStyle="single"
      borderColor={isFocused ? "cyan" : "gray"}
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text bold color={isFocused ? "cyan" : "gray"}>
          {sending ? "Sending..." : "Message"}
        </Text>
      </Box>

      {isFocused ? (
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="Type a message..."
        />
      ) : (
        <Text color="gray">Press Enter to focus input</Text>
      )}
    </Box>
  );
}
