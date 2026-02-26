/**
 * Custom hook for keyboard handling with focus awareness
 */

import { useInput } from 'ink';

interface KeyHandlers {
  [key: string]: () => void;
}

interface UseKeyHandlerOptions {
  enabled: boolean;
  isActive?: boolean; // Additional condition for handling
}

export function useKeyHandler(
  handlers: KeyHandlers,
  options: UseKeyHandlerOptions
) {
  useInput(
    (input, key) => {
      if (!options.enabled) return;
      if (options.isActive !== undefined && !options.isActive) return;

      // Map common key patterns
      const keyMap: Record<string, string> = {
        downArrow: 'down',
        upArrow: 'up',
        leftArrow: 'left',
        rightArrow: 'right',
        return: 'enter',
        escape: 'escape',
        backspace: 'backspace',
        delete: 'delete',
        tab: 'tab',
        pageDown: 'pagedown',
        pageUp: 'pageup',
      };

      // Check for special keys first
      for (const [keyProp, handlerKey] of Object.entries(keyMap)) {
        if (key[keyProp as keyof typeof key] && handlers[handlerKey]) {
          handlers[handlerKey]();
          return;
        }
      }

      // Check for ctrl/meta combinations
      if (key.ctrl) {
        if (handlers[`ctrl+${input}`]) {
          handlers[`ctrl+${input}`]();
          return;
        }
      }

      if (key.meta) {
        if (handlers[`meta+${input}`]) {
          handlers[`meta+${input}`]();
          return;
        }
      }

      // Check for shift combinations
      if (key.shift) {
        if (handlers[`shift+${input}`]) {
          handlers[`shift+${input}`]();
          return;
        }
      }

      // Check for direct input match (single character keys like 'j', 'k', etc.)
      if (input && handlers[input]) {
        handlers[input]();
        return;
      }
    },
    {
      isActive: options.enabled && options.isActive !== false,
    }
  );
}
