import {
    pgTable,
    text,
    integer,
    timestamp,
    jsonb,
    boolean,
    serial,
    pgEnum,
} from 'drizzle-orm/pg-core';

export const difficultyEnum = pgEnum('difficulty', ['easy', 'medium', 'hard']);
export const roomStatusEnum = pgEnum('room_status', ['lobby', 'countdown', 'in_progress', 'finished']);
export const submissionStatusEnum = pgEnum('submission_status', [
    'pending', 'accepted', 'wrong_answer', 'time_limit_exceeded', 'runtime_error', 'compilation_error'
]);
export const languageEnum = pgEnum('language', ['cpp', 'python', 'java', 'javascript', 'typescript']);

export const users = pgTable('users', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    username: text('username').notNull().unique(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    avatarUrl: text('avatar_url'),
    eloRating: integer('elo_rating').notNull().default(1000),
    totalMatches: integer('total_matches').notNull().default(0),
    totalWins: integer('total_wins').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const problems = pgTable('problems', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    title: text('title').notNull(),
    description: text('description').notNull(),
    difficulty: difficultyEnum('difficulty').notNull(),
    tags: text('tags').array().notNull().default([]),
    timeLimitMs: integer('time_limit_ms').notNull().default(2000),
    memoryLimitMb: integer('memory_limit_mb').notNull().default(256),
    examples: jsonb('examples').notNull().default([]),
    constraints: text('constraints').notNull().default(''),
    hints: text('hints').array().default([]),
    testCases: jsonb('test_cases').notNull().default([]),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const rooms = pgTable('rooms', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    code: text('code').notNull().unique(),
    hostId: text('host_id').notNull().references(() => users.id),
    status: roomStatusEnum('status').notNull().default('lobby'),
    config: jsonb('config').notNull(),
    currentQuestionIdx: integer('current_question_idx').notNull().default(0),
    startedAt: timestamp('started_at'),
    endedAt: timestamp('ended_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const roomPlayers = pgTable('room_players', {
    id: serial('id').primaryKey(),
    roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id),
    score: integer('score').notNull().default(0),
    rank: integer('rank').notNull().default(0),
    solvedCount: integer('solved_count').notNull().default(0),
    isReady: boolean('is_ready').notNull().default(false),
    eloChange: integer('elo_change'),
    joinedAt: timestamp('joined_at').notNull().defaultNow(),
});

export const roomQuestions = pgTable('room_questions', {
    id: serial('id').primaryKey(),
    roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
    problemId: text('problem_id').notNull().references(() => problems.id),
    questionOrder: integer('question_order').notNull(),
});

export const submissions = pgTable('submissions', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    roomId: text('room_id').notNull().references(() => rooms.id),
    userId: text('user_id').notNull().references(() => users.id),
    problemId: text('problem_id').notNull().references(() => problems.id),
    language: languageEnum('language').notNull(),
    code: text('code').notNull(),
    status: submissionStatusEnum('status').notNull().default('pending'),
    judgeToken: text('judge_token'),
    timeTakenMs: integer('time_taken_ms'),
    scoreAwarded: integer('score_awarded').notNull().default(0),
    wrongAttempts: integer('wrong_attempts').notNull().default(0),
    submittedAt: timestamp('submitted_at').notNull().defaultNow(),
});

export const matches = pgTable('matches', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    roomId: text('room_id').notNull().references(() => rooms.id),
    winnerId: text('winner_id').references(() => users.id),
    durationMs: integer('duration_ms'),
    playerResults: jsonb('player_results').notNull().default([]),
    endedAt: timestamp('ended_at').notNull().defaultNow(),
});
