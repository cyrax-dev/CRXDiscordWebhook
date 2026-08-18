import { env } from "./core/env";
import { logger } from "./core/logger";
import { registerShutdown } from "./core/shutdown";
import { webhookWorker, webhookWorkerConnection } from "./workers/webhook.worker";

logger.info("Webhook worker started", {
    concurrency: env.workerConcurrency,
});

registerShutdown("worker", async () => {
    await webhookWorker.close();
    await webhookWorkerConnection.quit();
});
