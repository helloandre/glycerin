/**
 * Color Palette
 * Centralized color constants for the TUI theme
 * Uses standard terminal color names for maximum compatibility
 */

// Background colors - use standard terminal colors
// Note: Actual backgrounds are controlled by terminal theme
// We use these for visual emphasis on text elements
export const backgrounds = {
  level0: 'black', // Title bar
  level1: 'black', // Chats panel
  level2: 'black', // Threads panel
  level3: 'black', // Messages panel
  level4: 'black', // Input box
  focused: 'gray', // Slightly lighter for focused panels
} as const;

// Accent colors - modern blue theme using terminal colors
export const accent = {
  focusPrimary: 'blueBright', // Active panel left border
  focusBright: 'blueBright', // Selected items, focused headers
  focusLight: 'blue', // Hover/highlights
  inactive: 'blackBright', // Unfocused borders - darker gray that blends
} as const;

// Text colors - standard terminal colors
export const text = {
  primary: 'white', // Main text
  secondary: 'gray', // Metadata, timestamps
  muted: 'blackBright', // Disabled, placeholders
  selected: 'blueBright', // Selected text
} as const;

// Semantic colors - state indicators
export const semantic = {
  success: 'green', // Green
  warning: 'yellow', // Yellow/Amber
  error: 'red', // Red
  info: 'blue', // Blue
  magenta: 'magenta', // For browse mode
} as const;

// Export unified colors object
export const colors = {
  bg: backgrounds,
  accent,
  text,
  semantic,
} as const;

// Type exports for TypeScript
export type BackgroundLevel = keyof typeof backgrounds;
export type AccentColor = keyof typeof accent;
export type TextColor = keyof typeof text;
export type SemanticColor = keyof typeof semantic;
