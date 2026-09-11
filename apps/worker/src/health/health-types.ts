export type WorkerProcessState = 'starting' | 'running' | 'stopping' | 'stopped' | 'crashed';
export type WhatsAppConnectionState =
  | 'BOOT'
  | 'INITIALIZING'
  | 'AUTH_LOADING'
  | 'QR_REQUIRED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'LOGGED_OUT'
  | 'FATAL_ERROR'
  | 'STOPPING';

export interface HealthLivenessResponse {
  ok: true;
  service: 'wp9-worker';
  status: 'alive';
  uptimeSeconds: number;
  timestamp: string;
}

export interface HealthReadinessResponse {
  ok: boolean;
  ready: boolean;
  worker: 'ready' | 'starting' | 'degraded' | 'not_ready';
  whatsapp: 'connected' | 'connecting' | 'reconnecting' | 'qr_required' | 'initializing' | 'logged_out' | 'error';
  database: 'healthy' | 'unhealthy' | 'disconnected';
  auth: 'valid' | 'awaiting_scan' | 'expired' | 'corrupted' | 'none';
  queue: 'healthy' | 'degraded' | 'unavailable';
  timestamp: string;
}

export interface HealthDetailsResponse {
  service: 'wp9-worker';
  version: string;
  uptimeSeconds: number;
  pid: number;
  process: {
    status: WorkerProcessState;
    memoryUsageMb: number;
  };
  http: {
    status: 'healthy' | 'degraded' | 'unreachable';
    port: number;
    host: string;
  };
  whatsapp: {
    status: string;
    phone: string | null;
    qrDataUrl: string | null;
    pairingCode: string | null;
    lastConnectedAt: string | null;
    lastDisconnectAt: string | null;
    reconnectAttempts: number;
  };
  database: {
    status: 'healthy' | 'unhealthy' | 'disconnected';
    latencyMs: number | null;
  };
  auth: {
    status: string;
    source: string;
  };
  queue: {
    status: string;
    pending: number;
    processing: number;
    failed: number;
    deadLetters: number;
  };
  heartbeat: {
    lastHeartbeatAt: string | null;
  };
  lease?: {
    acquired: boolean;
    instanceId: string | null;
    expiresAt: string | null;
  };
}
