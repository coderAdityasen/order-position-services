import express, { type ErrorRequestHandler } from 'express';
import { parseOrderEvent } from '../shared/event';
import type { Logger } from '../shared/logger';
import type { PositionStore } from './store';

export function createPositionApp(store: PositionStore, logger: Logger) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/position', (_req, res) => {
    res.json(store.snapshot());
  });

  app.post('/events', (req, res) => {
    const parsed = parseOrderEvent(req.body);
    if (!parsed.ok) {
      logger.warn(`rejected event: ${parsed.reason}`);
      res.status(400).json({ status: 'rejected', reason: parsed.reason });
      return;
    }

    const result = store.apply(parsed.event);
    if (result.duplicate) {
      logger.info(`ignored duplicate event_id ${parsed.event.event_id}`);
      res.status(200).json({
        status: 'duplicate',
        event_id: parsed.event.event_id,
      });
      return;
    }

    logger.info(
      `applied ${parsed.event.event_id} ${parsed.event.symbol} ${parsed.event.transaction_type} ${parsed.event.quantity} position=${result.position}`,
    );
    res.status(202).json({
      status: 'accepted',
      event_id: parsed.event.event_id,
      symbol: parsed.event.symbol,
      position: result.position,
    });
  });

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof SyntaxError) {
      logger.warn('rejected request: malformed JSON');
      res.status(400).json({ status: 'rejected', reason: 'malformed JSON' });
      return;
    }
    logger.error(`unhandled error: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ status: 'error', reason: 'internal error' });
  };
  app.use(errorHandler);

  return app;
}
