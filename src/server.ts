import { app } from "./app";
import { env } from "./core/env";
import { logger } from "./core/logger";
import { registerShutdown } from "./core/shutdown";
import { webhookQueue, webhookQueueConnection } from "./queue/webhook.queue";

app.listen(env.appPort);
logger.info("API запущено", { port: env.appPort });

registerShutdown("api", async () => {
    await app.stop();
    await webhookQueue.close();
    await webhookQueueConnection.quit();
});
