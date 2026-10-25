/**
 * Service provider information (SPEC §7.4, ⚖️ Serbian Law on Electronic Commerce, art. 6).
 * Shown on the Imprint page, in legal texts and email footers. Every value marked PLACEHOLDER
 * must be replaced with the registered company's data before launch (Phase 11 checklist).
 */
export const company = {
  /** Poslovno ime (as registered with the APR). */
  legalName: 'PLACEHOLDER: Poslovno ime d.o.o.',
  /** Sedište: street, number, postal code, city. */
  address: 'PLACEHOLDER: Ulica i broj, 11000 Beograd, Srbija',
  /** Matični broj. */
  registrationNumber: 'PLACEHOLDER: 00000000',
  /** PIB. */
  taxId: 'PLACEHOLDER: 000000000',
  /** Registar u kome je upisan. */
  register: 'Agencija za privredne registre (APR)',
  email: 'kontakt@skriptarnica.rs',
  /** Address for copyright and legal notices. */
  legalEmail: 'pravno@skriptarnica.rs',
  privacyEmail: 'privatnost@skriptarnica.rs',
  phone: 'PLACEHOLDER: +381 11 000 0000',
  /** Days within which copyright claims are answered (⚖️ to be confirmed). */
  copyrightResponseDays: 7,
} as const;

/** True while any field is still a placeholder; shown as a notice on the Imprint page. */
export const companyIsPlaceholder = Object.values(company).some(
  (value) => typeof value === 'string' && value.startsWith('PLACEHOLDER'),
);
