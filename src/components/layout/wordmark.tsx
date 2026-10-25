import Link from 'next/link';

import { siteConfig } from '@/config/site';
import { routes } from '@/config/routes';

/** Wordmark: the name set in the display serif, with a highlighter stroke under the first half. */
export function Wordmark() {
  const name = siteConfig.name;
  const split = Math.ceil(name.length / 2);
  return (
    <Link
      href={routes.home}
      className="font-display text-[1.35rem] leading-none font-bold tracking-tight"
    >
      <span className="marker">{name.slice(0, split)}</span>
      {name.slice(split)}
    </Link>
  );
}
