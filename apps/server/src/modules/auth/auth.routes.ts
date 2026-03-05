/**
 * @file auth.routes.ts
 * @description Auth module — register, login, /me endpoint.
 */
import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import bcrypt from "bcryptjs";
import { db } from "../../db";
import { users } from "../../db/schema";
import { eq } from "drizzle-orm";

export const authRoutes = new Elysia({ prefix: "/auth" })
    .use(jwt({ name: "jwt", secret: process.env.JWT_SECRET ?? "secret", exp: "7d" }))
    .post(
        "/register",
        async ({ body, jwt, set }) => {
            const { username, email, password } = body;
            if (await db.query.users.findFirst({ where: eq(users.email, email) })) {
                set.status = 409; return { error: "Email already in use" };
            }
            if (await db.query.users.findFirst({ where: eq(users.username, username) })) {
                set.status = 409; return { error: "Username already taken" };
            }
            const passwordHash = await bcrypt.hash(password, 10);
            const [user] = await db.insert(users).values({ username, email, passwordHash }).returning();
            const token = await jwt.sign({ sub: user.id, username: user.username });
            return { user: sanitize(user), token };
        },
        { body: t.Object({ username: t.String({ minLength: 3 }), email: t.String({ format: "email" }), password: t.String({ minLength: 6 }) }) }
    )
    .post(
        "/login",
        async ({ body, jwt, set }) => {
            const { email, password } = body;
            const user = await db.query.users.findFirst({ where: eq(users.email, email) });
            if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
                set.status = 401; return { error: "Invalid credentials" };
            }
            const token = await jwt.sign({ sub: user.id, username: user.username });
            return { user: sanitize(user), token };
        },
        { body: t.Object({ email: t.String({ format: "email" }), password: t.String() }) }
    )
    .get(
        "/me",
        async ({ headers, jwt, set }) => {
            const token = headers.authorization?.slice(7);
            if (!token) { set.status = 401; return { error: "Unauthorized" }; }
            const payload = await jwt.verify(token);
            if (!payload?.sub) { set.status = 401; return { error: "Invalid token" }; }
            const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub as string) });
            if (!user) { set.status = 404; return { error: "User not found" }; }
            return sanitize(user);
        }
    );

function sanitize(user: any) {
    const { passwordHash: _, ...safe } = user;
    return { ...safe, createdAt: safe.createdAt?.toISOString?.() ?? safe.createdAt };
}
