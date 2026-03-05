/**
 * @file submission.service.ts
 * @description Handles code submission: validates, queues with BullMQ,
 * calls Judge0, scores, and broadcasts leaderboard via Redis pub/sub.
 */
import { Queue, Worker, type Job } from "bullmq";
import { db } from "../../db";
import { submissions, rooms, roomPlayers, users, problems as problemsTable } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { redis, updateLeaderboardScore, getLeaderboard, KEYS } from "../../lib/redis";
import { calculateScore } from "../../lib/scoring";

const QUEUE_NAME = "code-execution";
const JUDGE0_URL = process.env.JUDGE0_URL ?? "http://localhost:2358";

const LANGUAGE_IDS: Record<string, number> = {
    cpp: 54, python: 71, java: 62, javascript: 63, typescript: 74,
};

export const executionQueue = new Queue(QUEUE_NAME, {
    connection: redis.duplicate(),
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 50,
        removeOnFail: 100,
    },
});

interface ExecutionJob {
    submissionId: string;
    roomId: string;
    userId: string;
    problemId: string;
    language: string;
    code: string;
    startedAt: number;
    maxTimeSec: number;
    difficulty: string;
}

export async function submitCode(params: {
    userId: string;
    roomId: string;
    problemId: string;
    language: string;
    code: string;
}) {
    const { userId, roomId, problemId, language, code } = params;

    const room = await db.query.rooms.findFirst({ where: eq(rooms.id, roomId) });
    if (!room || room.status !== "in_progress") {
        throw new Error("Room is not in an active round");
    }

    const existing = await db.query.submissions.findFirst({
        where: and(
            eq(submissions.userId, userId),
            eq(submissions.roomId, roomId),
            eq(submissions.problemId, problemId),
            eq(submissions.status, "accepted")
        ),
    });
    if (existing) throw new Error("Already solved this problem");

    const [submission] = await db.insert(submissions).values({
        userId, roomId, problemId, language: language as any, code,
    }).returning();

    const config = room.config as any;

    await executionQueue.add("execute", {
        submissionId: submission.id,
        roomId,
        userId,
        problemId,
        language,
        code,
        startedAt: Date.now(),
        maxTimeSec: config.timePerQuestionSec ?? 300,
        difficulty: "medium",
    } satisfies ExecutionJob);

    return { submissionId: submission.id, status: "pending" };
}

export function startExecutionWorker(broadcast: (roomId: string, event: object) => void) {
    const worker = new Worker<ExecutionJob>(
        QUEUE_NAME,
        async (job: Job<ExecutionJob>) => {
            const { submissionId, roomId, userId, problemId, language, code, startedAt, maxTimeSec, difficulty } = job.data;

            const problem = await db.query.problems.findFirst({
                where: eq(problemsTable.id, problemId),
            });

            const submitRes = await fetch(`${JUDGE0_URL}/submissions?wait=true`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    language_id: LANGUAGE_IDS[language] ?? 71,
                    source_code: Buffer.from(code).toString("base64"),
                    stdin: Buffer.from((problem?.testCases as any[])?.[0]?.input ?? "").toString("base64"),
                    expected_output: Buffer.from((problem?.testCases as any[])?.[0]?.output ?? "").toString("base64"),
                    cpu_time_limit: (problem?.timeLimitMs ?? 2000) / 1000,
                    memory_limit: (problem?.memoryLimitMb ?? 256) * 1024,
                    base64_encoded: true,
                }),
            }).then((r) => r.json());

            const statusId = submitRes.status?.id ?? 0;
            const accepted = statusId === 3;

            const wrongCount = await db.query.submissions.findMany({
                where: and(
                    eq(submissions.userId, userId),
                    eq(submissions.roomId, roomId),
                    eq(submissions.problemId, problemId),
                    eq(submissions.status, "wrong_answer")
                ),
            }).then((r) => r.length);

            const statusMap: Record<number, string> = {
                3: "accepted", 4: "wrong_answer", 5: "time_limit_exceeded",
                6: "compilation_error", 11: "runtime_error", 13: "runtime_error",
            };
            const finalStatus = (statusMap[statusId] ?? "runtime_error") as any;

            const timeTakenMs = Date.now() - startedAt;

            const firstSolveKey = KEYS.roomFirstSolve(roomId, problemId);
            const isFirstSolve = accepted && (await redis.setnx(firstSolveKey, userId)) === 1;
            if (isFirstSolve) await redis.expire(firstSolveKey, 86400);

            let scoreAwarded = 0;

            if (accepted) {
                scoreAwarded = calculateScore({
                    maxTimeSec,
                    timeTakenMs,
                    difficulty: difficulty as any,
                    wrongAttempts: wrongCount,
                    isFirstSolve,
                });

                await updateLeaderboardScore(roomId, userId, scoreAwarded);

                const player = await db.query.roomPlayers.findFirst({
                    where: and(eq(roomPlayers.roomId, roomId), eq(roomPlayers.userId, userId)),
                });
                if (player) {
                    await db.update(roomPlayers)
                        .set({
                            score: player.score + scoreAwarded,
                            solvedCount: player.solvedCount + 1,
                        })
                        .where(eq(roomPlayers.id, player.id));
                }

                const lb = await getLeaderboard(roomId);
                const userIds = lb.map((e) => e.userId);
                const userRows = await db.query.users.findMany({
                    where: (u, { inArray }) => inArray(u.id, userIds),
                });
                const userMap = Object.fromEntries(userRows.map((u) => [u.id, u]));
                const leaderboardPayload = lb.map((e, i) => ({
                    ...e,
                    username: userMap[e.userId]?.username ?? "Unknown",
                    rank: i + 1,
                    solvedCount: 0,
                }));

                broadcast(roomId, { type: "LEADERBOARD_UPDATE", payload: leaderboardPayload });
                broadcast(roomId, {
                    type: "PLAYER_SOLVED",
                    payload: { userId, username: userMap[userId]?.username, timeTakenMs, score: scoreAwarded },
                });
            } else if (finalStatus === "wrong_answer") {
                const lockUntil = new Date(Date.now() + 30_000).toISOString();
                broadcast(roomId, { type: "WRONG_SUBMISSION", payload: { userId, lockUntil } });
            }

            await db.update(submissions)
                .set({ status: finalStatus, timeTakenMs, scoreAwarded, wrongAttempts: wrongCount })
                .where(eq(submissions.id, submissionId));
        },
        { connection: redis.duplicate(), concurrency: 10 }
    );

    worker.on("failed", (job, err) => {
        console.error(`[Worker] Job ${job?.id} failed:`, err.message);
    });

    return worker;
}
