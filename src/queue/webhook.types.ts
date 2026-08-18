import type { WebhookBody, WebhookQuery } from "../api/webhooks.schema";

export const WEBHOOK_QUEUE_NAME = "webhooks";
export const WEBHOOK_JOB_NAME = "execute";

export interface WebhookJobData {
    requestId: string;
    webhookId: string;
    webhookToken: string;
    body: WebhookBody;
    query: WebhookQuery;
}

export interface WebhookJobResult {
    messageId: string;
}
