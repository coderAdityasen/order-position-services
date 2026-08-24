import { loadPositionServiceConfig } from '../shared/config';
import { createLogger } from '../shared/logger';
import { createPositionApp } from './app';
import { PositionStore } from './store';

async function main(): Promise<void> {
  const logger = createLogger('position-service');
  const config = loadPositionServiceConfig();
  const store = new PositionStore();
  const app = createPositionApp(store, logger);

  const server = app.listen(config.port, config.host, () => {
    logger.info(`listening on http://${config.host}:${config.port}`);
    logger.info('GET /position and POST /events are ready');
  });

  const shutdown = () => {
    logger.info('shutting down');
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
