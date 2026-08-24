import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { processOrderUpdates } from '../src/order-update-service/processor';
import { createPositionApp } from '../src/position-service/app';
import { PositionStore } from '../src/position-service/store';
import { silentLogger, testOrderConfig, writeTempCsv } from './helpers';

async function listen(): Promise<{ server: Server; url: string; app: ReturnType<typeof createPositionApp> }> {
  const app = createPositionApp(new PositionStore(), silentLogger());
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}`, app };
}

describe('end-to-end HTTP flow', () => {
  it('streams a CSV into the position service and serves GET /position', async () => {
    const { server, url, app } = await listen();
    const csvPath = writeTempCsv(`event_id,symbol,transaction_type,quantity
evt-0001,RELIANCE,BUY,90
bad-row,TCS,HOLD,75
evt-0002,TCS,SELL,75
evt-0002,TCS,BUY,100
evt-0003,INFY,BUY,10
evt-0004,INFY,SELL,10
`);

    try {
      const stats = await processOrderUpdates(
        testOrderConfig({
          csvPath,
          positionServiceUrl: url,
        }),
        { logger: silentLogger(), sleep: async () => undefined },
      );

      expect(stats.accepted).toBe(5);
      expect(stats.rejected).toBe(1);
      expect(stats.duplicates).toBe(1);
      expect(stats.sent).toBe(4);

      const res = await request(app).get('/position');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        RELIANCE: 90,
        TCS: -75,
        INFY: 0,
      });
    } finally {
      server.close();
      await once(server, 'close');
    }
  });
});
