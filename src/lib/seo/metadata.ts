import type { Metadata } from 'next';

import { siteConfig } from '@/config/site';

const DEFAULT_OG_IMAGE = '/opengraph-image';

/**
 * Page metadata with canonical URL, Open Graph and Twitter (SPEC §8.3). Without an `image` the
 * site card (/opengraph-image) is used; pages with their own generated card in the same segment
 * (notes, courses, communities, posts) pass `image: null` so that card applies.
 */
export function pageMetadata({
  title,
  description,
  path,
  image,
  noIndex,
  type = 'website',
}: {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  noIndex?: boolean;
  type?: 'website' | 'article';
}): Metadata {
  const resolved = image === undefined ? DEFAULT_OG_IMAGE : image;
  const images = resolved ? [{ url: resolved, width: 1200, height: 630, alt: title }] : undefined;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: siteConfig.name,
      locale: 'sr_RS',
      type,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(resolved ? { images: [resolved] } : {}),
    },
    ...(noIndex ? { robots: { index: false, follow: true } } : {}),
  };
}
