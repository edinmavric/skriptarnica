import { Link, Section, Text } from '@react-email/components';

import { EmailButton, EmailHeading, EmailLayout, EmailText, emailColors } from './layout';

export interface DigestItem {
  title: string;
  community: string;
  comments: string;
  url: string;
}

/** Community activity digest (SPEC §4.9): a short list of posts, one button, an unsubscribe link. */
export function DigestEmail({
  preview,
  heading,
  intro,
  items,
  cta,
  url,
  unsubscribeLabel,
  unsubscribeUrl,
  footer,
  appUrl,
}: {
  preview: string;
  heading: string;
  intro: string;
  items: DigestItem[];
  cta: string;
  url: string;
  unsubscribeLabel: string;
  unsubscribeUrl: string;
  footer: string;
  appUrl: string;
}) {
  return (
    <EmailLayout preview={preview} footer={footer} appUrl={appUrl}>
      <EmailHeading>{heading}</EmailHeading>
      <EmailText>{intro}</EmailText>
      <Section>
        {items.map((item) => (
          <Text key={item.url} style={{ margin: '0 0 14px', fontSize: '15px', lineHeight: '22px' }}>
            <Link
              href={item.url}
              style={{ color: emailColors.pen, fontWeight: 600, textDecoration: 'underline' }}
            >
              {item.title}
            </Link>
            <br />
            <span style={{ color: emailColors.muted, fontSize: '13px' }}>
              {item.community}, {item.comments}
            </span>
          </Text>
        ))}
      </Section>
      <EmailButton href={url}>{cta}</EmailButton>
      <EmailText muted>
        <Link
          href={unsubscribeUrl}
          style={{ color: emailColors.muted, textDecoration: 'underline' }}
        >
          {unsubscribeLabel}
        </Link>
      </EmailText>
    </EmailLayout>
  );
}
