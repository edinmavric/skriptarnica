import { inArray } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';

import { CatalogRequestActions } from '@/components/features/admin/catalog-request-actions';
import { CourseRequestLink } from '@/components/features/admin/course-request-link';
import { formatDateTime } from '@/lib/format';
import { db } from '@/server/db/client';
import { studyPrograms } from '@/server/db/schema';
import { catalogOptions, listCatalogRequests } from '@/server/services/admin/catalog-admin';
import { similarFacultyCourses } from '@/server/services/course-proposals';

export default async function AdminCatalogRequestsPage() {
  const t = await getTranslations('admin.requests');
  const tTypes = await getTranslations('admin.catalog.single');
  const [requests, options] = await Promise.all([listCatalogRequests('pending'), catalogOptions()]);
  const courseRequests = requests.filter((request) => request.type === 'course');
  // One query for all program names; similar-course lookups run in parallel (admin queue is small).
  const programIds = [
    ...new Set(courseRequests.flatMap((request) => request.payload.programId ?? [])),
  ];
  const [programRows, similarEntries] = await Promise.all([
    programIds.length
      ? db
          .select({ id: studyPrograms.id, name: studyPrograms.name })
          .from(studyPrograms)
          .where(inArray(studyPrograms.id, programIds))
      : Promise.resolve([]),
    Promise.all(
      courseRequests.map(async (request) => {
        const similar = request.payload.facultyId
          ? await similarFacultyCourses(request.payload.facultyId, request.payload.name)
          : [];
        return [request.id, similar] as const;
      }),
    ),
  ]);
  const programNames = new Map(programRows.map((row) => [row.id, row.name]));
  const similarByRequest = new Map(similarEntries);
  const facultyNames = new Map(options.faculties.map((faculty) => [faculty.id, faculty.label]));
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-bold">{t('title')}</h1>
      {requests.length === 0 ? (
        <p className="text-ink-muted">{t('none')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {requests.map((request) => {
            const payload = request.payload;
            const initial: Record<string, string> = Object.fromEntries(
              Object.entries(payload).map(([key, value]) => [key, String(value ?? '')]),
            );
            if (request.type === 'program') {
              initial.level ??= 'oas';
              initial.durationYears ??= '4';
            }
            return (
              <li
                key={request.id}
                className="flex flex-col gap-3 rounded-md border border-rule p-4"
              >
                <p>
                  <span className="font-medium">{tTypes(request.type)}:</span> {payload.name}
                  <span className="text-sm text-ink-muted">
                    {' '}
                    ({formatDateTime(request.createdAt)})
                  </span>
                </p>
                {request.type === 'course' && payload.programId && payload.year ? (
                  <p className="text-sm">
                    {t('courseContext', {
                      program: programNames.get(payload.programId) ?? '—',
                      faculty: facultyNames.get(payload.facultyId ?? '') ?? '—',
                      year: payload.year,
                      semester: payload.semester ?? '—',
                    })}
                    {payload.code ? `, ${payload.code}` : ''}
                  </p>
                ) : null}
                {request.note ? (
                  <p className="text-sm">{t('note', { note: request.note })}</p>
                ) : null}
                {(similarByRequest.get(request.id) ?? []).length > 0 ? (
                  <div className="flex flex-col gap-2 rounded-md bg-paper-sunk p-3 text-sm">
                    <p>{t('similar')}</p>
                    <ul className="flex flex-col gap-2">
                      {(similarByRequest.get(request.id) ?? []).map((course) => (
                        <li key={course.id} className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{course.name}</span>
                          {course.code ? (
                            <span className="text-ink-muted">{course.code}</span>
                          ) : null}
                          <CourseRequestLink
                            requestId={request.id}
                            courseId={course.id}
                            label={course.name}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {request.type === 'course' && payload.programId ? (
                  <p className="text-sm text-ink-muted">{t('courseApproveHint')}</p>
                ) : null}
                <CatalogRequestActions
                  requestId={request.id}
                  type={request.type}
                  initial={initial}
                  universities={options.universities}
                  faculties={options.faculties}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
