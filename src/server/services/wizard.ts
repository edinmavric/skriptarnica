import { desc, eq } from 'drizzle-orm';

import type { WizardNote } from '@/components/features/seller/note-wizard';

import type { CurrentUser } from '../auth/session';
import { db } from '../db/client';
import { notes, noteVersions } from '../db/schema';
import { canEditNote } from '../policies';

import { getCourseLabel } from './catalog';
import { publicationProblems } from './notes';

/** Loads a note for its owner's wizard; null when missing or not theirs (rendered as 404). */
export async function loadWizardNote(
  user: CurrentUser,
  noteId: string,
): Promise<{ note: WizardNote; problems: string[]; published: boolean } | null> {
  const [note] = await db.select().from(notes).where(eq(notes.id, noteId));
  if (!note || !canEditNote(user, note).allowed) return null;
  const [latest] = await db
    .select()
    .from(noteVersions)
    .where(eq(noteVersions.noteId, noteId))
    .orderBy(desc(noteVersions.versionNumber))
    .limit(1);
  const course = note.courseId ? await getCourseLabel(note.courseId) : null;
  return {
    note: {
      id: note.id,
      courseId: note.courseId,
      courseLabel: course ? `${course.name} (${course.facultyShortName})` : null,
      professorId: note.professorId,
      title: note.title,
      shortDescription: note.shortDescription,
      howIStudied: note.howIStudied,
      grade: note.grade,
      academicYear: note.academicYear,
      examPeriod: note.examPeriod,
      language: note.language,
      tags: note.tags,
      pricePara: note.pricePara,
      declarationAccepted: Boolean(note.declarationAcceptedAt),
      wizardStep: note.wizardStep,
      status: note.status,
    },
    problems: publicationProblems(note, latest ?? null),
    published: note.publishedAt !== null,
  };
}
