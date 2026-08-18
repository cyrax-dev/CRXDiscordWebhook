import { DelayedError, UnrecoverableError, Worker } from "bullmq";

import { logger } from "../core/logger";
import { env } from "../core/env";
import { executeDiscordWebhook } from "../discord/discord.client";
import { DiscordRequestError } from "../discord/discord.errors";
import { createWorkerConnection } from "../queue/redis";
import { WEBHOOK_QUEUE_NAME, type WebhookJobData, type WebhookJobResult } from "../queue/webhook.types";

export const webhookWorkerConnection = createWorkerConnection();

export const webhookWorker = new Worker<WebhookJobData, WebhookJobResult>(
    WEBHOOK_QUEUE_NAME,
    async (job, token) => {
        logger.info("Processing webhook job", {
            jobId: job.id,
            requestId: job.data.requestId,
            webhookId: job.data.webhookId,
            attempt: job.attemptsMade + 1,
        });

        try {
            return await executeDiscordWebhook(job.data);
        } catch (error) {
            if (error instanceof DiscordRequestError) {
                logger.warn("Discord request rejected", {
                    jobId: job.id,
                    requestId: job.data.requestId,
                    webhookId: job.data.webhookId,
                    status: error.status,
                    retryable: error.retryable,
                    retryAfterMs: error.retryAfterMs,
                });

                if (!error.retryable) {
                    throw new UnrecoverableError(error.message);
                }

                if (error.retryAfterMs !== undefined) {
                    await job.moveToDelayed(Date.now() + error.retryAfterMs, token);

                    throw new DelayedError();
                }
            }

            throw error;
        }
    },
    {
        connection: webhookWorkerConnection,
        concurrency: env.workerConcurrency,
    },
);

webhookWorker.on("completed", (job, result) => {
    logger.info("Webhook job completed", {
        jobId: job.id,
        requestId: job.data.requestId,
        webhookId: job.data.webhookId,
        messageId: result.messageId,
    });
});

webhookWorker.on("failed", (job, error) => {
    logger.error("Webhook job failed", {
        jobId: job?.id,
        requestId: job?.data.requestId,
        webhookId: job?.data.webhookId,
        attemptsMade: job?.attemptsMade,
        error,
    });
});

webhookWorker.on("error", (error) => {
    logger.error("Webhook worker error", {
        error,
    });
});
