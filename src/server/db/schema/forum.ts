import { relations, sql, type SQL } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { id, timestamps, tsvector } from './_common';
import { users } from './auth';
import { courses, faculties, professors } from './catalog';
import { examPeriods } from './exam-periods';
import { notes } from './marketplace';

export const communityType = pgEnum('community_type', [
  'faculty',
  'course',
  'professor',
  'exam',
  'general',
]);
export const communityVisibility = pgEnum('community_visibility', ['public', 'faculty_only']);

/** Reddit-style communities (SPEC §3.5). Slugs are the z/<slug> path. */
export const communities = pgTable(
  'communities',
  {
    id: id(),
    type: communityType().notNull(),
    facultyId: uuid().references(() => faculties.id, { onDelete: 'set null' }),
    courseId: uuid().references(() => courses.id, { onDelete: 'set null' }),
    professorId: uuid().references(() => professors.id, { onDelete: 'set null' }),
    name: text().notNull(),
    slug: text().notNull(),
    description: text().notNull().default(''),
    rules: text().notNull().default(''),
    visibility: communityVisibility().notNull().default('public'),
    /** null = created by the system (automatic faculty/course communities). */
    createdById: uuid().references(() => users.id, { onDelete: 'set null' }),
    memberCount: integer().notNull().default(0),
    postCount: integer().notNull().default(0),
    searchText: text().notNull().default(''),
    searchTsv: tsvector().generatedAlwaysAs((): SQL => sql`to_tsvector('simple', search_text)`),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('communities_slug_uq').on(t.slug),
    uniqueIndex('communities_course_auto_uq')
      .on(t.courseId)
      .where(sql`type = 'course'`),
    uniqueIndex('communities_faculty_auto_uq')
      .on(t.facultyId)
      .where(sql`type = 'faculty'`),
    index('communities_faculty_idx').on(t.facultyId),
    index('communities_creator_idx').on(t.createdById),
    index('communities_search_tsv_idx').using('gin', t.searchTsv),
    index('communities_search_trgm_idx').using('gin', sql`${t.searchText} gin_trgm_ops`),
  ],
);

export const memberRole = pgEnum('community_member_role', ['member', 'moderator', 'owner']);

export const communityMembers = pgTable(
  'community_members',
  {
    id: id(),
    communityId: uuid()
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRole().notNull().default('member'),
    joinedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Set while the member is banned; year 9999 = permanent. */
    bannedUntil: timestamp({ withTimezone: true }),
    banReason: text(),
    /** Saw the professor-community conduct reminder (SPEC §4.7). */
    rulesAcknowledgedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('community_members_uq').on(t.communityId, t.userId),
    index('community_members_user_idx').on(t.userId),
  ],
);

export const communityFlairs = pgTable(
  'community_flairs',
  {
    id: id(),
    communityId: uuid()
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    position: smallint().notNull().default(0),
    ...timestamps(),
  },
  (t) => [uniqueIndex('community_flairs_name_uq').on(t.communityId, t.name)],
);

export const postType = pgEnum('post_type', ['text', 'link', 'note_share', 'poll']);

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageUrl: string | null;
}

export const posts = pgTable(
  'posts',
  {
    id: id(),
    communityId: uuid()
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    type: postType().notNull(),
    title: text().notNull(),
    slug: text().notNull(),
    body: text().notNull().default(''),
    url: text(),
    linkPreview: jsonb().$type<LinkPreview>(),
    noteId: uuid().references(() => notes.id, { onDelete: 'set null' }),
    flairId: uuid().references(() => communityFlairs.id, { onDelete: 'set null' }),
    examPeriodId: uuid().references(() => examPeriods.id, { onDelete: 'set null' }),
    /** Author hidden from users; visible to moderators/admins (SPEC §3.5). */
    isAnonymous: boolean().notNull().default(false),
    score: integer().notNull().default(0),
    upvotes: integer().notNull().default(0),
    downvotes: integer().notNull().default(0),
    commentCount: integer().notNull().default(0),
    hotRank: doublePrecision().notNull().default(0),
    lockedAt: timestamp({ withTimezone: true }),
    pinnedAt: timestamp({ withTimezone: true }),
    removedAt: timestamp({ withTimezone: true }),
    removedReason: text(),
    removedById: uuid().references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp({ withTimezone: true }),
    editedAt: timestamp({ withTimezone: true }),
    searchText: text().notNull().default(''),
    searchTsv: tsvector().generatedAlwaysAs((): SQL => sql`to_tsvector('simple', search_text)`),
    ...timestamps(),
  },
  (t) => [
    index('posts_community_hot_idx').on(t.communityId, t.hotRank),
    index('posts_community_new_idx').on(t.communityId, t.createdAt),
    index('posts_community_top_idx').on(t.communityId, t.score),
    index('posts_author_idx').on(t.authorId, t.createdAt),
    index('posts_hot_idx').on(t.hotRank),
    index('posts_search_tsv_idx').using('gin', t.searchTsv),
    index('posts_search_trgm_idx').using('gin', sql`${t.searchText} gin_trgm_ops`),
  ],
);

export const pollOptions = pgTable(
  'poll_options',
  {
    id: id(),
    postId: uuid()
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    label: text().notNull(),
    position: smallint().notNull(),
    voteCount: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [index('poll_options_post_idx').on(t.postId)],
);

export const pollVotes = pgTable(
  'poll_votes',
  {
    id: id(),
    postId: uuid()
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    optionId: uuid()
      .notNull()
      .references(() => pollOptions.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (t) => [uniqueIndex('poll_votes_user_uq').on(t.postId, t.userId)],
);

export const comments = pgTable(
  'comments',
  {
    id: id(),
    postId: uuid()
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    parentId: uuid().references((): AnyPgColumn => comments.id, { onDelete: 'cascade' }),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    body: text().notNull(),
    depth: smallint().notNull().default(0),
    score: integer().notNull().default(0),
    upvotes: integer().notNull().default(0),
    downvotes: integer().notNull().default(0),
    isAnonymous: boolean().notNull().default(false),
    removedAt: timestamp({ withTimezone: true }),
    removedReason: text(),
    removedById: uuid().references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp({ withTimezone: true }),
    editedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index('comments_post_idx').on(t.postId, t.createdAt),
    index('comments_parent_idx').on(t.parentId),
    index('comments_author_idx').on(t.authorId, t.createdAt),
  ],
);

export const voteTarget = pgEnum('vote_target', ['post', 'comment']);

/** One vote per user and target, value +1/−1 (SPEC §3.5). */
export const votes = pgTable(
  'votes',
  {
    id: id(),
    targetType: voteTarget().notNull(),
    targetId: uuid().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    value: smallint().notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('votes_user_target_uq').on(t.userId, t.targetType, t.targetId),
    index('votes_target_idx').on(t.targetType, t.targetId),
  ],
);

export const moderationActionType = pgEnum('moderation_action_type', [
  'remove_post',
  'restore_post',
  'remove_comment',
  'restore_comment',
  'lock_post',
  'unlock_post',
  'pin_post',
  'unpin_post',
  'ban_member',
  'unban_member',
  'add_moderator',
  'remove_moderator',
  'resolve_report',
  'dismiss_report',
  'remove_review',
  'ban_user',
  'unban_user',
  'remove_note',
]);

/** Moderation log (SPEC §3.6); community-scoped rows form each community's mod log. */
export const moderationActions = pgTable(
  'moderation_actions',
  {
    id: id(),
    communityId: uuid().references(() => communities.id, { onDelete: 'cascade' }),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    action: moderationActionType().notNull(),
    targetType: text().notNull(),
    targetId: uuid().notNull(),
    reason: text(),
    durationHours: integer(),
    ...timestamps(),
  },
  (t) => [
    index('moderation_actions_community_idx').on(t.communityId, t.createdAt),
    index('moderation_actions_target_idx').on(t.targetType, t.targetId),
  ],
);

export const communitiesRelations = relations(communities, ({ many }) => ({
  members: many(communityMembers),
  posts: many(posts),
}));
export const postsRelations = relations(posts, ({ one, many }) => ({
  community: one(communities, { fields: [posts.communityId], references: [communities.id] }),
  comments: many(comments),
}));
