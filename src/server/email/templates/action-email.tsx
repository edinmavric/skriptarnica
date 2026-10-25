import { EmailButton, EmailFallbackLink, EmailHeading, EmailLayout, EmailText } from './layout';

/** Generic "one action" email: heading, 1–3 paragraphs, a button, fallback link, footer note. */
export function ActionEmail({
  preview,
  heading,
  paragraphs,
  cta,
  url,
  fallbackLabel,
  note,
  footer,
  appUrl,
}: {
  preview: string;
  heading: string;
  paragraphs: string[];
  cta?: string;
  url?: string;
  fallbackLabel: string;
  note?: string;
  footer: string;
  appUrl: string;
}) {
  return (
    <EmailLayout preview={preview} footer={footer} appUrl={appUrl}>
      <EmailHeading>{heading}</EmailHeading>
      {paragraphs.map((paragraph) => (
        <EmailText key={paragraph}>{paragraph}</EmailText>
      ))}
      {cta && url ? (
        <>
          <EmailButton href={url}>{cta}</EmailButton>
          <EmailFallbackLink href={url} label={fallbackLabel} />
        </>
      ) : null}
      {note ? <EmailText muted>{note}</EmailText> : null}
    </EmailLayout>
  );
}
