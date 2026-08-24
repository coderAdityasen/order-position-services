import type { OrderUpdateServiceConfig } from '../shared/config';
import { parseOrderEvent, type OrderEvent } from '../shared/event';
import type { Logger } from '../shared/logger';
import { PermanentSendError, sendEventWithRetry, type SendEventResult } from './client';
import { streamCsvRows } from './csv';

export type ProcessStats = {
  accepted: number;
  rejected: number;
  duplicates: number;
  sent: number;
  sendFailures: number;
};

export type ProcessorDeps = {
  logger: Logger;
  send?: (event: OrderEvent) => Promise<SendEventResult>;
  sleep?: (ms: number) => Promise<void>;
};

export async function processOrderUpdates(
  config: OrderUpdateServiceConfig,
  deps: ProcessorDeps,
): Promise<ProcessStats> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const send =
    deps.send ??
    ((event: OrderEvent) =>
      sendEventWithRetry(config.positionServiceUrl, event, {
        timeoutMs: config.sendTimeoutMs,
        retries: config.sendRetries,
        sleep,
        onRetry: (attempt, err, delayMs) => {
          deps.logger.warn(
            `send ${event.event_id} attempt ${attempt} failed: ${err.message}; retrying in ${delayMs}ms`,
          );
        },
      }));

  const stats: ProcessStats = {
    accepted: 0,
    rejected: 0,
    duplicates: 0,
    sent: 0,
    sendFailures: 0,
  };

  const seen = new Set<string>();
  const minIntervalMs = config.eventsPerSecond > 0 ? 1000 / config.eventsPerSecond : 0;
  let lastSendAt = 0;

  for await (const { recordNumber, row } of streamCsvRows(config.csvPath)) {
    const parsed = parseOrderEvent(row);
    if (!parsed.ok) {
      deps.logger.warn(`rejected row ${recordNumber}: ${parsed.reason}`);
      stats.rejected += 1;
      continue;
    }

    const event = parsed.event;
    stats.accepted += 1;
    deps.logger.info(
      `accepted ${event.event_id} ${event.symbol} ${event.transaction_type} ${event.quantity}`,
    );

    if (seen.has(event.event_id)) {
      deps.logger.info(`ignored duplicate event_id ${event.event_id}`);
      stats.duplicates += 1;
      continue;
    }
    seen.add(event.event_id);

    if (minIntervalMs > 0) {
      const wait = lastSendAt + minIntervalMs - Date.now();
      if (wait > 0) {
        await sleep(wait);
      }
    }

    try {
      const result = await send(event);
      lastSendAt = Date.now();
      if (result.status === 'rejected') {
        deps.logger.warn(`position service rejected ${event.event_id}: ${result.reason}`);
        stats.sendFailures += 1;
        continue;
      }
      if (result.status === 'duplicate') {
        deps.logger.info(`position service reported duplicate ${event.event_id}`);
        stats.duplicates += 1;
        stats.sent += 1;
        continue;
      }
      deps.logger.info(`sent ${event.event_id}`);
      stats.sent += 1;
    } catch (err) {
      lastSendAt = Date.now();
      const message = err instanceof Error ? err.message : String(err);
      const kind = err instanceof PermanentSendError ? 'permanent' : 'retryable';
      deps.logger.error(`failed to send ${event.event_id} (${kind}): ${message}`);
      stats.sendFailures += 1;
    }
  }

  deps.logger.info(
    `input processing complete accepted=${stats.accepted} rejected=${stats.rejected} duplicates=${stats.duplicates} sent=${stats.sent} send_failures=${stats.sendFailures}`,
  );
  return stats;
}
