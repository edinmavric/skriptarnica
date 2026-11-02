import { describe, expect, it, vi } from 'vitest';

const sendMail = vi.fn();
const createTransport = vi.fn(() => ({ sendMail }));
const lpush = vi.fn();

async function loadTransport(env: Record<string, unknown>) {
  vi.resetModules();
  sendMail.mockReset();
  createTransport.mockClear();
  lpush.mockReset();
  vi.doMock('@/env', () => ({ env: { EMAIL_FROM: 'Skriptarnica <x@gmail.com>', ...env } }));
  vi.doMock('nodemailer', () => ({ createTransport }));
  vi.doMock('@/server/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
  vi.doMock('@/server/redis', () => ({ redis: { lpush, ltrim: vi.fn() } }));
  return import('@/server/email/transport');
}

const email = {
  to: 'student@example.com',
  subject: 'Potvrdi email',
  html: '<p>hi</p>',
  text: 'hi',
  headers: { 'List-Unsubscribe': '<https://example.rs/u>' },
  category: 'verifyEmail',
};

const smtpEnv = {
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: 465,
  SMTP_USER: 'x@gmail.com',
  SMTP_PASSWORD: 'app-password',
};

describe('email transport', () => {
  it('sends through SMTP over implicit TLS when SMTP is configured', async () => {
    const { deliver } = await loadTransport(smtpEnv);
    sendMail.mockResolvedValue({ messageId: '1' });
    await deliver(email);
    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: 'x@gmail.com', pass: 'app-password' },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'Skriptarnica <x@gmail.com>',
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: email.headers,
    });
    expect(lpush).not.toHaveBeenCalled();
  });

  it('uses STARTTLS on port 587', async () => {
    await loadTransport({ ...smtpEnv, SMTP_PORT: 587 });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: false }));
  });

  it('throws when the SMTP server refuses, so callers see the failure', async () => {
    const { deliver } = await loadTransport(smtpEnv);
    sendMail.mockRejectedValue(Object.assign(new Error('Invalid login'), { code: 'EAUTH' }));
    await expect(deliver(email)).rejects.toThrow('Email delivery failed: EAUTH');
  });

  it('falls back to the dev outbox without Resend or SMTP', async () => {
    const { deliver } = await loadTransport({});
    await deliver(email);
    expect(createTransport).not.toHaveBeenCalled();
    expect(lpush).toHaveBeenCalledOnce();
  });
});
