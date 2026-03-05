/**
 * @file room.service.ts
 * @description Business logic for room lifecycle:
 * create, join, leave, get, list-public.
 * All state-machine transitions handled in the WS gateway.
 */
import { eq, and, sql } from "drizzle-orm";
import { db } from "../../db";
import { rooms, roomPlayers, roomQuestions, problems } from "../../db/schema";

function generateRoomCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function createRoom(hostId: string, config: any) {
    let code = generateRoomCode();
    let collision = await db.query.rooms.findFirst({ where: eq(rooms.code, code) });
    while (collision) {
        code = generateRoomCode();
        collision = await db.query.rooms.findFirst({ where: eq(rooms.code, code) });
    }

    const [room] = await db.insert(rooms).values({ hostId, code, config }).returning();

    await db.insert(roomPlayers).values({ roomId: room.id, userId: hostId, isReady: true });

    const totalQ = config.totalQuestions ?? 3;
    const [minDiff, maxDiff] = config.difficultyRange as [string, string];

    const diffLevels = ["easy", "medium", "hard"];
    const minIdx = diffLevels.indexOf(minDiff);
    const maxIdx = diffLevels.indexOf(maxDiff);
    const allowedDiffs = diffLevels.slice(minIdx, maxIdx + 1);

    const selectedProblems = await db
        .select({ id: problems.id })
        .from(problems)
        .where(sql`${problems.difficulty} = ANY(${allowedDiffs})`)
        .orderBy(sql`RANDOM()`)
        .limit(totalQ);

    if (selectedProblems.length > 0) {
        await db.insert(roomQuestions).values(
            selectedProblems.map((p, i) => ({
                roomId: room.id,
                problemId: p.id,
                questionOrder: i,
            }))
        );
    }

    return { ...room, code };
}

export async function joinRoom(userId: string, code: string) {
    const room = await db.query.rooms.findFirst({ where: eq(rooms.code, code) });
    if (!room) throw new Error("Room not found");
    if (room.status !== "lobby") throw new Error("Room already in progress");

    const existing = room.config as any;
    const players = await db.query.roomPlayers.findMany({
        where: eq(roomPlayers.roomId, room.id),
    });
    if (players.length >= existing.maxPlayers) throw new Error("Room is full");

    const alreadyJoined = players.some((p) => p.userId === userId);
    if (!alreadyJoined) {
        await db.insert(roomPlayers).values({ roomId: room.id, userId });
    }

    return room;
}

export async function leaveRoom(userId: string, roomId: string) {
    await db
        .delete(roomPlayers)
        .where(and(eq(roomPlayers.roomId, roomId), eq(roomPlayers.userId, userId)));
}

export async function getRoomByCode(code: string) {
    const room = await db.query.rooms.findFirst({
        where: eq(rooms.code, code),
        with: { players: true },
    });
    return room ?? null;
}

export async function getPublicRooms() {
    return db.query.rooms.findMany({
        where: and(eq(rooms.status, "lobby"), sql`(${rooms.config}->>'isPrivate')::boolean = false`),
        orderBy: (r, { desc }) => [desc(r.createdAt)],
        limit: 20,
    });
}
