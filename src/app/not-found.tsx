import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { routes } from '@/config/routes';

export default async function NotFound() {
  const t = await getTranslations('errorPages');
  return (
    // A single ruled sheet on the notebook cover (no site chrome here).
    <div className="desk min-h-dvh px-3 py-10 sm:py-16">
      <main
        id="main"
        data-paper="ruled"
        className="sheet mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center gap-4 px-5 py-14 md:pl-16"
      >
        <p className="hand text-7xl leading-none text-redpen">404</p>
        <h1 className="text-display font-bold">{t('notFoundTitle')}</h1>
        <p className="text-ink-muted">{t('notFoundBody')}</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href={routes.home}>{t('home')}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={routes.search}>{t('search')}</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
