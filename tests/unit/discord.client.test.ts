import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { executeDiscordWebhook } from "../../src/discord/discord.client";
import { DiscordRequestError } from "../../src/discord/discord.errors";
import type { WebhookJobData } from "../../src/queue/webhook.types";

const originalFetch = globalThis.fetch;

let calls: { url: string; init: RequestInit }[] = [];

function stubFetch(handler: () => Response | Promise<Response>) {
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        calls.push({ url: String(input), init: init ?? {} });
        return await handler();
    }) as typeof fetch;
}

function jsonResponse(status: number, body: unknown) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function jobData(overrides: Partial<WebhookJobData> = {}): WebhookJobData {
    return {
        requestId: "req-1",
        webhookId: "123456789012345678",
        webhookToken: "abcdefghijklmnopqrstuvwxyz-_.",
        body: { content: "hello" },
        query: {},
        ...overrides,
    };
}

async function expectError(data: WebhookJobData): Promise<DiscordRequestError> {
    const error = await executeDiscordWebhook(data).then(
        () => null,
        (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(DiscordRequestError);

    return error as DiscordRequestError;
}

beforeEach(() => {
    calls = [];
});

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe("executeDiscordWebhook", () => {
    it("возвращает messageId при успешном ответе", async () => {
        stubFetch(() => jsonResponse(200, { id: "999" }));

        expect(await executeDiscordWebhook(jobData())).toEqual({ messageId: "999" });
    });

    it("строит URL вебхука с wait=true и передаёт тело", async () => {
        stubFetch(() => jsonResponse(200, { id: "999" }));

        await executeDiscordWebhook(jobData());

        const call = calls[0]!;
        const url = new URL(call.url);

        expect(url.origin + url.pathname).toBe(
            "https://discord.com/api/v10/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz-_.",
        );
        expect(url.searchParams.get("wait")).toBe("true");
        expect(call.init.method).toBe("POST");
        expect(call.init.body).toBe(JSON.stringify({ content: "hello" }));
    });

    it("прокидывает thread_id и with_components в query", async () => {
        stubFetch(() => jsonResponse(200, { id: "999" }));

        await executeDiscordWebhook(jobData({ query: { thread_id: "876543210987654321", with_components: true } }));

        const url = new URL(calls[0]!.url);

        expect(url.searchParams.get("thread_id")).toBe("876543210987654321");
        expect(url.searchParams.get("with_components")).toBe("true");
    });

    it("не отправляет with_components, если он не задан", async () => {
        stubFetch(() => jsonResponse(200, { id: "999" }));

        await executeDiscordWebhook(jobData());

        expect(new URL(calls[0]!.url).searchParams.has("with_components")).toBe(false);
    });

    it("считает успешный ответ без id неповторяемой ошибкой", async () => {
        stubFetch(() => jsonResponse(200, { ok: true }));

        const error = await expectError(jobData());

        expect(error.retryable).toBe(false);
        expect(error.status).toBe(200);
    });

    it("на 429 отдаёт retryAfterMs из retry_after", async () => {
        stubFetch(() => jsonResponse(429, { message: "You are being rate limited.", retry_after: 1.5 }));

        const error = await expectError(jobData());

        expect(error.status).toBe(429);
        expect(error.retryable).toBe(true);
        expect(error.retryAfterMs).toBe(1_500);
        expect(error.message).toBe("You are being rate limited.");
    });

    it("на 429 без retry_after использует 1000 мс", async () => {
        stubFetch(() => jsonResponse(429, {}));

        expect((await expectError(jobData())).retryAfterMs).toBe(1_000);
    });

    it("считает 5xx повторяемой ошибкой", async () => {
        stubFetch(() => jsonResponse(500, {}));

        const error = await expectError(jobData());

        expect(error.status).toBe(500);
        expect(error.retryable).toBe(true);
        expect(error.retryAfterMs).toBeUndefined();
        expect(error.message).toBe("Discord returned HTTP 500");
    });

    it("считает 4xx неповторяемой ошибкой и берёт message из ответа", async () => {
        stubFetch(() => jsonResponse(400, { message: "Cannot send an empty message" }));

        const error = await expectError(jobData());

        expect(error.status).toBe(400);
        expect(error.retryable).toBe(false);
        expect(error.message).toBe("Cannot send an empty message");
    });

    it("переживает невалидный JSON в теле ошибки", async () => {
        stubFetch(() => new Response("<html>502</html>", { status: 502 }));

        const error = await expectError(jobData());

        expect(error.message).toBe("Discord returned HTTP 502");
        expect(error.retryable).toBe(true);
    });

    it("считает сетевой сбой повторяемой ошибкой без статуса", async () => {
        stubFetch(() => {
            throw new Error("connect ECONNREFUSED");
        });

        const error = await expectError(jobData());

        expect(error.message).toBe("Discord request failed");
        expect(error.status).toBeNull();
        expect(error.retryable).toBe(true);
    });
});
