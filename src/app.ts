import { Elysia } from "elysia";

export const app = new Elysia({
    serve: { maxRequestBodySize: 64 * 1024 }
});
