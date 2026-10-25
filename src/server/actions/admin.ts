'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { approveNote, rejectNote } from '../services/admin/note-review';
import { invalidateNoteListings } from '../services/note-pages';

import { createAction } from './safe-action';

export const approveNoteAction = createAction(
  { schema: z.object({ noteId: z.uuid() }), auth: 'admin' },
  async (input, { user, ipHash }) => {
    const result = await approveNote(user.id, input.noteId, ipHash);
    if (result.ok) {
      invalidateNoteListings();
      revalidatePath('/admin/skripte');
    }
    return result;
  },
);

export const rejectNoteAction = createAction(
  {
    schema: z.object({
      noteId: z.uuid(),
      reason: z.string().trim().min(10, { error: 'validation.reasonTooShort' }).max(1000),
    }),
    auth: 'admin',
  },
  async (input, { user, ipHash }) => {
    const result = await rejectNote(user.id, input.noteId, input.reason, ipHash);
    if (result.ok) revalidatePath('/admin/skripte');
    return result;
  },
);
