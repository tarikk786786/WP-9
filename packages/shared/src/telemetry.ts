export interface SpanContext {
  traceId: string;
  spanId: string;
  name: string;
  startTime: number;
  attributes: Record<string, string | number | boolean | undefined>;
}

export interface TelemetryMetric {
  name: string;
  value: number;
  unit: 'ms' | 'count' | 'bytes';
  tags?: Record<string, string>;
  timestamp: string;
}

class TelemetryCollector {
  private spans: SpanContext[] = [];
  private metrics: TelemetryMetric[] = [];

  startSpan(name: string, attributes: Record<string, string | number | boolean | undefined> = {}): {
    end: (extraAttributes?: Record<string, string | number | boolean | undefined>) => number;
  } {
    const startTime = Date.now();
    const span: SpanContext = {
      traceId: Math.random().toString(36).substring(2, 15),
      spanId: Math.random().toString(36).substring(2, 10),
      name,
      startTime,
      attributes,
    };
    this.spans.push(span);

    return {
      end: (extraAttributes = {}) => {
        const duration = Date.now() - startTime;
        Object.assign(span.attributes, extraAttributes, { durationMs: duration });
        this.recordMetric({
          name: `span.${name}.duration`,
          value: duration,
          unit: 'ms',
          tags: { spanName: name },
          timestamp: new Date().toISOString(),
        });
        return duration;
      },
    };
  }

  recordMetric(metric: TelemetryMetric): void {
    this.metrics.push(metric);
    if (this.metrics.length > 500) {
      this.metrics.splice(0, 100);
    }
  }

  captureException(error: unknown, context: Record<string, unknown> = {}): void {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[TELEMETRY_ERROR]', err.message, { stack: err.stack, ...context });
  }

  getMetricsSummary(): {
    totalSpans: number;
    recentMetrics: TelemetryMetric[];
  } {
    return {
      totalSpans: this.spans.length,
      recentMetrics: this.metrics.slice(-50),
    };
  }
}

export const telemetry = new TelemetryCollector();
