import Link from 'next/link';

import { siteConfig } from '@/config/site';
import { routes } from '@/config/routes';

/**
 * Wordmark: the name written on the notebook's cover label, a white sticker with two faint
 * writing lines, set in the display serif.
 */
export function Wordmark() {
  return (
    <Link
      href={routes.home}
      className="relative inline-flex items-center rounded-[4px] bg-label px-3 pt-1 pb-1.5 font-display text-[1.3rem] leading-none font-extrabold tracking-tight text-label-ink shadow-[inset_0_0_0_1px_rgb(21_27_51/0.14),0_1px_0_rgb(0_0_0/0.25)]"
    >
      {siteConfig.name}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-2 bottom-1 h-px bg-ruled"
      />
    </Link>
  );
}
