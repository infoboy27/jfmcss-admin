/**
 * Minimal structured logger — one JSON object per line to stdout/stderr so
 * promtail/Loki can parse it without a regex. No dependency.
 *
 *   log.info("payment reconciled", { invoiceId, amount });
 *   log.error("dunning run failed", err, { event: "cron/dunning" });
 */
type Fields = Record<string, unknown>;

const SERVICE = "jfmcss-control";
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;
const MIN = LEVELS[(process.env.LOG_LEVEL as Level) in LEVELS ? (process.env.LOG_LEVEL as Level) : "info"];

function emit(level: Level, msg: string, fields?: Fields) {
  if (LEVELS[level] < MIN) return;
  const line: Fields = { ts: new Date().toISOString(), level, service: SERVICE, msg, ...fields };
  const s = safeStringify(line);
  if (level === "error" || level === "warn") process.stderr.write(s + "\n");
  else process.stdout.write(s + "\n");
}

function safeStringify(o: unknown): string {
  try {
    return JSON.stringify(o);
  } catch {
    return JSON.stringify({ ts: new Date().toISOString(), level: "error", service: SERVICE, msg: "log serialize failed" });
  }
}

function errFields(err: unknown): Fields {
  if (err instanceof Error) {
    return { err: err.message, errName: err.name, ...(err.stack ? { stack: err.stack.split("\n").slice(0, 4).join(" | ") } : {}) };
  }
  return { err: String(err) };
}

export const log = {
  debug: (msg: string, fields?: Fields) => emit("debug", msg, fields),
  info: (msg: string, fields?: Fields) => emit("info", msg, fields),
  warn: (msg: string, fields?: Fields) => emit("warn", msg, fields),
  error: (msg: string, err?: unknown, fields?: Fields) => emit("error", msg, { ...(err ? errFields(err) : {}), ...fields }),
};
