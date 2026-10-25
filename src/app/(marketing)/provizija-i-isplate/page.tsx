import type { Metadata } from 'next';

import { InfoContent, infoDescription } from '@/components/features/legal/info-page';
import { routes } from '@/config/routes';
import { pageMetadata } from '@/lib/seo/metadata';
import { publicValues } from '@/server/services/public-values';

export async function generateMetadata(): Promise<Metadata> {
  const { title, description } = await infoDescription('commission', await publicValues());
  return pageMetadata({ title, description, path: routes.commission });
}

export default async function Page() {
  return <InfoContent page="commission" values={await publicValues()} />;
}
