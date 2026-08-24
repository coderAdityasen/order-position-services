import { loadOrderUpdateServiceConfig, loadPositionServiceConfig } from '../src/shared/config';

describe('service configuration', () => {
  it('uses documented defaults', () => {
    expect(loadPositionServiceConfig({})).toEqual({
      host: '0.0.0.0',
      port: 3000,
    });
    expect(loadOrderUpdateServiceConfig({})).toEqual({
      csvPath: './data/order_updates.csv',
      positionServiceUrl: 'http://127.0.0.1:3000',
      eventsPerSecond: 50,
      sendRetries: 5,
      sendTimeoutMs: 5000,
      healthWaitMs: 10000,
    });
  });

  it('reads overrides from the environment', () => {
    expect(
      loadPositionServiceConfig({
        HOST: '127.0.0.1',
        PORT: '4000',
      }),
    ).toEqual({ host: '127.0.0.1', port: 4000 });

    expect(
      loadOrderUpdateServiceConfig({
        CSV_PATH: 'C:\\data\\orders.csv',
        POSITION_SERVICE_URL: 'http://127.0.0.1:4000/',
        EVENTS_PER_SECOND: '25',
      }),
    ).toMatchObject({
      csvPath: 'C:\\data\\orders.csv',
      positionServiceUrl: 'http://127.0.0.1:4000',
      eventsPerSecond: 25,
    });
  });

  it('rejects invalid numeric configuration', () => {
    expect(() => loadPositionServiceConfig({ PORT: 'abc' })).toThrow(/PORT must be a number/);
    expect(() => loadOrderUpdateServiceConfig({ EVENTS_PER_SECOND: '-1' })).toThrow(
      /EVENTS_PER_SECOND must be >= 0/,
    );
  });
});
