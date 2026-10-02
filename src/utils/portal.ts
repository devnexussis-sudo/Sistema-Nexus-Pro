import React from 'react';
import { createPortal } from 'react-dom';

/**
 * 🛡️ safeCreatePortal — Safe wrapper around React's createPortal
 * Prevents "Target container is not a DOM element" crashes by validating
 * that the target container exists, is a valid DOM element, and safely catches
 * any runtime DOM errors.
 */
export const safeCreatePortal = (
  children: React.ReactNode,
  container: Element | DocumentFragment | null = typeof document !== 'undefined' ? document.body : null
): React.ReactPortal | null => {
  if (
    typeof document === 'undefined' ||
    !container ||
    typeof container !== 'object' ||
    !('nodeType' in container) ||
    !container.nodeType
  ) {
    return null;
  }
  try {
    return createPortal(children, container);
  } catch (err) {
    console.error('[safeCreatePortal] Failed to render portal:', err);
    return null;
  }
};
