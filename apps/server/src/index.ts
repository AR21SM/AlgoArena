/**
 * @file index.ts
 * @description CodeArena API Server entry point.
 * Elysia app with all routes, WebSocket gateway, Swagger docs, and CORS.
 */
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { authRoutes } from "./modules/auth/auth.routes";
import { roomRoutes } from "./modules/rooms/room.routes";
import { problemRoutes } from "./modules/problems/problem.routes";
import { submissionRoutes } from "./modules/submissions/submission.routes";
import { wsGateway } from "./ws/gateway";

const PORT = Number(process.env.PORT ?? 3001);

const app = new Elysia()
    .use(
        cors({
            origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
            credentials: true,
        })
    )
    .use(
        swagger({
            documentation: {
                info: { title: "CodeArena API", version: "1.0.0" },
                tags: [
                    { name: "Auth", description: "Authentication" },
                    { name: "Rooms", description: "Room management" },
                    { name: "Problems", description: "Problem bank" },
                    { name: "Submissions", description: "Code submission & judging" },
                ],
            },
        })
    )
    .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
    .use(authRoutes)
    .use(roomRoutes)
    .use(problemRoutes)
    .use(submissionRoutes)
    .use(wsGateway)
    .listen(PORT, () => {
        console.log(`
╔═══════════════════════════════════════╗
║          CodeArena API Server         ║
╠═══════════════════════════════════════╣
║  HTTP  → http://localhost:${PORT}        ║
║  WS    → ws://localhost:${PORT}/ws        ║
║  Docs  → http://localhost:${PORT}/swagger ║
╚═══════════════════════════════════════╝`);
    });

export type App = typeof app;
