FROM oven/bun:1.2-alpine AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN bun install --frozen-lockfile

FROM oven/bun:1.2-alpine AS prod-deps
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN bun install --frozen-lockfile --production

FROM oven/bun:1.2-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=prod-deps /app/bun.lock ./bun.lock

COPY apps/server/package.json apps/server/package.json
COPY apps/server/tsconfig.json apps/server/tsconfig.json
COPY apps/server/drizzle.config.ts apps/server/drizzle.config.ts
COPY apps/server/src apps/server/src

COPY packages/shared/package.json packages/shared/package.json
COPY packages/shared/src packages/shared/src

WORKDIR /app/apps/server
EXPOSE 3001

CMD ["bun", "run", "start"]
