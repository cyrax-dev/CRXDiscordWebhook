type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function serialize(value: unknown): unknown {
    if (value instanceof Error) {
        return { name: value.name, message: value.message, stack: value.stack };
    }
    return value;
}

function write(level: Level, message: string, fields?: Fields) {
    const payload = fields
        ? Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, serialize(value)]))
        : undefined;

    const method = level === "debug" ? "log" : level;

    console[method](JSON.stringify({ level, time: new Date().toISOString(), message, ...payload }));
}

export const logger = {
    debug: (message: string, fields?: Fields) => write("debug", message, fields),
    info: (message: string, fields?: Fields) => write("info", message, fields),
    warn: (message: string, fields?: Fields) => write("warn", message, fields),
    error: (message: string, fields?: Fields) => write("error", message, fields),
};
