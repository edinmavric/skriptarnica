import Image from 'next/image';

import { cn } from '@/lib/cn';

const sizes = { sm: 28, md: 40, lg: 72 } as const;

/** Pen-and-paper palette for initials (SPEC §6.2: initials are fine, but in the app's colors). */
const tones = [
  'bg-pen-soft text-pen',
  'bg-marker-soft text-ink',
  'bg-success-soft text-success',
  'bg-warning-soft text-warning',
  'bg-paper-sunk text-ink',
] as const;

function toneFor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return tones[hash % tones.length] ?? tones[0];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + second).toLocaleUpperCase('sr-Latn');
}

export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const px = sizes[size];
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={px}
        height={px}
        className={cn('shrink-0 rounded-full object-cover', className)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ width: px, height: px, fontSize: px * 0.38 }}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full font-display font-semibold',
        toneFor(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
