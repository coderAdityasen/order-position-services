import { processOrderUpdates } from '../src/order-update-service/processor';
import type { OrderEvent } from '../src/shared/event';
import { silentLogger, testOrderConfig, writeTempCsv } from './helpers';

describe('Order Update Service CSV processing', () => {
  it('validates rows, skips invalid ones, and continues with later rows', async () => {
    const csvPath = writeTempCsv(`event_id,symbol,transaction_type,quantity
evt-0001,RELIANCE,BUY,90
evt-bad,TCS,HOLD,75
evt-0002,TCS,SELL,75
evt-0003,INFY,BUY,0
evt-0004,HDFCBANK,BUY,60
`);
    const sent: OrderEvent[] = [];
    const logger = silentLogger();

    const stats = await processOrderUpdates(testOrderConfig({ csvPath }), {
      logger,
      send: async (event) => {
        sent.push(event);
        return { status: 'accepted' };
      },
      sleep: async () => undefined,
    });

    expect(stats.accepted).toBe(3);
    expect(stats.rejected).toBe(2);
    expect(stats.sent).toBe(3);
    expect(sent.map((event) => event.event_id)).toEqual(['evt-0001', 'evt-0002', 'evt-0004']);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('rejects blank ids, symbols, and bad quantities without stopping', async () => {
    const csvPath = writeTempCsv(`event_id,symbol,transaction_type,quantity
,RELIANCE,BUY,90
evt-0002,,SELL,75
evt-0003,TCS,BUY,
evt-0004,TCS,BUY,-1
evt-0005,TCS,BUY,1.5
evt-0006,TCS,BUY,abc
evt-0007,INFY,BUY,30
`);
    const sent: OrderEvent[] = [];

    const stats = await processOrderUpdates(testOrderConfig({ csvPath }), {
      logger: silentLogger(),
      send: async (event) => {
        sent.push(event);
        return { status: 'accepted' };
      },
      sleep: async () => undefined,
    });

    expect(stats.rejected).toBe(6);
    expect(stats.accepted).toBe(1);
    expect(sent).toEqual([
      {
        event_id: 'evt-0007',
        symbol: 'INFY',
        transaction_type: 'BUY',
        quantity: 30,
      },
    ]);
  });

  it('sends only the first valid event for a duplicate event_id', async () => {
    const csvPath = writeTempCsv(`event_id,symbol,transaction_type,quantity
evt-0001,RELIANCE,BUY,90
evt-0001,TCS,SELL,5
evt-0002,HDFCBANK,BUY,60
`);
    const sent: OrderEvent[] = [];

    const stats = await processOrderUpdates(testOrderConfig({ csvPath }), {
      logger: silentLogger(),
      send: async (event) => {
        sent.push(event);
        return { status: 'accepted' };
      },
      sleep: async () => undefined,
    });

    expect(stats.duplicates).toBe(1);
    expect(sent).toEqual([
      {
        event_id: 'evt-0001',
        symbol: 'RELIANCE',
        transaction_type: 'BUY',
        quantity: 90,
      },
      {
        event_id: 'evt-0002',
        symbol: 'HDFCBANK',
        transaction_type: 'BUY',
        quantity: 60,
      },
    ]);
  });

  it('lets a later valid row win if the first row with that event_id was invalid', async () => {
    const csvPath = writeTempCsv(`event_id,symbol,transaction_type,quantity
evt-0001,,BUY,90
evt-0001,RELIANCE,BUY,90
`);
    const sent: OrderEvent[] = [];

    await processOrderUpdates(testOrderConfig({ csvPath }), {
      logger: silentLogger(),
      send: async (event) => {
        sent.push(event);
        return { status: 'accepted' };
      },
      sleep: async () => undefined,
    });

    expect(sent).toEqual([
      {
        event_id: 'evt-0001',
        symbol: 'RELIANCE',
        transaction_type: 'BUY',
        quantity: 90,
      },
    ]);
  });

  it('does not load the whole CSV up front: rows are yielded one at a time', async () => {
    const csvPath = writeTempCsv(`event_id,symbol,transaction_type,quantity
evt-0001,RELIANCE,BUY,90
evt-0002,TCS,SELL,75
evt-0003,INFY,BUY,30
`);
    const seenCounts: number[] = [];

    await processOrderUpdates(testOrderConfig({ csvPath }), {
      logger: silentLogger(),
      send: async () => {
        seenCounts.push(seenCounts.length + 1);
        return { status: 'accepted' };
      },
      sleep: async () => undefined,
    });

    expect(seenCounts).toEqual([1, 2, 3]);
  });
});
