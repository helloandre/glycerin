/**
 * Custom hook for managing component focus
 */

import { useCallback } from 'react';
import { useAppState } from '../context/AppContext.js';
import type { FocusTarget } from '../types/index.js';

export function useFocus(componentId: FocusTarget) {
  const { state, dispatch } = useAppState();
  const isFocused = state.focused === componentId;

  const requestFocus = useCallback(() => {
    dispatch({ type: 'FOCUS_CHANGED', payload: componentId });
  }, [componentId, dispatch]);

  return { isFocused, requestFocus };
}
