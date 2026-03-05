/**
 * @file gateway.ts
 * @description WebSocket gateway implementing the room state machine.
 *
 * State transitions:
 *   LOBBY → COUNTDOWN(5s) → IN_PROGRESS → ROUND_END → (next round | MATCH_END)
 *
 * Architecture:
 *   - Each WebSocket connection is tracked in `roomConnections` Map
 *   - Server-side timers drive round progression
 *   - Redis sorted sets power O(log N) leaderboard updates
 *   - All broadcasts go through the `broadcast` helper
 */
import { Elysia } from "elysia";
import { problems as problemsTable } from "../db/schema";
import { jwt } from "@elysiajs/jwt";
import { db } from "../db";
import { rooms, roomPlayers, roomQuestions, users, matches } from "../db/schema";
import { eq, and } from "drizzle-orm";
import {
    redis, setRoomState, getRoomState, initLeaderboard,
    getLeaderboard, appendChat, getRecentChat, KEYS,
} from "../lib/redis";
import { startExecutionWorker } from "../modules/submissions/submission.service";

const connections = new Map<string, { userId: string; roomId: string; roomCode: string; username: string; ws: any }>();
const roomSockets = new Map<string, Set<string>>();

export function broadcastToRoom(roomId: string, event: object) {
    const sockets = roomSockets.get(roomId) ?? new Set();
    const payload = JSON.stringify(event);
    for (const wsId of sockets) {
        const conn = connections.get(wsId);
        try { conn?.ws.send(payload); } catch { }
    }
}

const roundTimers = new Map<string, ReturnType<typeof setInterval>>();
const countdownTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function startCountdown(roomId: string, roomCode: string) {
    broadcastToRoom(roomId, { type: "COUNTDOWN_START", payload: { seconds: 5 } });
    await db.update(rooms).set({ status: "countdown" }).where(eq(rooms.id, roomId));

    const timer = setTimeout(() => startNextRound(roomId, roomCode), 5000);
    countdownTimers.set(roomId, timer);
}

async function startNextRound(roomId: string, roomCode: string) {
    const room = await db.query.rooms.findFirst({ where: eq(rooms.id, roomId) });
    if (!room) return;

    const config = room.config as any;
    const idx = room.currentQuestionIdx;
    const totalQ = config.totalQuestions;

    if (idx >= totalQ) {
        return endMatch(roomId);
    }

    const rq = await db.query.roomQuestions.findFirst({
        where: and(eq(roomQuestions.roomId, roomId), eq(roomQuestions.questionOrder, idx)),
    });
    if (!rq) return endMatch(roomId);

    const problem = await db.query.problems.findFirst({ where: eq(problemsTable.id, rq.problemId) });
    if (!problem) return endMatch(roomId);

    const { testCases: _, ...safeProblem } = problem as any;

    const endsAt = new Date(Date.now() + config.timePerQuestionSec * 1000).toISOString();
    await db.update(rooms)
        .set({ status: "in_progress", currentQuestionIdx: idx + 1, startedAt: idx === 0 ? new Date() : undefined })
        .where(eq(rooms.id, roomId));

    broadcastToRoom(roomId, {
        type: "ROUND_START",
        payload: { problem: safeProblem, roundIdx: idx + 1, endsAt },
    });

    let secondsLeft = config.timePerQuestionSec;
    const ticker = setInterval(async () => {
        secondsLeft--;
        broadcastToRoom(roomId, { type: "TIMER_TICK", payload: { secondsRemaining: secondsLeft } });

        if (secondsLeft <= 0) {
            clearInterval(ticker);
            roundTimers.delete(roomId);
            await endRound(roomId, roomCode, idx);
        }
    }, 1000);

    roundTimers.set(roomId, ticker);
    await setRoomState(roomId, { status: "in_progress", currentQuestionIdx: idx + 1 });
}

async function endRound(roomId: string, roomCode: string, roundIdx: number) {
    const lb = await getLeaderboard(roomId);
    const room = await db.query.rooms.findFirst({ where: eq(rooms.id, roomId) });
    const config = room?.config as any;

    broadcastToRoom(roomId, { type: "ROUND_END", payload: { roundIdx, leaderboard: lb } });

    if ((room?.currentQuestionIdx ?? 0) >= (config?.totalQuestions ?? 0)) {
        setTimeout(() => endMatch(roomId), 3000);
    } else {
        setTimeout(() => startNextRound(roomId, roomCode), 3000);
    }
}

async function endMatch(roomId: string) {
    const room = await db.query.rooms.findFirst({ where: eq(rooms.id, roomId) });
    if (!room) return;

    await db.update(rooms).set({ status: "finished", endedAt: new Date() }).where(eq(rooms.id, roomId));

    const lb = await getLeaderboard(roomId);
    const playerRows = await db.query.roomPlayers.findMany({ where: eq(roomPlayers.roomId, roomId) });
    const userIds = playerRows.map((p) => p.userId);
    const userRows = await db.query.users.findMany({ where: (u, { inArray }) => inArray(u.id, userIds) });
    const userMap = Object.fromEntries(userRows.map((u) => [u.id, u]));

    const winnerId = lb[0]?.userId ?? null;
    const durationMs = room.startedAt ? Date.now() - room.startedAt.getTime() : 0;
    await db.insert(matches).values({
        roomId,
        winnerId,
        durationMs,
        playerResults: lb,
    });

    for (const player of playerRows) {
        const isWinner = player.userId === winnerId;
        await db.update(users)
            .set({
                totalMatches: (userMap[player.userId]?.totalMatches ?? 0) + 1,
                totalWins: (userMap[player.userId]?.totalWins ?? 0) + (isWinner ? 1 : 0),
            })
            .where(eq(users.id, player.userId));
    }

    broadcastToRoom(roomId, {
        type: "MATCH_END",
        payload: {
            roomId,
            players: lb.map((e, i) => ({ ...e, rank: i + 1, eloChange: 0 })),
            duration: durationMs,
            endedAt: new Date().toISOString(),
        },
    });

    const rt = roundTimers.get(roomId);
    if (rt) { clearInterval(rt); roundTimers.delete(roomId); }
}

export const wsGateway = new Elysia()
    .use(jwt({ name: "jwt", secret: process.env.JWT_SECRET ?? "secret" }))
    .ws("/ws", {
        open(ws) {
            console.log(`[WS] Client connected: ${ws.id}`);
        },

        async message(ws, rawMessage: any) {
            let event: { type: string; payload?: any };
            try {
                event = typeof rawMessage === "string" ? JSON.parse(rawMessage) : rawMessage;
            } catch {
                return;
            }

            switch (event.type) {
                case "JOIN_ROOM": {
                    const { roomCode, token } = event.payload ?? {};
                    const payload = await (ws as any).data.jwt.verify(token);
                    if (!payload?.sub) { ws.send(JSON.stringify({ type: "ERROR", payload: { message: "Unauthorized" } })); return; }

                    const userId = payload.sub as string;
                    const room = await db.query.rooms.findFirst({ where: eq(rooms.code, roomCode) });
                    if (!room) { ws.send(JSON.stringify({ type: "ERROR", payload: { message: "Room not found" } })); return; }

                    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
                    if (!user) return;

                    connections.set(ws.id, { userId, roomId: room.id, roomCode, username: user.username, ws });
                    if (!roomSockets.has(room.id)) roomSockets.set(room.id, new Set());
                    roomSockets.get(room.id)!.add(ws.id);

                    const players = await db.query.roomPlayers.findMany({
                        where: eq(roomPlayers.roomId, room.id),
                    });
                    const playerUserIds = players.map((p) => p.userId);
                    const playerUsers = await db.query.users.findMany({
                        where: (u, { inArray }) => inArray(u.id, playerUserIds),
                    });
                    const userMap = Object.fromEntries(playerUsers.map((u) => [u.id, u]));
                    const connectedIds = new Set([...connections.values()].map((c) => c.userId));

                    ws.send(JSON.stringify({
                        type: "ROOM_STATE",
                        payload: {
                            id: room.id,
                            code: room.code,
                            status: room.status,
                            hostId: room.hostId,
                            config: room.config,
                            currentQuestionIdx: room.currentQuestionIdx,
                            players: players.map((p) => ({
                                userId: p.userId,
                                username: userMap[p.userId]?.username ?? "",
                                avatarUrl: userMap[p.userId]?.avatarUrl,
                                eloRating: userMap[p.userId]?.eloRating ?? 1000,
                                score: p.score,
                                rank: 0,
                                solvedCount: p.solvedCount,
                                isReady: p.isReady,
                                isConnected: connectedIds.has(p.userId),
                            })),
                        },
                    }));

                    const recentChat = await getRecentChat(room.id, 30);
                    for (const msg of recentChat) {
                        ws.send(JSON.stringify({ type: "CHAT_MESSAGE", payload: msg }));
                    }

                    broadcastToRoom(room.id, {
                        type: "PLAYER_JOINED",
                        payload: {
                            userId,
                            username: user.username,
                            eloRating: user.eloRating,
                            score: 0, rank: 0, solvedCount: 0,
                            isReady: false, isConnected: true,
                        },
                    });
                    break;
                }

                case "PLAYER_READY": {
                    const conn = connections.get(ws.id);
                    if (!conn) return;
                    const { isReady } = event.payload ?? {};
                    await db.update(roomPlayers)
                        .set({ isReady })
                        .where(and(eq(roomPlayers.roomId, conn.roomId), eq(roomPlayers.userId, conn.userId)));
                    broadcastToRoom(conn.roomId, {
                        type: "PLAYER_READY_CHANGE",
                        payload: { userId: conn.userId, isReady },
                    });
                    break;
                }

                case "START_GAME": {
                    const conn = connections.get(ws.id);
                    if (!conn) return;
                    const room = await db.query.rooms.findFirst({ where: eq(rooms.id, conn.roomId) });
                    if (!room || room.hostId !== conn.userId) return;
                    if (room.status !== "lobby") return;

                    const players = await db.query.roomPlayers.findMany({ where: eq(roomPlayers.roomId, conn.roomId) });
                    if (players.length < 2 || !players.every((p) => p.isReady)) return;

                    await initLeaderboard(conn.roomId, players.map((p) => p.userId));

                    await startCountdown(conn.roomId, conn.roomCode);
                    break;
                }

                case "SEND_CHAT": {
                    const conn = connections.get(ws.id);
                    if (!conn) return;
                    const msg = (event.payload?.message ?? "").slice(0, 200).trim();
                    if (!msg) return;
                    const chatMessage = {
                        id: crypto.randomUUID(),
                        userId: conn.userId,
                        username: conn.username,
                        message: msg,
                        timestamp: new Date().toISOString(),
                    };
                    await appendChat(conn.roomId, chatMessage);
                    broadcastToRoom(conn.roomId, { type: "CHAT_MESSAGE", payload: chatMessage });
                    break;
                }

                case "LEAVE_ROOM": {
                    const conn = connections.get(ws.id);
                    if (!conn) return;
                    roomSockets.get(conn.roomId)?.delete(ws.id);
                    connections.delete(ws.id);
                    broadcastToRoom(conn.roomId, { type: "PLAYER_LEFT", payload: { userId: conn.userId } });
                    break;
                }
            }
        },

        close(ws) {
            const conn = connections.get(ws.id);
            if (conn) {
                roomSockets.get(conn.roomId)?.delete(ws.id);
                connections.delete(ws.id);
                broadcastToRoom(conn.roomId, { type: "PLAYER_LEFT", payload: { userId: conn.userId } });
            }
        },
    });

startExecutionWorker(broadcastToRoom);
