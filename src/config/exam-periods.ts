/** Serbian exam period names (SPEC §3.5). Stored as these keys; labels come from i18n. */
export const examPeriodKeys = [
  'januarski',
  'februarski',
  'aprilski',
  'junski',
  'julski',
  'avgustovski',
  'septembarski',
  'oktobarski',
  'oktobarski2',
  'decembarski',
] as const;
export type ExamPeriodKey = (typeof examPeriodKeys)[number];
