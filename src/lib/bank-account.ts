/**
 * Serbian bank account numbers: BBB-AAAAAAAAAAAAA-KK (3-digit bank, 13-digit account,
 * 2-digit control, ISO 7064 MOD 97-10). The short form "160-12345-67" is zero-padded.
 */
export function normalizeBankAccount(input: string): string | null {
  const cleaned = input.replace(/\s+/g, '');
  const match = /^(\d{3})-?(\d{1,13})-?(\d{2})$/.exec(
    cleaned.includes('-')
      ? cleaned
      : cleaned.length === 18
        ? `${cleaned.slice(0, 3)}-${cleaned.slice(3, 16)}-${cleaned.slice(16)}`
        : cleaned,
  );
  if (!match) return null;
  const [, bank, account, control] = match;
  if (!bank || !account || !control) return null;
  return `${bank}-${account.padStart(13, '0')}-${control}`;
}

export function bankAccountControl(bank: string, account13: string): string {
  const remainder = BigInt(`${bank}${account13}00`) % 97n;
  return String(98n - remainder).padStart(2, '0');
}

export function isValidBankAccount(input: string): boolean {
  const normalized = normalizeBankAccount(input);
  if (!normalized) return false;
  const [bank, account, control] = normalized.split('-') as [string, string, string];
  return bankAccountControl(bank, account) === control;
}
