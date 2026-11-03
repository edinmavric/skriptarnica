'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Shown only when a navigation takes longer than this, so fast ones don't flash. */
const SHOW_AFTER_MS = 150;
/** Gives up if the navigation never completes (e.g. it was cancelled). */
const GIVE_UP_MS = 15_000;

function isInternalNavigation(event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = (event.target as Element | null)?.closest('a');
  if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return false;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  // Same page (or only the #hash changes): nothing loads.
  return url.pathname !== window.location.pathname || url.search !== window.location.search;
}

/**
 * Thin bar at the top while a page loads after a link click. Public pages can't use loading.tsx
 * (a streamed fallback commits HTTP 200, so notFound() pages would stop returning 404), and this
 * gives every page the same immediate feedback.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUrl = `${pathname}?${searchParams.toString()}`;
  const [pending, setPending] = useState<{ from: string; visible: boolean } | null>(null);
  // The URL changed, so the new page is rendering: reset during render (React's pattern for
  // state that follows a prop) instead of in an effect.
  const [lastUrl, setLastUrl] = useState(currentUrl);
  if (lastUrl !== currentUrl) {
    setLastUrl(currentUrl);
    setPending(null);
  }

  useEffect(() => {
    let showTimer: number | undefined;
    let giveUpTimer: number | undefined;
    const start = () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(giveUpTimer);
      const from = `${window.location.pathname}?${window.location.search.replace(/^\?/, '')}`;
      setPending({ from, visible: false });
      showTimer = window.setTimeout(
        () => setPending((p) => (p?.from === from ? { from, visible: true } : p)),
        SHOW_AFTER_MS,
      );
      giveUpTimer = window.setTimeout(() => setPending(null), GIVE_UP_MS);
    };
    const onClick = (event: MouseEvent) => {
      if (isInternalNavigation(event)) start();
    };
    // Back/forward usually comes from the router cache, so only link clicks start the bar.
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.clearTimeout(showTimer);
      window.clearTimeout(giveUpTimer);
    };
  }, []);

  if (!pending?.visible) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden"
    >
      <div className="h-full w-full origin-left animate-[nav-progress_8s_cubic-bezier(0.1,0.7,0.3,1)_forwards] bg-pen motion-reduce:animate-none" />
    </div>
  );
}
