import type { ReactNode } from 'react';

/**
 * Horizontal scroller for wide tables on narrow screens. Focusable and labelled, so keyboard
 * users can scroll it too (WCAG 2.1.1; axe scrollable-region-focusable).
 */
export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
    >
      {children}
    </div>
  );
}
