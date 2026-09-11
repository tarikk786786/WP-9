import type { HealthDetailsResponse, HealthLivenessResponse, HealthReadinessResponse } from './health-types';

export function buildLivenessSnapshot(uptimeMs: number): HealthLivenessResponse {
  return {
    ok: true,
    service: 'wp9-worker',
    status: 'alive',
    uptimeSeconds: Math.floor(uptimeMs / 1000),
    timestamp: new Date().toISOString(),
  };
}

export function buildReadinessSnapshot(input: {
  connected: boolean;
  phase: string;
  persisted: boolean;
  databaseHealthy: boolean;
  failedOutboxCount: number;
}): HealthReadinessResponse {
  const isConnected = input.connected;
  const isQr = input.phase === 'QR_REQUIRED' || input.phase === 'qr';
  const isConnecting = input.phase === 'CONNECTING' || input.phase === 'RECONNECTING' || input.phase === 'connecting';
  const isLoggedOut = input.phase === 'LOGGED_OUT' || input.phase === 'logged_out';

  const whatsappStatus = isConnected
    ? 'connected'
    : isQr
      ? 'qr_required'
      : isConnecting
        ? 'reconnecting'
        : isLoggedOut
          ? 'logged_out'
          : 'initializing';

  const isReady = isConnected && input.databaseHealthy;

  return {
    ok: isReady,
    ready: isReady,
    worker: 'ready',
    whatsapp: whatsappStatus,
    database: input.databaseHealthy ? 'healthy' : 'unhealthy',
    auth: input.persisted || isConnected ? 'valid' : isQr ? 'awaiting_scan' : 'none',
    queue: input.failedOutboxCount > 5 ? 'degraded' : 'healthy',
    timestamp: new Date().toISOString(),
  };
}
