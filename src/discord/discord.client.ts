import { env } from "../core/env";
import type { WebhookJobData, WebhookJobResult } from "../queue/webhook.types";
import { DiscordRequestError } from "./discord.errors";

const discordApiUrl = "https://discord.com/api/v10";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

async function readResponse(response: Response): Promise<Record<string, unknown>> {
    const value: unknown = await response.json().catch(() => null);
    return isRecord(value) ? value : {};
}

export async function executeDiscordWebhook(data: WebhookJobData): Promise<WebhookJobResult> {
    const url = new URL(
        `${discordApiUrl}/webhooks/${encodeURIComponent(data.webhookId)}/${encodeURIComponent(data.webhookToken)}`,
    );

    url.searchParams.set("wait", "true");

    if (data.query.thread_id) {
        url.searchParams.set("thread_id", data.query.thread_id);
    }

    if (data.query.with_components !== undefined) {
        url.searchParams.set("with_components", String(data.query.with_components));
    }

    let response: Response;

    try {
        response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "CRXDiscordWebhook/1.0",
            },
            body: JSON.stringify(data.body),
            signal: AbortSignal.timeout(env.discordRequestTimeoutMs),
        });
    } catch (cause) {
        throw new DiscordRequestError("Discord request failed", null, true, undefined, { cause });
    }

    const responseBody = await readResponse(response);

    if (response.ok) {
        const messageId = responseBody.id;

        if (typeof messageId !== "string") {
            throw new DiscordRequestError("Discord returned a successful response without a message ID", response.status, false);
        }

        return { messageId };
    }

    const discordMessage =
        typeof responseBody.message === "string" ? responseBody.message : `Discord returned HTTP ${response.status}`;

    if (response.status === 429) {
        const retryAfter = typeof responseBody.retry_after === "number" ? Math.ceil(responseBody.retry_after * 1_000) : 1_000;

        throw new DiscordRequestError(discordMessage, response.status, true, retryAfter);
    }

    throw new DiscordRequestError(discordMessage, response.status, response.status >= 500);
}
