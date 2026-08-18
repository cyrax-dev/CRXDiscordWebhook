import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { WebhookJobData } from "../../src/queue/webhook.types";

interface AddCall {
    name: string;
    data: WebhookJobData;
    options: { jobId: string };
}

const redisState = {
    evalResult: [1, 60_000] as [number, number],
    evalThrows: false,
    pingResult: "PONG" as string,
    pingThrows: false,
};

const queueState = {
    backlog: 0,
    addThrows: false,
    calls: [] as AddCall[],
};

// Единственный модуль, который держит живое соединение с Redis, — подменяем его целиком.
mock.module("../../src/queue/webhook.queue", () => ({
    webhookQueueConnection: {
        ping: async () => {
            if (redisState.pingThrows) {
                throw new Error("redis down");
            }
            return redisState.pingResult;
        },
        eval: async () => {
            if (redisState.evalThrows) {
                throw new Error("redis down");
            }
            return redisState.evalResult;
        },
    },
    webhookQueue: {
        getJobCountByTypes: async () => queueState.backlog,
        add: async (name: string, data: WebhookJobData, options: { jobId: string }) => {
            if (queueState.addThrows) {
                throw new Error("redis down");
            }
            queueState.calls.push({ name, data, options });
            return { id: options.jobId };
        },
    },
}));

const { app } = await import("../../src/app");

const WEBHOOK_ID = "123456789012345678";
const WEBHOOK_TOKEN = "abcdefghijklmnopqrstuvwxyz-_.";
const CLIENT_IP = "1.2.3.4";

function postWebhook(body: unknown, options: { path?: string; ip?: string } = {}) {
    const path = options.path ?? `/api/webhooks/${WEBHOOK_ID}/${WEBHOOK_TOKEN}`;

    return app.handle(
        new Request(`http://localhost${path}`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-real-ip": options.ip ?? CLIENT_IP,
            },
            body: JSON.stringify(body),
        }),
    );
}

function get(path: string) {
    return app.handle(new Request(`http://localhost${path}`));
}

beforeEach(() => {
    redisState.evalResult = [1, 60_000];
    redisState.evalThrows = false;
    redisState.pingResult = "PONG";
    redisState.pingThrows = false;

    queueState.backlog = 0;
    queueState.addThrows = false;
    queueState.calls = [];
});

describe("POST /api/webhooks/:id/:token", () => {
    it("ставит задачу в очередь и отвечает 202", async () => {
        const response = await postWebhook({ content: "hello" });
        const body = (await response.json()) as { jobId: string; status: string };

        expect(response.status).toBe(202);
        expect(body.status).toBe("queued");
        expect(body.jobId).toMatch(/^[0-9a-f-]{36}$/);

        expect(queueState.calls).toHaveLength(1);

        const call = queueState.calls[0]!;

        expect(call.name).toBe("execute");
        expect(call.options.jobId).toBe(body.jobId);
        expect(call.data.requestId).toBe(body.jobId);
        expect(call.data.webhookId).toBe(WEBHOOK_ID);
        expect(call.data.webhookToken).toBe(WEBHOOK_TOKEN);
        expect(call.data.body).toEqual({ content: "hello" });
    });

    it("отдаёт заголовки лимитера", async () => {
        redisState.evalResult = [2, 60_000];

        const response = await postWebhook({ content: "hello" });

        expect(response.headers.get("x-ratelimit-limit")).toBe("3");
        expect(response.headers.get("x-ratelimit-remaining")).toBe("1");
    });

    it("прокидывает query в задачу", async () => {
        const path = `/api/webhooks/${WEBHOOK_ID}/${WEBHOOK_TOKEN}?thread_id=876543210987654321&with_components=true`;

        await postWebhook({ content: "hello" }, { path });

        expect(queueState.calls[0]!.data.query).toEqual({
            thread_id: "876543210987654321",
            with_components: true,
        });
    });

    it("возвращает 400, если нет ни content, ни embeds, ни components, ни poll", async () => {
        const response = await postWebhook({});

        expect(response.status).toBe(400);
        expect((await response.json()) as { error: string }).toMatchObject({
            error: "It is necessary to pass content, embeds, components, or a poll.",
        });
        expect(queueState.calls).toHaveLength(0);
    });

    it("возвращает 400 на неподдерживаемые флаги", async () => {
        const response = await postWebhook({ content: "hello", flags: 1 });

        expect(response.status).toBe(400);
        expect(queueState.calls).toHaveLength(0);
    });

    it("отклоняет невалидный id вебхука схемой", async () => {
        const response = await postWebhook({ content: "hello" }, { path: `/api/webhooks/abc/${WEBHOOK_TOKEN}` });

        expect(response.status).toBe(422);
        expect(queueState.calls).toHaveLength(0);
    });

    it("вырезает неизвестные поля тела и не передаёт их в Discord", async () => {
        const response = await postWebhook({ content: "hello", nitro: true });

        expect(response.status).toBe(202);
        expect(queueState.calls[0]!.data.body).toEqual({ content: "hello" });
    });

    it("отклоняет слишком длинный content", async () => {
        const response = await postWebhook({ content: "x".repeat(2001) });

        expect(response.status).toBe(422);
        expect(queueState.calls).toHaveLength(0);
    });

    it("возвращает 429 при превышении лимита", async () => {
        redisState.evalResult = [4, 30_000];

        const response = await postWebhook({ content: "hello" });

        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("30");
        expect((await response.json()) as { retryAfter: number }).toMatchObject({
            error: "Rate limit exceeded",
            retryAfter: 30,
        });
        expect(queueState.calls).toHaveLength(0);
    });

    it("возвращает 503, если лимитер недоступен", async () => {
        redisState.evalThrows = true;

        const response = await postWebhook({ content: "hello" });

        expect(response.status).toBe(503);
        expect((await response.json()) as { error: string }).toMatchObject({
            error: "Rate limiter is temporarily unavailable",
        });
        expect(queueState.calls).toHaveLength(0);
    });

    it("возвращает 503 при переполнении очереди", async () => {
        queueState.backlog = 5;

        const response = await postWebhook({ content: "hello" });

        expect(response.status).toBe(503);
        expect((await response.json()) as { error: string }).toMatchObject({ error: "Webhook queue is overloaded" });
        expect(queueState.calls).toHaveLength(0);
    });

    it("возвращает 503, если постановка в очередь упала", async () => {
        queueState.addThrows = true;

        const response = await postWebhook({ content: "hello" });

        expect(response.status).toBe(503);
        expect((await response.json()) as { error: string }).toMatchObject({
            error: "Webhook queue is temporarily unavailable",
        });
    });
});

describe("health", () => {
    it("GET /health/live всегда отвечает ok", async () => {
        const response = await get("/health/live");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ status: "ok" });
    });

    it("GET /health/ready отвечает ready при живом Redis", async () => {
        const response = await get("/health/ready");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ status: "ready" });
    });

    it("GET /health/ready отвечает 503, если Redis упал", async () => {
        redisState.pingThrows = true;

        const response = await get("/health/ready");

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ status: "unavailable" });
    });

    it("GET /health/ready отвечает 503 на неожиданный ответ PING", async () => {
        redisState.pingResult = "NOPE";

        const response = await get("/health/ready");

        expect(response.status).toBe(503);
    });
});
