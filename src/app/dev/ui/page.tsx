import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Markdown } from '@/components/ui/markdown';

import { demoMarkdown } from './demo-data';
import { UiCatalog } from './ui-catalog';

export const metadata: Metadata = { title: 'UI' };

const FONT_SAMPLE = 'Đorđe Čačak Šabac Žabalj Ćuprija — Ђорђе Чачак';

export default async function DevUiPage() {
  const t = await getTranslations('devUi');
  const markdown = <Markdown source={demoMarkdown} notebook />;
  return (
    <main id="main" className="mx-auto max-w-[1600px]">
      <h1 className="px-6 pt-6 text-display font-bold">{t('title')}</h1>
      <p className="px-6 pb-4 text-ink-muted">{t('intro')}</p>
      <div className="grid xl:grid-cols-2">
        <UiCatalog theme="light" markdown={markdown} fontSample={FONT_SAMPLE} />
        <UiCatalog theme="dark" markdown={markdown} fontSample={FONT_SAMPLE} />
      </div>
    </main>
  );
}
