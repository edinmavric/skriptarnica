import { getTranslations } from 'next-intl/server';

export default async function HomePage() {
  const t = await getTranslations('home');
  return (
    <div>
      <h1 className="text-display font-bold">{t('title')}</h1>
      <p className="mt-2 text-ink-muted">{t('status')}</p>
    </div>
  );
}
