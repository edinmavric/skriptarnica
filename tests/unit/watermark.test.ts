import { describe, expect, it } from 'vitest';

import { analyzePdf } from '@/server/pdf/analyze';
import { maskEmail, toAscii, watermarkPdf } from '@/server/pdf/watermark';

import { makePdf } from '../fixtures/pdf';

describe('watermark', () => {
  it('masks emails and transliterates names', () => {
    expect(maskEmail('pera.peric@gmail.com')).toBe('p***@g***.com');
    expect(maskEmail('a@student.etf.bg.ac.rs')).toBe('a***@s***.rs');
    expect(toAscii('Đorđe Ćirić, 25. okt 2026.')).toBe('Djordje Ciric, 25. okt 2026.');
  });

  it('stamps every page with buyer, masked email, order and date', async () => {
    const original = await makePdf({ pages: 3 });
    const stamped = await watermarkPdf(original, {
      buyerName: 'Đorđe Ćirić',
      username: 'djole',
      email: 'djordje@gmail.com',
      orderId: '01a170c9-0c27-70a7-8075-9ed83eb2ebfd',
      date: '25. okt 2026.',
    });
    const analysis = await analyzePdf(stamped, 50 * 1024 * 1024);
    expect(analysis.ok).toBe(true);
    if (!analysis.ok) return;
    expect(analysis.value.pageCount).toBe(3);
    const pages = analysis.value.text.split('\f');
    expect(pages).toHaveLength(3);
    for (const page of pages) {
      expect(page).toContain('Licencirano za: Djordje Ciric (@djole), d***@g***.com');
      expect(page).toContain('Porudzbina 9ed83eb2ebfd');
      expect(page).toContain('25. okt 2026.');
    }
  });
});
