import { type Static, t } from "elysia";

const snowflakeSchema = t.String({
    pattern: "^[0-9]{17,20}$",
});

const discordObjectSchema = t.Record(t.String(), t.Unknown());

const allowedMentionsSchema = t.Object(
    {
        parse: t.Optional(
            t.Array(t.Union([t.Literal("everyone"), t.Literal("users"), t.Literal("roles")]), {
                maxItems: 3,
                uniqueItems: true,
            }),
        ),
        users: t.Optional(
            t.Array(snowflakeSchema, {
                maxItems: 100,
                uniqueItems: true,
            }),
        ),
        roles: t.Optional(
            t.Array(snowflakeSchema, {
                maxItems: 100,
                uniqueItems: true,
            }),
        ),
        replied_user: t.Optional(t.Boolean()),
    },
    {
        additionalProperties: false,
    },
);

export const webhookParamsSchema = t.Object(
    {
        id: snowflakeSchema,
        token: t.String({
            minLength: 20,
            maxLength: 200,
            pattern: "^[A-Za-z0-9._-]+$",
        }),
    },
    {
        additionalProperties: false,
    },
);

export const webhookQuerySchema = t.Object(
    {
        thread_id: t.Optional(snowflakeSchema),
        with_components: t.Optional(t.BooleanString()),
    },
    {
        additionalProperties: false,
    },
);

export const webhookBodySchema = t.Object(
    {
        content: t.Optional(
            t.String({
                maxLength: 2000,
            }),
        ),
        username: t.Optional(
            t.String({
                minLength: 1,
                maxLength: 80,
            }),
        ),
        avatar_url: t.Optional(
            t.String({
                format: "uri",
                maxLength: 2048,
            }),
        ),
        tts: t.Optional(t.Boolean()),
        embeds: t.Optional(
            t.Array(discordObjectSchema, {
                maxItems: 10,
            }),
        ),
        allowed_mentions: t.Optional(allowedMentionsSchema),
        components: t.Optional(t.Array(discordObjectSchema)),
        attachments: t.Optional(
            t.Array(discordObjectSchema, {
                maxItems: 10,
            }),
        ),
        flags: t.Optional(
            t.Integer({
                minimum: 0,
            }),
        ),
        thread_name: t.Optional(
            t.String({
                minLength: 1,
                maxLength: 100,
            }),
        ),
        applied_tags: t.Optional(
            t.Array(snowflakeSchema, {
                maxItems: 5,
                uniqueItems: true,
            }),
        ),
        poll: t.Optional(discordObjectSchema),
    },
    {
        additionalProperties: false,
    },
);

export type WebhookParams = Static<typeof webhookParamsSchema>;
export type WebhookQuery = Static<typeof webhookQuerySchema>;
export type WebhookBody = Static<typeof webhookBodySchema>;

export function validateWebhookBody(body: WebhookBody): string | null {
    const hasContent = typeof body.content === "string" && body.content.length > 0;
    const hasEmbeds = body.embeds !== undefined && body.embeds.length > 0;
    const hasComponents = body.components !== undefined && body.components.length > 0;
    const hasPoll = body.poll !== undefined;

    if (!hasContent && !hasEmbeds && !hasComponents && !hasPoll) {
        return "It is necessary to pass content, embeds, components, or a poll.";
    }

    const allowedFlags = 4 | 4096 | 32768;

    if (body.flags !== undefined && (body.flags & ~allowedFlags) !== 0) {
        return "Unsupported flags value passed";
    }

    const usesComponentsV2 = body.flags !== undefined && (body.flags & 32768) !== 0;

    if (
        usesComponentsV2 &&
        (body.content !== undefined || body.embeds !== undefined || body.poll !== undefined || body.attachments !== undefined)
    ) {
        return "IS_COMPONENTS_V2 cannot be used together with content, embeds, poll, or attachments.";
    }

    return null;
}
