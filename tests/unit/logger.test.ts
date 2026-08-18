import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { logger } from "../../src/core/logger";

const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
};

type Method = keyof typeof original;

let written: { method: Method; line: string }[] = [];

beforeEach(() => {
    written = [];

    for (const method of Object.keys(original) as Method[]) {
        console[method] = ((line: string) => {
            written.push({ method, line });
        }) as never;
    }
});

afterEach(() => {
    Object.assign(console, original);
});

function lastPayload(): Record<string, unknown> {
    return JSON.parse(written.at(-1)!.line) as Record<string, unknown>;
}

describe("logger", () => {
    it("пишет JSON с уровнем, временем и сообщением", () => {
        logger.info("Сервис запущен");

        const payload = lastPayload();

        expect(payload.level).toBe("info");
        expect(payload.message).toBe("Сервис запущен");

        const time = payload.time as string;
        expect(new Date(time).toISOString()).toBe(time);
    });

    it("разворачивает поля в корень записи", () => {
        logger.warn("Очередь переполнена", { backlog: 42, requestId: "req-1" });

        expect(lastPayload()).toMatchObject({ level: "warn", backlog: 42, requestId: "req-1" });
    });

    it("сериализует Error в name/message/stack", () => {
        logger.error("Упало", { error: new TypeError("boom") });

        const error = lastPayload().error as Record<string, unknown>;

        expect(error.name).toBe("TypeError");
        expect(error.message).toBe("boom");
        expect(typeof error.stack).toBe("string");
    });

    it("маршрутизирует уровни в соответствующие методы console", () => {
        logger.debug("d");
        logger.info("i");
        logger.warn("w");
        logger.error("e");

        expect(written.map((entry) => entry.method)).toEqual(["log", "info", "warn", "error"]);
    });
});
