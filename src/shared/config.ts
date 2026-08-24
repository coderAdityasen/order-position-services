export type PositionServiceConfig = {
  host: string;
  port: number;
};

export type OrderUpdateServiceConfig = {
  csvPath: string;
  positionServiceUrl: string;
  eventsPerSecond: number;
  sendRetries: number;
  sendTimeoutMs: number;
  healthWaitMs: number;
};

function readEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function envNumber(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  opts: { min?: number; integer?: boolean } = {},
): number {
  const raw = readEnv(env, name);
  if (raw === undefined) {
    return fallback;
  }
  const n = Number(raw);
  if (Number.isNaN(n)) {
    throw new Error(`${name} must be a number, got "${raw}"`);
  }
  if (opts.integer && !Number.isInteger(n)) {
    throw new Error(`${name} must be an integer, got "${raw}"`);
  }
  if (opts.min !== undefined && n < opts.min) {
    throw new Error(`${name} must be >= ${opts.min}, got ${n}`);
  }
  return n;
}

export function loadPositionServiceConfig(
  env: NodeJS.ProcessEnv = process.env,
): PositionServiceConfig {
  return {
    host: readEnv(env, 'HOST') ?? '0.0.0.0',
    port: envNumber(env, 'PORT', 3000, { integer: true, min: 1 }),
  };
}

export function loadOrderUpdateServiceConfig(
  env: NodeJS.ProcessEnv = process.env,
): OrderUpdateServiceConfig {
  const url = (readEnv(env, 'POSITION_SERVICE_URL') ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
  return {
    csvPath: readEnv(env, 'CSV_PATH') ?? './data/order_updates.csv',
    positionServiceUrl: url,
    eventsPerSecond: envNumber(env, 'EVENTS_PER_SECOND', 50, { min: 0 }),
    sendRetries: envNumber(env, 'SEND_RETRIES', 5, { integer: true, min: 1 }),
    sendTimeoutMs: envNumber(env, 'SEND_TIMEOUT_MS', 5000, { integer: true, min: 1 }),
    healthWaitMs: envNumber(env, 'HEALTH_WAIT_MS', 10000, { integer: true, min: 0 }),
  };
}
