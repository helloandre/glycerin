/**
 * ConfirmationModal Component
 * Displays a centered modal for user confirmation
 */

import { Box, Text, useInput } from 'ink';
import { useAppState } from '../context/AppContext.js';
import { useFocus } from '../hooks/useFocus.js';
import { colors } from '../theme/colors.js';

export function ConfirmationModal() {
  const { state, dispatch } = useAppState();
  const { isFocused } = useFocus('confirmation');
  const modal = state.confirmationModal;

  // Handle input
  useInput((input, key) => {
    if (!isFocused || !modal) return;

    if (input.toLowerCase() === 'y') {
      // Confirm
      modal.onConfirm();
      dispatch({ type: 'CONFIRMATION_CLOSED' });
    } else if (input.toLowerCase() === 'n' || key.escape) {
      // Cancel
      modal.onCancel();
      dispatch({ type: 'CONFIRMATION_CLOSED' });
    }
  });

  if (!modal || !modal.isOpen) {
    return null;
  }

  return (
    <Box
      position="absolute"
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
    >
      {/* Semi-transparent backdrop */}
      <Box
        position="absolute"
        width="100%"
        height="100%"
        flexDirection="column"
      />

      {/* Modal box */}
      <Box
        borderStyle="single"
        borderColor={colors.accent.focusPrimary}
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        minWidth={40}
      >
        <Box marginBottom={1}>
          <Text bold color={colors.accent.focusPrimary}>
            {modal.title}
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text color={colors.text.primary}>{modal.message}</Text>
        </Box>

        <Box justifyContent="center">
          <Text>
            <Text bold color={colors.semantic.success}>
              [Y]
            </Text>
            <Text color={colors.text.primary}> Yes </Text>
            <Text bold color={colors.semantic.error}>
              [N]
            </Text>
            <Text color={colors.text.primary}> No</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
