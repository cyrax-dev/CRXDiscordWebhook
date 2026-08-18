import { Elysia, t } from "elysia";

import { env } from "../core/env";
import { logger } from "../core/logger";
import { consumeRateLimit } from "../core/rate-limit";
import { WEBHOOK_JOB_NAME } from "../queue/webhook.types";
import { webhookQueue, webhookQueueConnection } from "../queue/webhook.queue";

import { validateWebhookBody, webhookBodySchema, webhookParamsSchema, webhookQuerySchema } from "./webhooks.schema";

const errorResponseSchema = t.Object({
    error: t.String(),
    requestId: t.Optional(t.String()),
});

const rateLimitResponseSchema = t.Object({
    error: t.String(),
    requestId: t.String(),
    retryAfter: t.Number(),
});

export const webhooksRoute = new Elysia({ name: "webhooks-route", prefix: "/api" }).post(
    "/webhooks/:id/:token",
    async ({ body, params, query, request, server, set, status }) => {
        const requestId = crypto.randomUUID();
        const clientIp = request.headers.get("x-real-ip") ?? server?.requestIP(request)?.address ?? "unknown";

        try {
            const rateLimit = await consumeRateLimit(webhookQueueConnection, clientIp);

            set.headers["X-RateLimit-Limit"] = String(rateLimit.limit);
            set.headers["X-RateLimit-Remaining"] = String(rateLimit.remaining);

            if (!rateLimit.allowed) {
                set.headers["Retry-After"] = String(rateLimit.retryAfterSeconds);

                return status(429, {
                    error: "Rate limit exceeded",
                    requestId,
                    retryAfter: rateLimit.retryAfterSeconds,
                });
            }
        } catch (error) {
            logger.error("Failed to check rate limit", { requestId, error });
            return status(503, { error: "Rate limiter is temporarily unavailable", requestId });
        }

        const validationError = validateWebhookBody(body);

        if (validationError) {
            return status(400, { error: validationError, requestId });
        }

        try {
            const backlog = await webhookQueue.getJobCountByTypes("wait", "active", "delayed", "prioritized");

            if (backlog >= env.queueMaxBacklog) {
                logger.warn("Webhook queue is overloaded", { requestId, backlog, limit: env.queueMaxBacklog });
                return status(503, { error: "Webhook queue is overloaded", requestId });
            }

            await webhookQueue.add(
                WEBHOOK_JOB_NAME,
                {
                    requestId,
                    webhookId: params.id,
                    webhookToken: params.token,
                    body,
                    query,
                },
                {
                    jobId: requestId,
                },
            );

            return status(202, { jobId: requestId, status: "queued" as const });
        } catch (error) {
            logger.error("Failed to enqueue webhook", { requestId, error });
            return status(503, { error: "Webhook queue is temporarily unavailable", requestId });
        }
    },
    {
        body: webhookBodySchema,
        params: webhookParamsSchema,
        query: webhookQuerySchema,
        response: {
            202: t.Object({ jobId: t.String(), status: t.Literal("queued") }),
            400: errorResponseSchema,
            429: rateLimitResponseSchema,
            503: errorResponseSchema,
        },
    },
);
