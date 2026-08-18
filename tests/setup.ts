// Тесты не должны зависеть от локального .env — переменные задаются явно.
const testEnv = {
    APP_PORT: "8000",
    REDIS_URL: "redis://127.0.0.1:6379",
    WORKER_CONCURRENCY: "1",
    DISCORD_REQUEST_TIMEOUT_MS: "1000",
    JOB_MAX_ATTEMPTS: "3",
    SHUTDOWN_TIMEOUT_MS: "1000",
    RATE_LIMIT_MAX: "3",
    QUEUE_MAX_BACKLOG: "5",
    RATE_LIMIT_WINDOW_MS: "60000",
} satisfies Record<string, string>;

for (const [key, value] of Object.entries(testEnv)) {
    process.env[key] = value;
}
