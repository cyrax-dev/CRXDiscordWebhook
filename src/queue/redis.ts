import IORedis from "ioredis";
import { env } from "../core/env";

const commonOptions = {
    connectTimeout: 5_000,
    enableReadyCheck: true,
    lazyConnect: true,
};

export function createProducerConnection() {
    return new IORedis(env.redisUrl, {
        ...commonOptions,
        maxRetriesPerRequest: 1,
    });
}

export function createWorkerConnection() {
    return new IORedis(env.redisUrl, {
        ...commonOptions,
        maxRetriesPerRequest: null,
    });
}
