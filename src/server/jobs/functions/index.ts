import { reconcilePayments, releaseFunds } from './money';
import { notificationFunctions } from './notifications';
import { processNoteVersion } from './process-note-version';

/** Every background function served at /api/inngest. */
export const functions = [
  processNoteVersion,
  reconcilePayments,
  releaseFunds,
  ...notificationFunctions,
];
