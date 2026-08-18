import { Elysia } from "elysia";

import { healthRoute } from "./api/health.route";
import { webhooksRoute } from "./api/webhooks.route";

export const app = new Elysia({
    serve: {
        maxRequestBodySize: 64 * 1024,
    },
})
    .use(healthRoute)
    .use(webhooksRoute);
