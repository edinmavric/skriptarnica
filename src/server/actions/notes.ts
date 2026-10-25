'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { routes } from '@/config/routes';
import { ok } from '@/lib/result';
import {
  noteCourseSchema,
  noteDeclarationSchema,
  noteDescriptionSchema,
  noteIdSchema,
  notePriceSchema,
  uploadConfirmSchema,
  uploadRequestSchema,
} from '@/lib/validation/notes';

import {
  acceptDeclaration,
  confirmUpload,
  deleteDraft,
  getLatestVersionStatus,
  publishNote,
  requestUpload,
  saveNoteCourse,
  saveNoteDescription,
  saveNotePrice,
  setNoteListed,
  toggleBookmark,
} from '../services/notes';
import { invalidateNoteListings } from '../services/note-pages';

import { createAction } from './safe-action';

export const saveNoteCourseAction = createAction(
  { schema: noteCourseSchema, auth: 'participant' },
  async (input, { user }) => saveNoteCourse(user, input),
);

export const requestUploadAction = createAction(
  { schema: uploadRequestSchema, auth: 'participant', rateLimit: { name: 'upload', by: 'user' } },
  async (input, { user }) => requestUpload(user, input),
);

export const confirmUploadAction = createAction(
  { schema: uploadConfirmSchema, auth: 'participant' },
  async (input, { user }) => confirmUpload(user, input),
);

export const versionStatusAction = createAction(
  { schema: noteIdSchema, auth: 'user' },
  async (input, { user }) => getLatestVersionStatus(user, input.noteId),
);

export const saveNoteDescriptionAction = createAction(
  { schema: noteDescriptionSchema, auth: 'participant' },
  async (input, { user }) => {
    const result = await saveNoteDescription(user, input);
    if (result.ok) invalidateNoteListings();
    return result;
  },
);

export const saveNotePriceAction = createAction(
  { schema: notePriceSchema, auth: 'participant' },
  async (input, { user }) => {
    const result = await saveNotePrice(user, input);
    if (result.ok) invalidateNoteListings();
    return result;
  },
);

export const acceptDeclarationAction = createAction(
  { schema: noteDeclarationSchema, auth: 'participant' },
  async (input, { user }) => acceptDeclaration(user, input.noteId),
);

export const publishNoteAction = createAction(
  { schema: noteIdSchema, auth: 'participant' },
  async (input, { user }) => {
    const result = await publishNote(user, input.noteId);
    if (result.ok) {
      invalidateNoteListings();
      revalidatePath(routes.sell);
    }
    return result;
  },
);

export const setNoteListedAction = createAction(
  { schema: noteIdSchema.extend({ listed: z.boolean() }), auth: 'participant' },
  async (input, { user }) => {
    const result = await setNoteListed(user, input.noteId, input.listed);
    if (result.ok) invalidateNoteListings();
    return result;
  },
);

export const deleteDraftAction = createAction(
  { schema: noteIdSchema, auth: 'participant' },
  async (input, { user }) => {
    const result = await deleteDraft(user, input.noteId);
    if (result.ok) revalidatePath(routes.sell);
    return result;
  },
);

export const toggleBookmarkAction = createAction(
  {
    schema: noteIdSchema.extend({ saved: z.boolean() }),
    auth: 'user',
    rateLimit: { name: 'vote', by: 'user' },
  },
  async (input, { user }) => {
    const result = await toggleBookmark(user.id, input.noteId, input.saved);
    return result.ok ? ok(result.value) : result;
  },
);
