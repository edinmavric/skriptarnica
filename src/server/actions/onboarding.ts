'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { routes } from '@/config/routes';
import { ok } from '@/lib/result';
import {
  catalogRequestSchema,
  coursesStepSchema,
  programStepSchema,
  studentEmailSchema,
  usernameStepSchema,
} from '@/lib/validation/onboarding';

import {
  completeOnboarding,
  confirmStudentEmail,
  createCatalogRequest,
  requestStudentEmailVerification,
  saveCourseStatuses,
  saveProgramStep,
  setUsername,
  skipToStep,
} from '../services/onboarding';
import { invalidateRecommendations } from '../services/recommendations-cache';

import { createAction } from './safe-action';

export const setUsernameAction = createAction(
  { schema: usernameStepSchema, auth: 'user' },
  async (input, { user }) => {
    const result = await setUsername(user.id, input.username);
    if (result.ok) revalidatePath(routes.onboarding);
    return result;
  },
);

export const saveProgramStepAction = createAction(
  { schema: programStepSchema, auth: 'user' },
  async (input, { user }) => {
    const result = await saveProgramStep(user.id, input);
    if (result.ok) await invalidateRecommendations(user.id);
    return result;
  },
);

export const saveCoursesStepAction = createAction(
  { schema: coursesStepSchema.extend({ advance: z.boolean().default(true) }), auth: 'user' },
  async (input, { user }) => {
    const result = await saveCourseStatuses(user.id, input, input.advance);
    if (result.ok) await invalidateRecommendations(user.id);
    return result;
  },
);

export const skipStepAction = createAction(
  { schema: z.object({ to: z.enum(['courses', 'verify', 'done']) }), auth: 'user' },
  async (input, { user }) => {
    if (input.to === 'done') await completeOnboarding(user.id);
    else await skipToStep(user.id, input.to);
    return ok(undefined);
  },
);

export const requestStudentEmailAction = createAction(
  { schema: studentEmailSchema, auth: 'user', rateLimit: { name: 'sendEmail', by: 'user' } },
  async (input, { user }) => requestStudentEmailVerification(user.id, input.email),
);

export const confirmStudentEmailAction = createAction(
  { schema: z.object({ token: z.string().min(10) }), auth: 'user' },
  async (input, { user }) => confirmStudentEmail(user.id, input.token),
);

export const catalogRequestAction = createAction(
  { schema: catalogRequestSchema, auth: 'user', rateLimit: { name: 'catalogRequest', by: 'user' } },
  async (input, { user }) => createCatalogRequest(user.id, input),
);

export const listProgramsAction = createAction(
  { schema: z.object({ facultyId: z.uuid() }), auth: 'user' },
  async (input) => {
    const { listProgramsForFaculty } = await import('../services/catalog');
    return ok(await listProgramsForFaculty(input.facultyId));
  },
);

export const setCourseProfessorAction = createAction(
  { schema: z.object({ courseId: z.uuid(), professorId: z.uuid().nullable() }), auth: 'user' },
  async (input, { user }) => {
    const { setCourseProfessor } = await import('../services/feed');
    const updated = await setCourseProfessor(user.id, input.courseId, input.professorId);
    if (!updated)
      return {
        ok: false as const,
        error: { code: 'VALIDATION' as const, messageKey: 'errors.myCourses.markFirst' },
      };
    await invalidateRecommendations(user.id);
    return ok(undefined);
  },
);
