import type { Metadata } from 'next';

import { siteConfig } from '@/config/site';

/** Page metadata with canonical URL, Open Graph and Twitter (SPEC §8.3). */
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
  image?: string;
  noIndex?: boolean;
  type?: 'website' | 'article';
}): Metadata {
  const images = image ? [{ url: image, width: 1200, height: 630, alt: title }] : undefined;
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
      ...(image ? { images: [image] } : {}),
    },
    ...(noIndex ? { robots: { index: false, follow: true } } : {}),
  };
}
