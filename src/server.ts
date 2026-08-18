import { app } from "./app";
import { env } from "./core/env";
import { logger } from "./core/logger";

app.listen(env.appPort);
logger.info("API запущено", { port: env.appPort });
