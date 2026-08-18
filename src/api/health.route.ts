import { Elysia, t } from "elysia";

import { webhookQueueConnection } from "../queue/webhook.queue";

async function isRedisReady(): Promise<boolean> {
    try {
        const response = await Promise.race([
            webhookQueueConnection.ping(),
            Bun.sleep(2_000).then(() => {
                throw new Error("Redis health check timed out");
            }),
        ]);

        return response === "PONG";
    } catch {
        return false;
    }
}

export const healthRoute = new Elysia({
    name: "health-route",
})
    .get("/health/live", () => ({ status: "ok" as const }), {
        response: {
            200: t.Object({ status: t.Literal("ok") }),
        },
    })
    .get(
        "/health/ready",
        async ({ status }) => {
            if (!(await isRedisReady())) {
                return status(503, { status: "unavailable" as const });
            }
            return { status: "ready" as const };
        },
        {
            response: {
                200: t.Object({ status: t.Literal("ready") }),
                503: t.Object({ status: t.Literal("unavailable") }),
            },
        },
    );
