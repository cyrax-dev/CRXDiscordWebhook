export const env = {
    appPort: Number(Bun.env.APP_PORT),
    redisUrl: Bun.env.REDIS_URL!,
    workerConcurrency: Number(Bun.env.WORKER_CONCURRENCY),
    discordRequestTimeoutMs: Number(Bun.env.DISCORD_REQUEST_TIMEOUT_MS),
    jobMaxAttempts: Number(Bun.env.JOB_MAX_ATTEMPTS),
    shutdownTimeoutMs: Number(Bun.env.SHUTDOWN_TIMEOUT_MS),
    rateLimitMax: Number(Bun.env.RATE_LIMIT_MAX),
    queueMaxBacklog: Number(Bun.env.QUEUE_MAX_BACKLOG),
    rateLimitWindowMs: Number(Bun.env.RATE_LIMIT_WINDOW_MS),
};
