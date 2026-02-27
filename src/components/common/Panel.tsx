/**
 * Panel Component
 * Reusable panel wrapper with theming support
 * Handles focus indicators with full-height left border
 */

import { Box } from 'ink';
import type { ReactNode } from 'react';
import { getFocusBorderColor } from '../../theme/theme.js';
import { PanelBackground } from './PanelBackground.js';

interface PanelProps {
  level: 0 | 1 | 2 | 3 | 4; // Background level (unused, kept for compatibility)
  isFocused: boolean; // Show focus indicator
  borderColor?: string; // Override border color (for special modes like browse)
  backgroundColor?: string; // Optional background color for the panel
  children: ReactNode;
  // Layout props passed through to Box
  flexGrow?: number;
  flexShrink?: number;
  height?: number | string;
  width?: number | string;
  minHeight?: number | string;
  paddingBottom?: number; // Extra spacing below panel
  flexDirection?: 'row' | 'column';
  paddingX?: number;
}

export function Panel({
  level: _level,
  isFocused,
  borderColor,
  backgroundColor,
  children,
  flexGrow,
  flexShrink,
  height,
  width,
  minHeight,
  paddingBottom,
  flexDirection = 'row',
  paddingX,
}: PanelProps) {
  const actualBorderColor = borderColor || getFocusBorderColor(isFocused);

  // Wrap children with background if specified
  const content = backgroundColor ? (
    <PanelBackground backgroundColor={backgroundColor}>
      {children}
    </PanelBackground>
  ) : (
    children
  );

  return (
    <>
      {/* Wrapper with full-height left border */}
      <Box
        flexDirection="column"
        flexGrow={flexGrow}
        flexShrink={flexShrink}
        height={height}
        width={width}
        minHeight={minHeight}
        borderStyle="single"
        borderColor={actualBorderColor}
      >
        {/* Inner content with negative margins to hide top/bottom/right borders */}
        <Box
          flexDirection={flexDirection}
          flexGrow={1}
          paddingX={paddingX}
          marginTop={-1}
          marginBottom={-1}
          marginRight={-1}
        >
          {content}
        </Box>
      </Box>
      {paddingBottom !== undefined && paddingBottom > 0 && (
        <Box height={paddingBottom} />
      )}
    </>
  );
}
