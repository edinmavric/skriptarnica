import { describe, expect, it } from 'vitest';

import { bankAccountControl, isValidBankAccount, normalizeBankAccount } from '@/lib/bank-account';

const control = bankAccountControl('160', '0000000012345');
const valid = `160-0000000012345-${control}`;

describe('Serbian bank account numbers', () => {
  it('accepts a correct control number in long, short and compact forms', () => {
    expect(isValidBankAccount(valid)).toBe(true);
    expect(isValidBankAccount(`160-12345-${control}`)).toBe(true);
    expect(isValidBankAccount(valid.replace(/-/g, ''))).toBe(true);
    expect(normalizeBankAccount(`160-12345-${control}`)).toBe(valid);
  });

  it('rejects a wrong control number or malformed input', () => {
    const wrong = String((Number(control) + 1) % 100).padStart(2, '0');
    expect(isValidBankAccount(`160-0000000012345-${wrong}`)).toBe(false);
    expect(isValidBankAccount('160-abc-12')).toBe(false);
    expect(isValidBankAccount('16-12345-67')).toBe(false);
    expect(isValidBankAccount('')).toBe(false);
  });

  it('computes MOD 97-10 control digits', () => {
    // 98 - (16000000000123450 0 mod 97), checked independently with BigInt arithmetic.
    expect(Number(control)).toBe(Number(98n - (BigInt('160000000001234500') % 97n)));
  });
});
