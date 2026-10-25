import { NonRetriableError } from 'inngest';

import {
  markVersionFailed,
  checkDuplicates,
  finalizeVersion,
  processVersion,
} from '../../services/note-processing';
import { alertOps } from '../alerts';
import { events, inngest } from '../client';

/** PDF validation, previews, text, hashes and duplicate check for an uploaded version. */
export const processNoteVersion = inngest.createFunction(
  {
    id: 'process-note-version',
    triggers: [{ event: 'note/version.uploaded' }],
    retries: 3,
    concurrency: { limit: 4 },
    onFailure: async ({ event, error }) => {
      const parsed = events['note/version.uploaded'].safeParse(event.data.event.data);
      if (parsed.success)
        await markVersionFailed(parsed.data.versionId, 'notes.processing.internal');
      await alertOps('Note processing failed', `${error.name}: ${error.message}`);
    },
  },
  async ({ event, step }) => {
    const parsed = events['note/version.uploaded'].safeParse(event.data);
    if (!parsed.success) throw new NonRetriableError('invalid event payload');
    const { versionId } = parsed.data;
    const processed = await step.run('analyze-and-render', () => processVersion(versionId));
    if (processed.status !== 'ready') return processed;
    const duplicate = await step.run('check-duplicates', () => checkDuplicates(versionId));
    const outcome = await step.run('finalize', () =>
      finalizeVersion(versionId, duplicate !== null),
    );
    return { status: 'ready', outcome, duplicate: duplicate !== null };
  },
);
