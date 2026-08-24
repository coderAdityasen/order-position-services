import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OrderUpdateServiceConfig } from '../src/shared/config';
import type { Logger } from '../src/shared/logger';

export function silentLogger(): Logger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

export function writeTempCsv(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'order-updates-'));
  const filePath = join(dir, 'order_updates.csv');
  writeFileSync(filePath, contents, 'utf8');
  return filePath;
}

export function testOrderConfig(
  overrides: Partial<OrderUpdateServiceConfig> = {},
): OrderUpdateServiceConfig {
  return {
    csvPath: 'unused.csv',
    positionServiceUrl: 'http://127.0.0.1:3000',
    eventsPerSecond: 0,
    sendRetries: 3,
    sendTimeoutMs: 1000,
    healthWaitMs: 0,
    ...overrides,
  };
}
