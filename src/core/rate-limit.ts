import type Redis from "ioredis";

import { env } from "./env";

const consumeScript = `
local count = redis.call("INCR", KEYS[1])

if count == 1 then
    redis.call("PEXPIRE", KEYS[1], ARGV[1])
end

local ttl = redis.call("PTTL", KEYS[1])

return { count, ttl }
`;

export interface RateLimitResult {
    allowed: boolean;
    limit: number;
    remaining: number;
    retryAfterSeconds: number;
}

export async function consumeRateLimit(redis: Redis, ip: string): Promise<RateLimitResult> {
    const key = `rate-limit:ip:${ip}`;

    const [count, ttl] = (await redis.eval(consumeScript, 1, key, env.rateLimitWindowMs)) as [number, number];

    return {
        allowed: count <= env.rateLimitMax,
        limit: env.rateLimitMax,
        remaining: Math.max(0, env.rateLimitMax - count),
        retryAfterSeconds: Math.max(1, Math.ceil(ttl / 1_000)),
    };
}
