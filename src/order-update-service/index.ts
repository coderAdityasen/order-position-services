import { loadOrderUpdateServiceConfig } from '../shared/config';
import { createLogger } from '../shared/logger';
import { waitForPositionService } from './client';
import { processOrderUpdates } from './processor';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const logger = createLogger('order-update-service');
  const config = loadOrderUpdateServiceConfig();

  logger.info(`csv=${config.csvPath}`);
  logger.info(`position_service=${config.positionServiceUrl}`);
  logger.info(`max_events_per_second=${config.eventsPerSecond}`);

  await waitForPositionService(config.positionServiceUrl, {
    timeoutMs: config.healthWaitMs,
    sleep,
  });
  logger.info('position service is reachable');

  await processOrderUpdates(config, { logger, sleep });
}

main().catch((err) => {
  const logger = createLogger('order-update-service');
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
