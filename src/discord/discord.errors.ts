export class DiscordRequestError extends Error {
    constructor(
        message: string,
        readonly status: number | null,
        readonly retryable: boolean,
        readonly retryAfterMs?: number,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = "DiscordRequestError";
    }
}
