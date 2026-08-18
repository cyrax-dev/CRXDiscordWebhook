# Build stage
FROM oven/bun:1.3.14-slim AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json .
COPY src ./src

RUN bun run build

# Runtime stage
FROM oven/bun:1.3.14-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

COPY --from=builder /app/dist ./dist

USER bun

EXPOSE 8000

CMD ["bun", "run", "start"]
