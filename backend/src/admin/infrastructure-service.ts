import os from 'os';
import net from 'net';
import Redis from 'ioredis';
import { getWorkersTelemetry } from '../media/worker-manager';
import { roomManager } from '../rooms/room-manager';
import { getSocketTelemetry } from '../server/socket';
import { getApiMetricsSnapshot, getRecentSystemLogs } from '../middleware/api-metrics';
import { getDbMetrics, pingDatabase } from '../db/database';
import { adminStore } from '../db/repositories/admin-store';

let redisClient: Redis | null = null;

function getOrCreateRedisProbe(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!redisClient) {
    redisClient = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1500,
      enableOfflineQueue: false,
    });
    redisClient.on('error', () => {
      // Handled gracefully during probe calls
    });
  }
  return redisClient;
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 2000): Promise<{ ok: boolean; latencyMs: number; data?: any; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: controller.signal });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return { ok: false, latencyMs, error: `HTTP ${res.status}` };
    }
    const text = await res.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
      // Plain text health endpoint
    }
    return { ok: true, latencyMs, data };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err?.name === 'AbortError' ? 'Timeout' : (err?.message || 'Unreachable') };
  } finally {
    clearTimeout(timer);
  }
}

function tcpProbe(host: string, port: number, timeoutMs = 1500): Promise<{ reachable: boolean; latencyMs: number; error?: string }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const finish = (reachable: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ reachable, latencyMs: Date.now() - start, error });
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false, 'Connection timeout'));
    socket.once('error', (err) => finish(false, err.message));
    socket.connect(port, host);
  });
}

function parseRedisInfo(infoText: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of infoText.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx > 0) {
      map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return map;
}

export class InfrastructureService {
  public async getSfuStatus() {
    const [workers, rooms] = await Promise.all([
      getWorkersTelemetry(),
      Promise.resolve(roomManager.getActiveRoomsTelemetry()),
    ]);

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMemPct = Number((((totalMem - freeMem) / totalMem) * 100).toFixed(1));
    const load1m = os.loadavg()[0] || 0;
    const cpuCount = Math.max(1, os.cpus().length);
    const cpuUtilizationPct = Number(Math.min(100, (load1m / cpuCount) * 100).toFixed(1));

    const totalTransports = rooms.reduce((s, r) => s + r.transports, 0);
    const totalProducers = rooms.reduce((s, r) => s + r.producers, 0);
    const totalConsumers = rooms.reduce((s, r) => s + r.consumers, 0);
    const totalParticipants = rooms.reduce((s, r) => s + r.participantCount, 0);
    const activeWorkers = workers.filter((w) => !w.closed).length;

    const status = workers.length === 0
      ? 'standby'
      : activeWorkers === workers.length
        ? 'healthy'
        : activeWorkers > 0
          ? 'degraded'
          : 'unavailable';

    return {
      status,
      servers: [
        {
          nodeId: process.env.SFU_NODE_ID || os.hostname(),
          region: process.env.SERVER_REGION || 'default',
          status,
          cpuCount,
          cpuUtilizationPct,
          memoryUsedPct: usedMemPct,
          memoryTotalMb: Math.round(totalMem / (1024 * 1024)),
          memoryFreeMb: Math.round(freeMem / (1024 * 1024)),
          workerCount: workers.length,
          activeWorkers,
          activeRooms: rooms.length,
          activeParticipants: totalParticipants,
          activeTransports: totalTransports,
          activeProducers: totalProducers,
          activeConsumers: totalConsumers,
          rtcPortRange: `${process.env.MEDIASOUP_MIN_PORT || 10000}-${process.env.MEDIASOUP_MAX_PORT || 10100}`,
          workers,
          rooms,
        },
      ],
      note:
        workers.length === 0
          ? 'Mediasoup SFU workers are not currently running in this process (test mode or startup fallback). External SFU nodes can be registered via SFU_NODES_JSON.'
          : null,
    };
  }

  public async getJitsiStatus() {
    const jvbUrl = process.env.JITSI_JVB_COLIBRI_URL;
    const prosodyUrl = process.env.JITSI_PROSODY_HEALTH_URL;
    const jicofoUrl = process.env.JITSI_JICOFO_HEALTH_URL;

    if (!jvbUrl && !prosodyUrl && !jicofoUrl) {
      return {
        status: 'not_configured',
        configured: false,
        components: {
          jvb: { configured: false, status: 'not_configured', activeConferences: null, activeParticipants: null },
          prosody: { configured: false, status: 'not_configured' },
          jicofo: { configured: false, status: 'not_configured' },
        },
        documentation:
          'Set JITSI_JVB_COLIBRI_URL (e.g. http://127.0.0.1:8080/colibri/stats), JITSI_PROSODY_HEALTH_URL, and JITSI_JICOFO_HEALTH_URL to collect live Jitsi component metrics.',
      };
    }

    const [jvb, prosody, jicofo] = await Promise.all([
      jvbUrl ? fetchJsonWithTimeout(jvbUrl) : Promise.resolve(null),
      prosodyUrl ? fetchJsonWithTimeout(prosodyUrl) : Promise.resolve(null),
      jicofoUrl ? fetchJsonWithTimeout(jicofoUrl) : Promise.resolve(null),
    ]);

    const jvbData = jvb?.ok && typeof jvb.data === 'object' ? jvb.data : null;
    const components = {
      jvb: jvbUrl
        ? {
            configured: true,
            status: jvb?.ok ? 'healthy' : 'unavailable',
            latencyMs: jvb?.latencyMs ?? null,
            error: jvb?.error || null,
            activeConferences: jvbData?.conferences ?? null,
            activeParticipants: jvbData?.participants ?? null,
            bitRateDownload: jvbData?.bit_rate_download ?? null,
            bitRateUpload: jvbData?.bit_rate_upload ?? null,
            stressLevel: jvbData?.stress_level ?? null,
          }
        : { configured: false, status: 'not_configured', activeConferences: null, activeParticipants: null },
      prosody: prosodyUrl
        ? {
            configured: true,
            status: prosody?.ok ? 'healthy' : 'unavailable',
            latencyMs: prosody?.latencyMs ?? null,
            error: prosody?.error || null,
          }
        : { configured: false, status: 'not_configured' },
      jicofo: jicofoUrl
        ? {
            configured: true,
            status: jicofo?.ok ? 'healthy' : 'unavailable',
            latencyMs: jicofo?.latencyMs ?? null,
            error: jicofo?.error || null,
          }
        : { configured: false, status: 'not_configured' },
    };

    const anyConfiguredUnhealthy =
      (components.jvb.configured && components.jvb.status !== 'healthy') ||
      (components.prosody.configured && components.prosody.status !== 'healthy') ||
      (components.jicofo.configured && components.jicofo.status !== 'healthy');

    return {
      status: anyConfiguredUnhealthy ? 'degraded' : 'healthy',
      configured: true,
      components,
    };
  }

  public async getTurnStatus() {
    const turnHost = process.env.TURN_HOST;
    const turnPort = Number(process.env.TURN_PORT || 3478);
    const turnMetricsUrl = process.env.TURN_METRICS_URL;

    if (!turnHost && !turnMetricsUrl) {
      return {
        status: 'not_configured',
        configured: false,
        host: 'turn.faceonn.com',
        port: turnPort,
        reachable: null,
        latencyMs: null,
        activeAllocations: null,
        authFailures: null,
        relayFailures: null,
        documentation:
          'Set TURN_HOST (e.g. turn.faceonn.com), TURN_PORT (3478/5349), and optionally TURN_METRICS_URL (coturn prometheus exporter) to monitor TURN health.',
      };
    }

    const probe = turnHost ? await tcpProbe(turnHost, turnPort) : null;
    const metrics = turnMetricsUrl ? await fetchJsonWithTimeout(turnMetricsUrl) : null;

    return {
      status: (probe && !probe.reachable) || (metrics && !metrics.ok) ? 'unavailable' : 'healthy',
      configured: true,
      host: turnHost || 'turn.faceonn.com',
      port: turnPort,
      reachable: probe ? probe.reachable : null,
      latencyMs: probe ? probe.latencyMs : metrics?.latencyMs ?? null,
      error: probe?.error || metrics?.error || null,
      activeAllocations: metrics?.ok && typeof metrics.data === 'object' ? (metrics.data.allocations ?? null) : null,
      bandwidthKbps: metrics?.ok && typeof metrics.data === 'object' ? (metrics.data.bandwidthKbps ?? null) : null,
      authFailures: metrics?.ok && typeof metrics.data === 'object' ? (metrics.data.authFailures ?? null) : null,
      relayFailures: metrics?.ok && typeof metrics.data === 'object' ? (metrics.data.relayFailures ?? null) : null,
    };
  }

  public async getRedisStatus() {
    const url = process.env.REDIS_URL;
    if (!url) {
      return {
        status: 'not_configured',
        configured: false,
        connected: false,
        latencyMs: null,
        memoryUsedBytes: null,
        memoryUsedHuman: null,
        connectedClients: null,
        commandsPerSec: null,
        cacheHitRatePercent: null,
        keyCount: null,
        pubsubChannels: null,
        error: null,
        documentation: 'Configure REDIS_URL (e.g. redis://127.0.0.1:6379) to enable live Redis telemetry and Socket.IO scaling.',
      };
    }

    const client = getOrCreateRedisProbe();
    if (!client) {
      return { status: 'unavailable', configured: true, connected: false, error: 'Failed to create Redis client' };
    }

    const start = Date.now();
    try {
      if (client.status === 'wait') {
        await client.connect();
      }
      await client.ping();
      const latencyMs = Date.now() - start;
      const [infoText, dbSize] = await Promise.all([client.info(), client.dbsize()]);
      const info = parseRedisInfo(infoText);
      const hits = Number(info.keyspace_hits || 0);
      const misses = Number(info.keyspace_misses || 0);
      const hitRate = hits + misses > 0 ? Number(((hits / (hits + misses)) * 100).toFixed(1)) : null;

      return {
        status: 'healthy',
        configured: true,
        connected: true,
        latencyMs,
        memoryUsedBytes: Number(info.used_memory || 0),
        memoryUsedHuman: info.used_memory_human || null,
        connectedClients: Number(info.connected_clients || 0),
        commandsPerSec: Number(info.instantaneous_ops_per_sec || 0),
        cacheHitRatePercent: hitRate,
        keyCount: dbSize,
        pubsubChannels: Number(info.pubsub_channels || 0),
        redisVersion: info.redis_version || null,
        error: null,
      };
    } catch (err: any) {
      return {
        status: 'unavailable',
        configured: true,
        connected: false,
        latencyMs: Date.now() - start,
        memoryUsedBytes: null,
        memoryUsedHuman: null,
        connectedClients: null,
        commandsPerSec: null,
        cacheHitRatePercent: null,
        keyCount: null,
        pubsubChannels: null,
        error: err?.message || 'Redis unreachable',
      };
    }
  }

  public async getApiAndDbStatus() {
    const [api, dbPing] = await Promise.all([
      Promise.resolve(getApiMetricsSnapshot()),
      pingDatabase(),
    ]);
    const db = getDbMetrics();
    return {
      api,
      database: {
        ...db,
        pingOk: dbPing.ok,
        pingLatencyMs: dbPing.latencyMs,
        pingError: dbPing.error || null,
      },
      socketIo: getSocketTelemetry(),
      process: {
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
        rssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / (1024 * 1024)),
        uptimeSeconds: Math.floor(process.uptime()),
      },
    };
  }

  public async getOverview() {
    const [sfu, jitsi, turn, redis, apiDb, openAlerts] = await Promise.all([
      this.getSfuStatus(),
      this.getJitsiStatus(),
      this.getTurnStatus(),
      this.getRedisStatus(),
      this.getApiAndDbStatus(),
      adminStore.listAlerts('open'),
    ]);

    const criticalCount = openAlerts.filter((a) => a.severity === 'critical').length;
    const anyDown =
      sfu.status === 'unavailable' ||
      (redis.configured && !redis.connected) ||
      (jitsi.configured && jitsi.status !== 'healthy') ||
      (turn.configured && turn.status !== 'healthy');

    const overallStatus = criticalCount > 0 || anyDown ? 'degraded' : 'healthy';

    return {
      overallStatus,
      timestamp: new Date().toISOString(),
      openAlertsCount: openAlerts.length,
      sfu,
      jitsi,
      turn,
      redis,
      socketIo: apiDb.socketIo,
      api: apiDb.api,
      database: apiDb.database,
      process: apiDb.process,
    };
  }

  public async listAlerts(status?: string) {
    return adminStore.listAlerts(status);
  }

  public async createAlert(input: { source: string; severity: 'info' | 'warning' | 'critical'; title: string; message: string; metadata?: Record<string, unknown> }) {
    const alert = await adminStore.createAlert({
      source: input.source,
      severity: input.severity,
      title: input.title,
      message: input.message,
      metadata: input.metadata || {},
    });
    await adminStore.createNotification({
      category: 'infrastructure',
      severity: input.severity,
      title: `Infrastructure Alert: ${input.title}`,
      message: input.message,
      target_permission: 'infrastructure:view',
      metadata: { alertId: alert.id, source: input.source },
    }).catch(() => {});
    return alert;
  }

  public async acknowledgeAlert(id: string, actorId: string) {
    const updated = await adminStore.updateAlertStatus(id, 'acknowledged', actorId);
    if (!updated) {
      const err: any = new Error('Alert not found');
      err.statusCode = 404;
      throw err;
    }
    return updated;
  }

  public async resolveAlert(id: string, actorId: string) {
    const updated = await adminStore.updateAlertStatus(id, 'resolved', actorId);
    if (!updated) {
      const err: any = new Error('Alert not found');
      err.statusCode = 404;
      throw err;
    }
    return updated;
  }

  public getSystemLogs(filters?: { level?: string; source?: string; limit?: number }) {
    return getRecentSystemLogs(filters);
  }
}

export const infrastructureService = new InfrastructureService();

