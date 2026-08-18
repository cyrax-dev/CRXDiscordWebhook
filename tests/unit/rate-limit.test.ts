import { describe, expect, it } from "bun:test";
import type Redis from "ioredis";

import { consumeRateLimit } from "../../src/core/rate-limit";

// RATE_LIMIT_MAX=3, RATE_LIMIT_WINDOW_MS=60000 задаются в tests/setup.ts
const MAX = 3;

function fakeRedis(result: [number, number]) {
    const calls: unknown[][] = [];

    return {
        redis: {
            eval: async (...args: unknown[]) => {
                calls.push(args);
                return result;
            },
        } as unknown as Redis,
        calls,
    };
}

describe("consumeRateLimit", () => {
    it("использует ключ по IP и передаёт окно в PEXPIRE", async () => {
        const { redis, calls } = fakeRedis([1, 60_000]);

        await consumeRateLimit(redis, "1.2.3.4");

        expect(calls).toHaveLength(1);
        expect(calls[0]?.[1]).toBe(1);
        expect(calls[0]?.[2]).toBe("rate-limit:ip:1.2.3.4");
        expect(calls[0]?.[3]).toBe(60_000);
    });

    it("разрешает первый запрос и считает остаток", async () => {
        const { redis } = fakeRedis([1, 60_000]);

        expect(await consumeRateLimit(redis, "1.2.3.4")).toEqual({
            allowed: true,
            limit: MAX,
            remaining: MAX - 1,
            retryAfterSeconds: 60,
        });
    });

    it("разрешает запрос ровно на границе лимита", async () => {
        const { redis } = fakeRedis([MAX, 30_000]);
        const result = await consumeRateLimit(redis, "1.2.3.4");

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(0);
    });

    it("блокирует запрос за границей лимита и не уводит остаток в минус", async () => {
        const { redis } = fakeRedis([MAX + 5, 30_000]);
        const result = await consumeRateLimit(redis, "1.2.3.4");

        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
        expect(result.retryAfterSeconds).toBe(30);
    });

    it("округляет retryAfterSeconds вверх и держит минимум в 1 секунду", async () => {
        expect((await consumeRateLimit(fakeRedis([1, 1_200]).redis, "1.2.3.4")).retryAfterSeconds).toBe(2);
        expect((await consumeRateLimit(fakeRedis([1, 500]).redis, "1.2.3.4")).retryAfterSeconds).toBe(1);
        expect((await consumeRateLimit(fakeRedis([1, -1]).redis, "1.2.3.4")).retryAfterSeconds).toBe(1);
    });

    it("пробрасывает ошибку Redis наружу", async () => {
        const redis = {
            eval: async () => {
                throw new Error("redis down");
            },
        } as unknown as Redis;

        await expect(consumeRateLimit(redis, "1.2.3.4")).rejects.toThrow("redis down");
    });
});
