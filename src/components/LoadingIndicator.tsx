/**
 * Loading Indicator Component
 * Shows a spinner when loading
 */

import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { useIsLoading } from '../context/AppContext.js';
import { colors } from '../theme/colors.js';

interface LoadingIndicatorProps {
  loadingKey?: string;
  message?: string;
}

export function LoadingIndicator({
  loadingKey,
  message = 'Loading...',
}: LoadingIndicatorProps) {
  const isLoading = useIsLoading(loadingKey);

  if (!isLoading) return null;

  return (
    <Box>
      <Text color={colors.accent.focusPrimary}>
        <Spinner type="dots" />
      </Text>
      <Text color={colors.text.secondary}> {message}</Text>
    </Box>
  );
}
