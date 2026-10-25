import { and, asc, count, eq, ilike, sql } from 'drizzle-orm';
import type { z } from 'zod';

import { parseCsvRecords } from '@/lib/csv';
import { normalizeForSearch } from '@/lib/search/normalize';
import { slugify } from '@/lib/slug';
import { appError, err, ok, type Result } from '@/lib/result';
import type { CatalogEntityType, catalogFormSchemas } from '@/lib/validation/admin';

import { db } from '../../db/client';
import {
  catalogRequests,
  courseProfessors,
  courses,
  faculties,
  professors,
  programCourses,
  studyPrograms,
  universities,
} from '../../db/schema';
import type { DbOrTx } from '../../db/types';
import { trySendEvent } from '../../jobs/client';
import {
  linkCourseProfessor,
  linkProgramCourse,
  upsertCourse,
  upsertFaculty,
  upsertProfessor,
  upsertProgram,
  upsertUniversity,
} from '../catalog';
import { audit } from './audit';

type FormInput<T extends CatalogEntityType> = z.output<(typeof catalogFormSchemas)[T]>;

const tables = {
  university: universities,
  faculty: faculties,
  program: studyPrograms,
  course: courses,
  professor: professors,
} as const;

export interface CatalogListRow {
  id: string;
  name: string;
  slug: string;
  parent: string | null;
}

/** Admin list per entity type, with a name search and the parent's name. */
export async function listCatalog(
  type: CatalogEntityType,
  query: string,
  page = 0,
): Promise<{ rows: CatalogListRow[]; hasMore: boolean }> {
  const q = query.trim() ? `%${query.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  const limit = 51;
  const offset = page * 50;
  let rows: CatalogListRow[];
  if (type === 'university') {
    rows = await db
      .select({
        id: universities.id,
        name: universities.name,
        slug: universities.slug,
        parent: sql<string | null>`null`,
      })
      .from(universities)
      .where(q ? ilike(universities.name, q) : undefined)
      .orderBy(asc(universities.name))
      .limit(limit)
      .offset(offset);
  } else if (type === 'faculty') {
    rows = await db
      .select({
        id: faculties.id,
        name: faculties.name,
        slug: faculties.slug,
        parent: universities.name,
      })
      .from(faculties)
      .innerJoin(universities, eq(universities.id, faculties.universityId))
      .where(q ? ilike(faculties.name, q) : undefined)
      .orderBy(asc(faculties.name))
      .limit(limit)
      .offset(offset);
  } else {
    const table = tables[type];
    rows = await db
      .select({ id: table.id, name: table.name, slug: table.slug, parent: faculties.shortName })
      .from(table)
      .innerJoin(faculties, eq(faculties.id, table.facultyId))
      .where(q ? ilike(table.name, q) : undefined)
      .orderBy(asc(table.name))
      .limit(limit)
      .offset(offset);
  }
  return { rows: rows.slice(0, 50), hasMore: rows.length > 50 };
}

export async function getCatalogItem(type: CatalogEntityType, id: string) {
  const table = tables[type];
  const [row] = await db.select().from(table).where(eq(table.id, id));
  return row ?? null;
}

async function slugTaken(
  tx: DbOrTx,
  type: CatalogEntityType,
  slug: string,
  scopeId: string | null,
  exceptId?: string,
) {
  const table = tables[type];
  const conditions = [eq(table.slug, slug)];
  if ('facultyId' in table && scopeId) conditions.push(eq(table.facultyId, scopeId));
  const rows = await tx
    .select({ id: table.id })
    .from(table)
    .where(and(...conditions));
  return rows.some((row) => row.id !== exceptId);
}

function defaultSlug<T extends CatalogEntityType>(type: T, input: FormInput<T>): string {
  const values = input as { name: string; shortName?: string; city?: string; slug?: string };
  if (values.slug) return values.slug;
  return type === 'faculty'
    ? slugify(`${values.shortName ?? ''} ${values.city ?? ''}`)
    : slugify(values.name);
}

function scopeOf(input: unknown): string | null {
  return (input as { facultyId?: string }).facultyId ?? null;
}

/** Creates through the same upserts as the seed (so faculties and courses get communities). */
export async function createCatalogItem<T extends CatalogEntityType>(
  adminId: string,
  type: T,
  input: FormInput<T>,
  ipHash: string,
): Promise<Result<{ id: string }>> {
  const slug = defaultSlug(type, input);
  return db.transaction(async (tx) => {
    if (await slugTaken(tx, type, slug, scopeOf(input)))
      return err(appError('VALIDATION', 'errors.validation', { slug: ['validation.slugTaken'] }));
    const created = await createIn(tx, type, { ...(input as object), slug } as FormInput<T>);
    await audit(tx, {
      actorId: adminId,
      action: `catalog.${type}_created`,
      targetType: type,
      targetId: created.id,
      details: { name: created.name },
      ipHash,
    });
    return ok({ id: created.id });
  });
}

async function createIn<T extends CatalogEntityType>(
  tx: DbOrTx,
  type: T,
  input: FormInput<T>,
): Promise<{ id: string; name: string }> {
  switch (type) {
    case 'university':
      return upsertUniversity(tx, input as FormInput<'university'>);
    case 'faculty':
      return upsertFaculty(tx, input as FormInput<'faculty'>);
    case 'program':
      return upsertProgram(tx, input as FormInput<'program'> & { slug: string });
    case 'course': {
      const value = input as FormInput<'course'>;
      return upsertCourse(tx, { ...value, ects: value.ects ?? null });
    }
    default:
      return upsertProfessor(tx, input as FormInput<'professor'>);
  }
}

/** Updates by id. The slug (and so the URL) stays unless the admin changes it explicitly. */
export async function updateCatalogItem<T extends CatalogEntityType>(
  adminId: string,
  type: T,
  id: string,
  input: FormInput<T>,
  ipHash: string,
): Promise<Result<void>> {
  const existing = await getCatalogItem(type, id);
  if (!existing) return err(appError('NOT_FOUND', 'errors.notFound'));
  const values = input as Record<string, unknown> & { name: string; slug?: string };
  const slug = values.slug ?? existing.slug;
  return db.transaction(async (tx) => {
    if (slug !== existing.slug && (await slugTaken(tx, type, slug, scopeOf(input), id)))
      return err(appError('VALIDATION', 'errors.validation', { slug: ['validation.slugTaken'] }));
    const table = tables[type];
    const searchText =
      type === 'university' || type === 'faculty'
        ? normalizeForSearch(
            `${values.name} ${String(values.shortName ?? '')} ${String(values.city ?? '')}`,
          )
        : type === 'course'
          ? normalizeForSearch(`${values.name} ${String(values.code ?? '')}`)
          : type === 'professor'
            ? normalizeForSearch(values.name)
            : undefined;
    await tx
      .update(table)
      .set({ ...values, slug, ...(searchText ? { searchText } : {}) } as never)
      .where(eq(table.id, id));
    await audit(tx, {
      actorId: adminId,
      action: `catalog.${type}_updated`,
      targetType: type,
      targetId: id,
      details: { before: existing.name, after: values.name, slugChanged: slug !== existing.slug },
      ipHash,
    });
    return ok(undefined);
  });
}

/** Deletes only unused entries: anything referenced (notes, students, courses…) is kept by FKs. */
export async function deleteCatalogItem(
  adminId: string,
  type: CatalogEntityType,
  id: string,
  ipHash: string,
): Promise<Result<void>> {
  const existing = await getCatalogItem(type, id);
  if (!existing) return err(appError('NOT_FOUND', 'errors.notFound'));
  try {
    await db.transaction(async (tx) => {
      if (type === 'course') {
        // System community of an unused course goes with it (it has no posts if nothing uses the course).
        await tx.execute(sql`DELETE FROM communities WHERE course_id = ${id} AND post_count = 0`);
      }
      if (type === 'faculty')
        await tx.execute(
          sql`DELETE FROM communities WHERE faculty_id = ${id} AND type = 'faculty' AND post_count = 0`,
        );
      await tx.delete(tables[type]).where(eq(tables[type].id, id));
      await audit(tx, {
        actorId: adminId,
        action: `catalog.${type}_deleted`,
        targetType: type,
        targetId: id,
        details: { name: existing.name },
        ipHash,
      });
    });
  } catch (error) {
    const code =
      (error as { cause?: { code?: string }; code?: string }).cause?.code ??
      (error as { code?: string }).code;
    if (code === '23503') return err(appError('CONFLICT', 'errors.admin.inUse'));
    throw error;
  }
  return ok(undefined);
}

export async function courseLinks(courseId: string) {
  const [placements, linkedProfessors] = await Promise.all([
    db
      .select({
        programId: programCourses.programId,
        program: studyPrograms.name,
        year: programCourses.year,
        semester: programCourses.semester,
        mandatory: programCourses.mandatory,
      })
      .from(programCourses)
      .innerJoin(studyPrograms, eq(studyPrograms.id, programCourses.programId))
      .where(eq(programCourses.courseId, courseId)),
    db
      .select({ id: professors.id, name: professors.name })
      .from(courseProfessors)
      .innerJoin(professors, eq(professors.id, courseProfessors.professorId))
      .where(eq(courseProfessors.courseId, courseId)),
  ]);
  return { placements, professors: linkedProfessors };
}

export async function setCoursePlacement(
  adminId: string,
  input: {
    courseId: string;
    programId: string;
    year: number;
    semester: number;
    mandatory: boolean;
    remove: boolean;
  },
  ipHash: string,
): Promise<Result<void>> {
  await db.transaction(async (tx) => {
    if (input.remove)
      await tx
        .delete(programCourses)
        .where(
          and(
            eq(programCourses.courseId, input.courseId),
            eq(programCourses.programId, input.programId),
          ),
        );
    else await linkProgramCourse(tx, input);
    await audit(tx, {
      actorId: adminId,
      action: input.remove ? 'catalog.placement_removed' : 'catalog.placement_set',
      targetType: 'course',
      targetId: input.courseId,
      details: { programId: input.programId, year: input.year, semester: input.semester },
      ipHash,
    });
  });
  return ok(undefined);
}

export async function setCourseProfessor(
  adminId: string,
  input: { courseId: string; professorId: string; remove: boolean },
  ipHash: string,
): Promise<Result<void>> {
  await db.transaction(async (tx) => {
    if (input.remove)
      await tx
        .delete(courseProfessors)
        .where(
          and(
            eq(courseProfessors.courseId, input.courseId),
            eq(courseProfessors.professorId, input.professorId),
          ),
        );
    else await linkCourseProfessor(tx, input.courseId, input.professorId);
    await audit(tx, {
      actorId: adminId,
      action: input.remove ? 'catalog.professor_unlinked' : 'catalog.professor_linked',
      targetType: 'course',
      targetId: input.courseId,
      details: { professorId: input.professorId },
      ipHash,
    });
  });
  return ok(undefined);
}

// --- CSV import -------------------------------------------------------------------------

export const CSV_COLUMNS = [
  'fakultet',
  'smer',
  'predmet',
  'sifra',
  'espb',
  'godina',
  'semestar',
  'obavezan',
  'profesori',
] as const;

export interface ImportRowResult {
  line: number;
  course: string;
  status: 'created' | 'updated' | 'error';
  errorKey?: string;
}

/**
 * Bulk course import (SPEC §4.10). One course per row; faculty (slug) must exist, the program
 * (slug, optional) too. Professors (separated by ";" or "|") are created as needed. With
 * dryRun nothing is written; the result shows what would happen. Rows are independent.
 */
export async function importCoursesCsv(
  adminId: string,
  csv: string,
  dryRun: boolean,
  ipHash: string,
): Promise<Result<{ rows: ImportRowResult[] }>> {
  const records = parseCsvRecords(csv);
  if (records.length === 0) return err(appError('VALIDATION', 'errors.admin.csvEmpty'));
  if (records.length > 2000) return err(appError('VALIDATION', 'errors.admin.csvTooLarge'));
  const missing = ['fakultet', 'predmet'].filter((column) => !(column in (records[0] ?? {})));
  if (missing.length > 0) return err(appError('VALIDATION', 'errors.admin.csvColumns'));
  const facultyRows = await db.select({ id: faculties.id, slug: faculties.slug }).from(faculties);
  const facultyBySlug = new Map(facultyRows.map((row) => [row.slug, row.id]));
  const results: ImportRowResult[] = [];
  for (const [index, record] of records.entries()) {
    const line = index + 2;
    const courseName = record.predmet ?? '';
    const facultyId = facultyBySlug.get(record.fakultet ?? '');
    const year = record.godina ? Number(record.godina) : null;
    const semester = record.semestar ? Number(record.semestar) : null;
    const ects = record.espb ? Number(record.espb) : null;
    const fail = (errorKey: string) =>
      results.push({ line, course: courseName, status: 'error', errorKey });
    if (!facultyId) {
      fail('admin.import.errors.faculty');
      continue;
    }
    if (courseName.length < 2) {
      fail('admin.import.errors.name');
      continue;
    }
    if (
      (year !== null && (!Number.isInteger(year) || year < 1 || year > 6)) ||
      (semester !== null && (!Number.isInteger(semester) || semester < 1 || semester > 12)) ||
      (ects !== null && (!Number.isInteger(ects) || ects < 0 || ects > 60))
    ) {
      fail('admin.import.errors.numbers');
      continue;
    }
    let programId: string | null = null;
    if (record.smer) {
      const [program] = await db
        .select({ id: studyPrograms.id })
        .from(studyPrograms)
        .where(and(eq(studyPrograms.facultyId, facultyId), eq(studyPrograms.slug, record.smer)));
      if (!program) {
        fail('admin.import.errors.program');
        continue;
      }
      if (year === null || semester === null) {
        fail('admin.import.errors.placement');
        continue;
      }
      programId = program.id;
    }
    const slug = slugify(courseName);
    const [existing] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.facultyId, facultyId), eq(courses.slug, slug)));
    results.push({ line, course: courseName, status: existing ? 'updated' : 'created' });
    if (dryRun) continue;
    await db.transaction(async (tx) => {
      const course = await upsertCourse(tx, {
        facultyId,
        name: courseName,
        code: record.sifra || null,
        ects,
        slug,
      });
      if (programId && year !== null && semester !== null)
        await linkProgramCourse(tx, {
          programId,
          courseId: course.id,
          year,
          semester,
          mandatory: !/^(ne|no|0|false|izborni)$/i.test(record.obavezan ?? ''),
        });
      for (const professorName of (record.profesori ?? '')
        .split(/[;|]/)
        .map((value) => value.trim())
        .filter((value) => value.length >= 3)) {
        const professor = await upsertProfessor(tx, { facultyId, name: professorName });
        await linkCourseProfessor(tx, course.id, professor.id);
      }
    });
  }
  if (!dryRun) {
    const summary = {
      created: results.filter((r) => r.status === 'created').length,
      updated: results.filter((r) => r.status === 'updated').length,
      errors: results.filter((r) => r.status === 'error').length,
    };
    await audit(db, {
      actorId: adminId,
      action: 'catalog.csv_imported',
      targetType: 'catalog',
      details: summary,
      ipHash,
    });
  }
  return ok({ rows: results });
}

// --- Catalog requests ---------------------------------------------------------------------

export async function listCatalogRequests(status: 'pending' | 'approved' | 'rejected' = 'pending') {
  return db
    .select()
    .from(catalogRequests)
    .where(eq(catalogRequests.status, status))
    .orderBy(asc(catalogRequests.createdAt))
    .limit(200);
}

export async function pendingCatalogRequestCount(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(catalogRequests)
    .where(eq(catalogRequests.status, 'pending'));
  return row?.value ?? 0;
}

/** Approve: the admin's (possibly corrected) form creates the entity; the requester is notified. */
export async function approveCatalogRequest<T extends CatalogEntityType>(
  adminId: string,
  requestId: string,
  type: T,
  input: FormInput<T>,
  ipHash: string,
): Promise<Result<{ id: string }>> {
  const [request] = await db
    .select()
    .from(catalogRequests)
    .where(eq(catalogRequests.id, requestId));
  if (!request || request.status !== 'pending')
    return err(appError('CONFLICT', 'errors.admin.requestDecided'));
  const created = await createCatalogItem(adminId, type, input, ipHash);
  if (!created.ok) return created;
  await db.transaction(async (tx) => {
    await tx
      .update(catalogRequests)
      .set({
        status: 'approved',
        reviewedById: adminId,
        reviewedAt: new Date(),
        createdEntityId: created.value.id,
      })
      .where(eq(catalogRequests.id, requestId));
    await audit(tx, {
      actorId: adminId,
      action: 'catalog.request_approved',
      targetType: 'catalog_request',
      targetId: requestId,
      details: { entityId: created.value.id },
      ipHash,
    });
  });
  await trySendEvent('catalog/request.decided', { requestId }, `catalog-request-${requestId}`);
  return created;
}

export async function rejectCatalogRequest(
  adminId: string,
  requestId: string,
  reason: string,
  ipHash: string,
): Promise<Result<void>> {
  const [request] = await db
    .select()
    .from(catalogRequests)
    .where(eq(catalogRequests.id, requestId));
  if (!request || request.status !== 'pending')
    return err(appError('CONFLICT', 'errors.admin.requestDecided'));
  await db.transaction(async (tx) => {
    await tx
      .update(catalogRequests)
      .set({
        status: 'rejected',
        reviewedById: adminId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      })
      .where(eq(catalogRequests.id, requestId));
    await audit(tx, {
      actorId: adminId,
      action: 'catalog.request_rejected',
      targetType: 'catalog_request',
      targetId: requestId,
      details: { reason },
      ipHash,
    });
  });
  await trySendEvent('catalog/request.decided', { requestId }, `catalog-request-${requestId}`);
  return ok(undefined);
}

/** Select options for the admin forms (whole catalog is small: tens of faculties). */
export async function catalogOptions() {
  const [universityRows, facultyRows] = await Promise.all([
    db
      .select({ id: universities.id, label: universities.name })
      .from(universities)
      .orderBy(asc(universities.name)),
    db
      .select({
        id: faculties.id,
        name: faculties.name,
        short: faculties.shortName,
        city: faculties.city,
      })
      .from(faculties)
      .orderBy(asc(faculties.name)),
  ]);
  return {
    universities: universityRows,
    faculties: facultyRows.map((row) => ({
      id: row.id,
      label: `${row.name} (${row.short}, ${row.city})`,
    })),
  };
}

export async function facultyCatalog(facultyId: string) {
  const [programs, facultyProfessors] = await Promise.all([
    db
      .select({ id: studyPrograms.id, label: studyPrograms.name })
      .from(studyPrograms)
      .where(eq(studyPrograms.facultyId, facultyId))
      .orderBy(asc(studyPrograms.name)),
    db
      .select({ id: professors.id, label: professors.name })
      .from(professors)
      .where(eq(professors.facultyId, facultyId))
      .orderBy(asc(professors.name)),
  ]);
  return { programs, professors: facultyProfessors };
}
