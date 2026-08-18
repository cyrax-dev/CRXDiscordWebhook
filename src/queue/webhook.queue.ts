import { Queue } from "bullmq";

import { env } from "../core/env";
import { createProducerConnection } from "./redis";
import { WEBHOOK_QUEUE_NAME, type WebhookJobData, type WebhookJobResult } from "./webhook.types";

export const webhookQueueConnection = createProducerConnection();

export const webhookQueue = new Queue<WebhookJobData, WebhookJobResult>(WEBHOOK_QUEUE_NAME, {
    connection: webhookQueueConnection,
    defaultJobOptions: {
        attempts: env.jobMaxAttempts,
        backoff: {
            type: "exponential",
            delay: 1000,
        },
        removeOnComplete: {
            age: 10 * 60,
            count: 1000,
        },
        removeOnFail: {
            age: 24 * 60 * 60,
            count: 1000,
        },
    },
});
