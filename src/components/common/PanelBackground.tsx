/**
 * PanelBackground Component
 * Wraps panel content and applies a background color using a fill layer
 */

import { Box, Text, useStdout } from 'ink';
import type { ReactNode } from 'react';
import React from 'react';

interface PanelBackgroundProps {
  backgroundColor: string;
  children: ReactNode;
}

export function PanelBackground({
  backgroundColor,
  children,
}: PanelBackgroundProps) {
  const { stdout } = useStdout();

  // Recursively apply backgroundColor to all Text components
  const applyBackground = (node: ReactNode): ReactNode => {
    if (!node) return node;

    if (React.isValidElement(node)) {
      // If it's a Text component, clone it with backgroundColor
      if (node.type === Text) {
        return React.cloneElement(node, {
          ...node.props,
          backgroundColor,
        } as any);
      }

      // If it has children, recursively process them
      if (node.props && node.props.children) {
        const newChildren = React.Children.map(
          node.props.children,
          applyBackground
        );
        return React.cloneElement(node, {
          ...node.props,
          children: newChildren,
        } as any);
      }
    }

    // Handle arrays of children
    if (Array.isArray(node)) {
      return node.map(applyBackground);
    }

    return node;
  };

  return (
    <Box flexDirection="column" flexGrow={1}>
      {applyBackground(children)}
    </Box>
  );
}
