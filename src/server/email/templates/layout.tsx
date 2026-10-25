import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';

import { siteConfig } from '@/config/site';

/**
 * Email shell in the app's paper/ink style. Inline styles only (email clients), light
 * palette with enough contrast to survive dark-mode inversion.
 */
export const emailColors = {
  paper: '#fbfaf5',
  sheet: '#ffffff',
  ink: '#1b1d22',
  muted: '#51565f',
  pen: '#1e3a9e',
  marker: '#e4f35a',
  rule: '#d6dde7',
};

export function EmailLayout({
  preview,
  children,
  footer,
  appUrl,
}: {
  preview: string;
  children: ReactNode;
  footer: ReactNode;
  appUrl: string;
}) {
  return (
    <Html lang="sr-Latn">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: emailColors.paper,
          margin: 0,
          padding: '24px 0',
          fontFamily: 'Georgia, "Times New Roman", serif',
          color: emailColors.ink,
        }}
      >
        <Container style={{ maxWidth: 560, margin: '0 auto', padding: '0 16px' }}>
          <Text style={{ fontSize: 22, fontWeight: 700, margin: '0 0 16px' }}>
            <Link
              href={appUrl}
              style={{
                color: emailColors.ink,
                textDecoration: 'none',
                backgroundColor: emailColors.marker,
                padding: '0 4px',
              }}
            >
              {siteConfig.name}
            </Link>
          </Text>
          <Section
            style={{
              backgroundColor: emailColors.sheet,
              border: `1px solid ${emailColors.rule}`,
              borderRadius: 8,
              padding: '24px 24px 8px',
              fontFamily: 'Arial, Helvetica, sans-serif',
              fontSize: 16,
              lineHeight: '24px',
            }}
          >
            {children}
          </Section>
          <Hr style={{ borderColor: emailColors.rule, margin: '24px 0 12px' }} />
          <Text
            style={{
              fontFamily: 'Arial, Helvetica, sans-serif',
              fontSize: 13,
              lineHeight: '20px',
              color: emailColors.muted,
              margin: 0,
            }}
          >
            {footer}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function EmailButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: '20px 0 24px' }}>
      <Link
        href={href}
        style={{
          backgroundColor: emailColors.pen,
          color: '#ffffff',
          borderRadius: 6,
          padding: '12px 20px',
          fontWeight: 600,
          textDecoration: 'none',
          display: 'inline-block',
        }}
      >
        {children}
      </Link>
    </Section>
  );
}

export function EmailText({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <Text
      style={{
        margin: '0 0 16px',
        color: muted ? emailColors.muted : emailColors.ink,
        fontSize: muted ? 14 : 16,
      }}
    >
      {children}
    </Text>
  );
}

export function EmailHeading({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        margin: '0 0 16px',
        fontFamily: 'Georgia, serif',
        fontSize: 22,
        lineHeight: '28px',
        fontWeight: 700,
      }}
    >
      {children}
    </Text>
  );
}

/** Shows the raw URL under a button for clients that strip links. */
export function EmailFallbackLink({ href, label }: { href: string; label: string }) {
  return (
    <Text
      style={{ margin: '0 0 16px', fontSize: 13, color: emailColors.muted, wordBreak: 'break-all' }}
    >
      {label}{' '}
      <Link href={href} style={{ color: emailColors.pen }}>
        {href}
      </Link>
    </Text>
  );
}
