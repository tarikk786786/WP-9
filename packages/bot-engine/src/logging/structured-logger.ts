export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntry {
  level: LogLevel;
  time: string;
  traceId?: string;
  turnId?: string;
  eventId?: string;
  responseId?: string;
  chatId?: string;
  stage?: string;
  durationMs?: number;
  status?: string;
  message: string;
  error?: string;
  extra?: Record<string, unknown>;
}

const REDACTION_PATTERNS = [
  /bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/gi,
  /(?:password|secret|api[_-]?key|token)\s*[:=]\s*['"]?([^\s'"]+)['"]?/gi,
  /(?:rnd_[A-Za-z0-9]+|sk-[A-Za-z0-9]+|gsk_[A-Za-z0-9]+)/g,
];

export function redactLogData(input: string): string {
  let clean = input;
  for (const pattern of REDACTION_PATTERNS) {
    clean = clean.replace(pattern, "[REDACTED]");
  }
  return clean;
}

export class StructuredLogger {
  private level: LogLevel = "info";

  constructor(level: LogLevel = "info") {
    this.level = level;
  }

  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const order: Record<LogLevel, number> = {
      trace: 10,
      debug: 20,
      info: 30,
      warn: 40,
      error: 50,
      fatal: 60,
    };
    return order[level] >= order[this.level];
  }

  public log(entry: Omit<LogEntry, "time">): void {
    if (!this.shouldLog(entry.level)) return;

    const fullEntry: LogEntry = {
      ...entry,
      time: new Date().toISOString(),
      message: redactLogData(entry.message),
    };

    if (fullEntry.error) {
      fullEntry.error = redactLogData(fullEntry.error);
    }

    const line = JSON.stringify(fullEntry);
    if (entry.level === "error" || entry.level === "fatal") {
      console.error(line);
    } else if (entry.level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  public info(message: string, context?: Partial<LogEntry>): void {
    this.log({ level: "info", message, ...context });
  }

  public warn(message: string, context?: Partial<LogEntry>): void {
    this.log({ level: "warn", message, ...context });
  }

  public error(message: string, error?: unknown, context?: Partial<LogEntry>): void {
    const errorMsg = error instanceof Error ? error.stack || error.message : String(error);
    this.log({ level: "error", message, error: errorMsg, ...context });
  }
}

export const logger = new StructuredLogger("info");
