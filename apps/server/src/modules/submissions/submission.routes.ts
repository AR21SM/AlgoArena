import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { submitCode } from "./submission.service";

const authGuard = async (headers: any, jwtInstance: any, set: any) => {
    const token = headers.authorization?.slice(7);
    if (!token) { set.status = 401; return null; }
    const payload = await jwtInstance.verify(token);
    if (!payload?.sub) { set.status = 401; return null; }
    return payload.sub as string;
};

export const submissionRoutes = new Elysia({ prefix: "/submissions" })
    .use(jwt({ name: "jwt", secret: process.env.JWT_SECRET ?? "secret" }))
    .post(
        "/",
        async ({ body, headers, jwt, set }) => {
            const userId = await authGuard(headers, jwt, set);
            if (!userId) return { error: "Unauthorized" };
            try {
                const result = await submitCode({ userId, ...body });
                return result;
            } catch (err: any) {
                set.status = 400;
                return { error: err.message };
            }
        },
        {
            body: t.Object({
                problemId: t.String(),
                language: t.String(),
                code: t.String(),
                roomId: t.String(),
            }),
        }
    );
