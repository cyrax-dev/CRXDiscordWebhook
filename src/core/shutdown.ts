import { env } from "./env";
import { logger } from "./logger";

export function registerShutdown(service: string, close: () => Promise<void>): void {
    let shuttingDown = false;

    const shutdown = async (signal: string) => {
        if (shuttingDown) {
            return;
        }

        shuttingDown = true;

        logger.info("Shutdown started", { service, signal });

        const timeout = setTimeout(() => {
            logger.error("Shutdown timed out", { service, timeoutMs: env.shutdownTimeoutMs });
            process.exit(1);
        }, env.shutdownTimeoutMs);

        try {
            await close();
            clearTimeout(timeout);

            logger.info("Shutdown completed", { service });
            process.exit(0);
        } catch (error) {
            clearTimeout(timeout);

            logger.error("Shutdown failed", { service, error });

            process.exit(1);
        }
    };

    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
}
