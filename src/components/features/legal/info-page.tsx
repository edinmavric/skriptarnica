import { getTranslations } from 'next-intl/server';

import { Markdown } from '@/components/ui/markdown';

export type InfoPage = 'howItWorks' | 'commission' | 'faq' | 'contact';

/** Plain informational pages from messages (`info.<page>`); values are filled by the caller. */
export async function InfoContent({
  page,
  values = {},
}: {
  page: InfoPage;
  values?: Record<string, string>;
}) {
  const t = await getTranslations('info');
  const fill = (text: string) =>
    text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
  const sections = t.raw(`${page}.sections`) as { title: string; body: string }[];
  return (
    <article className="flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-display font-bold">{t(`${page}.title`)}</h1>
        <p className="mt-2 text-lg text-ink-muted">{fill(t.raw(`${page}.intro`) as string)}</p>
      </header>
      {sections.map((section) => (
        <section key={section.title}>
          <h2 className="mb-2 text-display-sm font-semibold">{fill(section.title)}</h2>
          <Markdown source={fill(section.body)} />
        </section>
      ))}
    </article>
  );
}

export async function infoDescription(
  page: InfoPage,
  values: Record<string, string> = {},
): Promise<{ title: string; description: string }> {
  const t = await getTranslations('info');
  return {
    title: t(`${page}.title`),
    description: (t.raw(`${page}.intro`) as string).replace(
      /\{(\w+)\}/g,
      (match, key: string) => values[key] ?? match,
    ),
  };
}
