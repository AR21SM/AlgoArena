import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { db } from "../../db";
import { users } from "../../db/schema";
import { eq } from "drizzle-orm";
import * as roomService from "./room.service";

const authGuard = async (headers: any, jwtInstance: any, set: any) => {
    const token = headers.authorization?.slice(7);
    if (!token) { set.status = 401; return null; }
    const payload = await jwtInstance.verify(token);
    if (!payload?.sub) { set.status = 401; return null; }
    return payload.sub as string;
};

export const roomRoutes = new Elysia({ prefix: "/rooms" })
    .use(jwt({ name: "jwt", secret: process.env.JWT_SECRET ?? "secret" }))
    .post(
        "/",
        async ({ body, headers, jwt, set }) => {
            const userId = await authGuard(headers, jwt, set);
            if (!userId) return { error: "Unauthorized" };
            try {
                const room = await roomService.createRoom(userId, body.config);
                return { room };
            } catch (err: any) {
                set.status = 400;
                return { error: err.message };
            }
        },
        { body: t.Object({ config: t.Any() }) }
    )
    .post(
        "/:code/join",
        async ({ params, headers, jwt, set }) => {
            const userId = await authGuard(headers, jwt, set);
            if (!userId) return { error: "Unauthorized" };
            try {
                const room = await roomService.joinRoom(userId, params.code);
                return { room };
            } catch (err: any) {
                set.status = 400;
                return { error: err.message };
            }
        }
    )
    .post(
        "/:roomId/leave",
        async ({ params, headers, jwt, set }) => {
            const userId = await authGuard(headers, jwt, set);
            if (!userId) return { error: "Unauthorized" };
            await roomService.leaveRoom(userId, params.roomId);
            return { ok: true };
        }
    )
    .get(
        "/:code",
        async ({ params, headers, jwt, set }) => {
            const userId = await authGuard(headers, jwt, set);
            if (!userId) return { error: "Unauthorized" };
            const room = await roomService.getRoomByCode(params.code);
            if (!room) { set.status = 404; return { error: "Room not found" }; }
            return { room };
        }
    )
    .get(
        "/public",
        async () => {
            const rooms = await roomService.getPublicRooms();
            return { rooms };
        }
    );
