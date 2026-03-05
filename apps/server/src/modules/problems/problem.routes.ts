import { Elysia, t } from "elysia";
import { db } from "../../db";
import { problems } from "../../db/schema";
import { eq, sql } from "drizzle-orm";
import { jwt } from "@elysiajs/jwt";

export const problemRoutes = new Elysia({ prefix: "/problems" })
    .use(jwt({ name: "jwt", secret: process.env.JWT_SECRET ?? "secret" }))
    .get("/", async ({ query }) => {
        const { difficulty, tags } = query as any;
        const problemList = await db.query.problems.findMany({
            where: difficulty ? eq(problems.difficulty, difficulty as any) : undefined,
            orderBy: (p, { asc }) => [asc(p.createdAt)],
        });
        return { problems: problemList };
    })
    .get("/:id", async ({ params, set }) => {
        const problem = await db.query.problems.findFirst({
            where: eq(problems.id, params.id),
        });
        if (!problem) { set.status = 404; return { error: "Problem not found" }; }
        const { testCases: _, ...safe } = problem;
        return { problem: safe };
    });
