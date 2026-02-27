/**
 * Theme Configuration
 * Central theme object and utilities for the TUI
 */

import { colors } from './colors.js';

// Panel style definitions
export const panelStyles = {
  titleBar: {
    background: colors.bg.level0,
    padding: { top: 1, bottom: 1 },
  },
  chats: {
    background: colors.bg.level1,
  },
  threads: {
    background: colors.bg.level2,
  },
  messages: {
    background: colors.bg.level3,
  },
  input: {
    background: colors.bg.level4,
  },
  modal: {
    background: colors.bg.level4,
  },
} as const;

// Focus styles
export const focusStyles = {
  focused: {
    borderColor: colors.accent.focusPrimary,
    textColor: colors.accent.focusBright,
    borderChar: '│',
  },
  unfocused: {
    borderColor: colors.accent.inactive,
    textColor: colors.text.muted,
    borderChar: '│',
  },
} as const;

// Unified theme object
export const theme = {
  colors,
  panelStyles,
  focusStyles,
} as const;

// Helper function to get panel background by level
// Not used anymore - we rely on terminal default background
export function getPanelBackground(
  level: 0 | 1 | 2 | 3 | 4,
  isFocused: boolean = false
): string {
  // Return undefined to use terminal default background
  return '';
}

// Helper function to get focus border color
export function getFocusBorderColor(isFocused: boolean): string {
  return isFocused ? colors.accent.focusPrimary : colors.accent.inactive;
}

// Helper function to get text color based on focus
export function getFocusTextColor(isFocused: boolean): string {
  return isFocused ? colors.accent.focusBright : colors.text.muted;
}

// Export theme as default
export default theme;
