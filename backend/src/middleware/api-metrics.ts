import { Request, Response, NextFunction } from 'express';

interface RequestSample {
  ts: number;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}

interface EndpointAgg {
  route: string;
  count: number;
  totalMs: number;
  maxMs: number;
  errors: number;
}

export interface SystemLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
  meta?: Record<string, unknown>;
}

const samples: RequestSample[] = [];
const endpointMap = new Map<string, EndpointAgg>();
const recentLogs: SystemLogEntry[] = [];
let totalRequests = 0;
let count4xx = 0;
let count5xx = 0;
let logSeq = 0;

const MAX_SAMPLES = 2000;
const MAX_LOGS = 300;

export function pushSystemLog(
  level: 'info' | 'warn' | 'error',
  source: string,
  message: string,
  meta?: Record<string, unknown>
): void {
  logSeq += 1;
  recentLogs.unshift({
    id: `log-${Date.now()}-${logSeq}`,
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    meta,
  });
  if (recentLogs.length > MAX_LOGS) {
    recentLogs.pop();
  }
}

function normalizePath(path: string): string {
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/[a-z0-9]{3}-[a-z0-9]{3}-[a-z0-9]{3}\b/gi, '/:roomId');
}

export function apiMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startNs = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
    const statusCode = res.statusCode;
    const route = `${req.method} ${normalizePath(req.baseUrl + (req.path || ''))}`;

    totalRequests += 1;
    if (statusCode >= 400 && statusCode < 500) count4xx += 1;
    if (statusCode >= 500) {
      count5xx += 1;
      pushSystemLog('error', 'api', `HTTP ${statusCode} on ${route}`, { durationMs: Number(durationMs.toFixed(2)) });
    } else if (durationMs > 1000) {
      pushSystemLog('warn', 'api', `Slow endpoint ${route} (${durationMs.toFixed(0)}ms)`, { statusCode });
    }

    samples.push({
      ts: Date.now(),
      method: req.method,
      route,
      statusCode,
      durationMs,
    });
    if (samples.length > MAX_SAMPLES) {
      samples.shift();
    }

    const agg = endpointMap.get(route) || { route, count: 0, totalMs: 0, maxMs: 0, errors: 0 };
    agg.count += 1;
    agg.totalMs += durationMs;
    if (durationMs > agg.maxMs) agg.maxMs = durationMs;
    if (statusCode >= 400) agg.errors += 1;
    endpointMap.set(route, agg);
  });

  next();
}

export function getApiMetricsSnapshot() {
  const now = Date.now();
  const lastMinute = samples.filter((s) => now - s.ts <= 60_000);
  const durations = samples.map((s) => s.durationMs).sort((a, b) => a - b);

  const avgMs = durations.length ? durations.reduce((sum, v) => sum + v, 0) / durations.length : 0;
  const p95Ms = durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] : 0;
  const p99Ms = durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.99))] : 0;

  const slowEndpoints = Array.from(endpointMap.values())
    .map((e) => ({
      route: e.route,
      count: e.count,
      avgMs: Number((e.totalMs / e.count).toFixed(2)),
      maxMs: Number(e.maxMs.toFixed(2)),
      errors: e.errors,
    }))
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 12);

  return {
    totalRequests,
    requestsPerMinute: lastMinute.length,
    requestsPerSecond: Number((lastMinute.length / 60).toFixed(2)),
    avgResponseTimeMs: Number(avgMs.toFixed(2)),
    p95LatencyMs: Number(p95Ms.toFixed(2)),
    p99LatencyMs: Number(p99Ms.toFixed(2)),
    http4xx: count4xx,
    http5xx: count5xx,
    errorRatePercent: totalRequests > 0 ? Number((((count4xx + count5xx) / totalRequests) * 100).toFixed(2)) : 0,
    slowEndpoints,
    uptimeSeconds: Math.floor(process.uptime()),
  };
}

export function getRecentSystemLogs(filters?: { level?: string; source?: string; limit?: number }): SystemLogEntry[] {
  const limit = Math.min(300, Math.max(1, filters?.limit || 100));
  return recentLogs
    .filter((entry) => {
      if (filters?.level && entry.level !== filters.level) return false;
      if (filters?.source && entry.source !== filters.source) return false;
      return true;
    })
    .slice(0, limit);
}

