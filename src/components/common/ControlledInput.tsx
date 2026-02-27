/**
 * ControlledInput Component
 * A controlled text input that intercepts keyboard events before processing them
 * This allows us to handle hotkeys (like Ctrl+J, Ctrl+K) that would otherwise be consumed by TextInput
 */

import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import { colors } from '../../theme/colors.js';

interface ControlledInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  onKeyPress?: (input: string, key: any) => boolean; // Return true to prevent default
}

export function ControlledInput({
  value,
  onChange,
  onSubmit,
  placeholder = '',
  onKeyPress,
}: ControlledInputProps) {
  const [cursorOffset, setCursorOffset] = useState(value.length);

  useInput(
    (input, key) => {
      // Allow parent to intercept and handle hotkeys
      if (onKeyPress && onKeyPress(input, key)) {
        return; // Parent handled it, don't process further
      }

      // Handle special keys
      if (key.return) {
        onSubmit(value);
        onChange('');
        setCursorOffset(0);
        return;
      }

      if (key.backspace || key.delete) {
        if (cursorOffset > 0) {
          const newValue =
            value.slice(0, cursorOffset - 1) + value.slice(cursorOffset);
          onChange(newValue);
          setCursorOffset(cursorOffset - 1);
        }
        return;
      }

      if (key.leftArrow) {
        setCursorOffset(Math.max(0, cursorOffset - 1));
        return;
      }

      if (key.rightArrow) {
        setCursorOffset(Math.min(value.length, cursorOffset + 1));
        return;
      }

      if (key.upArrow || key.downArrow) {
        // Ignore up/down arrows in single-line input
        return;
      }

      // Handle ctrl+a (select all / jump to start)
      if (key.ctrl && input === 'a') {
        setCursorOffset(0);
        return;
      }

      // Handle ctrl+e (jump to end)
      if (key.ctrl && input === 'e') {
        setCursorOffset(value.length);
        return;
      }

      // Handle ctrl+w (delete word before cursor)
      if (key.ctrl && input === 'w') {
        const beforeCursor = value.slice(0, cursorOffset);
        const afterCursor = value.slice(cursorOffset);
        const lastSpaceIndex = beforeCursor.trimEnd().lastIndexOf(' ');
        const newBeforeCursor =
          lastSpaceIndex >= 0 ? beforeCursor.slice(0, lastSpaceIndex + 1) : '';
        const newValue = newBeforeCursor + afterCursor;
        onChange(newValue);
        setCursorOffset(newBeforeCursor.length);
        return;
      }

      // Regular character input
      if (input && !key.ctrl && !key.meta) {
        const newValue =
          value.slice(0, cursorOffset) + input + value.slice(cursorOffset);
        onChange(newValue);
        setCursorOffset(cursorOffset + input.length);
      }
    },
    { isActive: true }
  );

  // Update cursor offset when value changes externally
  if (cursorOffset > value.length) {
    setCursorOffset(value.length);
  }

  // Render the input with cursor
  const displayValue = value || placeholder;
  const displayColor = value ? colors.text.primary : colors.text.muted;

  return (
    <Box>
      <Text color={displayColor}>
        {displayValue.slice(0, cursorOffset)}
        <Text inverse>{displayValue[cursorOffset] || ' '}</Text>
        {displayValue.slice(cursorOffset + 1)}
      </Text>
    </Box>
  );
}
