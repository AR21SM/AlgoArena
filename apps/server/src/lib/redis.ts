import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
});

redis.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
});

export const KEYS = {
    roomState: (roomId: string) => `room:${roomId}:state`,
    roomLeaderboard: (roomId: string) => `room:${roomId}:leaderboard`,
    roomChat: (roomId: string) => `room:${roomId}:chat`,
    roomTimer: (roomId: string) => `room:${roomId}:timer`,
    roomFirstSolve: (roomId: string, problemId: string) => `room:${roomId}:firstsolve:${problemId}`,
    userSession: (userId: string) => `user:${userId}:session`,
    submissionStatus: (submissionId: string) => `submission:${submissionId}:status`,
    channel: (roomId: string) => `room:${roomId}:channel`,
};

export async function updateLeaderboardScore(roomId: string, userId: string, scoreIncrement: number) {
    await redis.zincrby(KEYS.roomLeaderboard(roomId), scoreIncrement, userId);
}

export async function getLeaderboard(roomId: string): Promise<{ userId: string; score: number }[]> {
    const result = await redis.zrevrange(KEYS.roomLeaderboard(roomId), 0, -1, 'WITHSCORES');
    const entries: { userId: string; score: number }[] = [];
    for (let i = 0; i < result.length; i += 2) {
        entries.push({ userId: result[i], score: parseFloat(result[i + 1]) });
    }
    return entries;
}

export async function initLeaderboard(roomId: string, playerIds: string[]) {
    const pipeline = redis.pipeline();
    pipeline.del(KEYS.roomLeaderboard(roomId));
    for (const id of playerIds) {
        pipeline.zadd(KEYS.roomLeaderboard(roomId), 0, id);
    }
    await pipeline.exec();
}

export async function setRoomState(roomId: string, state: object) {
    await redis.set(KEYS.roomState(roomId), JSON.stringify(state), 'EX', 86400);
}

export async function getRoomState<T>(roomId: string): Promise<T | null> {
    const raw = await redis.get(KEYS.roomState(roomId));
    return raw ? JSON.parse(raw) : null;
}

export async function appendChat(roomId: string, message: object) {
    const key = KEYS.roomChat(roomId);
    await redis.lpush(key, JSON.stringify(message));
    await redis.ltrim(key, 0, 199);
    await redis.expire(key, 86400);
}

export async function getRecentChat(roomId: string, count = 50): Promise<object[]> {
    const raw = await redis.lrange(KEYS.roomChat(roomId), 0, count - 1);
    return raw.map((r) => JSON.parse(r)).reverse();
}
