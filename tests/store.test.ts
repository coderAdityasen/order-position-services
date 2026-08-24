import { PositionStore } from '../src/position-service/store';
import type { OrderEvent } from '../src/shared/event';

function event(overrides: Partial<OrderEvent> = {}): OrderEvent {
  return {
    event_id: 'evt-1',
    symbol: 'RELIANCE',
    transaction_type: 'BUY',
    quantity: 10,
    ...overrides,
  };
}

describe('PositionStore', () => {
  it('increases position on BUY and decreases on SELL', () => {
    const store = new PositionStore();
    expect(store.apply(event({ event_id: 'e1', quantity: 90 })).position).toBe(90);
    expect(
      store.apply(
        event({
          event_id: 'e2',
          transaction_type: 'SELL',
          quantity: 25,
        }),
      ).position,
    ).toBe(65);
    expect(store.snapshot()).toEqual({ RELIANCE: 65 });
  });

  it('tracks multiple symbols, including negative and zero nets', () => {
    const store = new PositionStore();
    store.apply(event({ event_id: 'a', symbol: 'RELIANCE', quantity: 90 }));
    store.apply(
      event({
        event_id: 'b',
        symbol: 'TCS',
        transaction_type: 'SELL',
        quantity: 75,
      }),
    );
    store.apply(
      event({
        event_id: 'c',
        symbol: 'INFY',
        quantity: 10,
      }),
    );
    store.apply(
      event({
        event_id: 'd',
        symbol: 'INFY',
        transaction_type: 'SELL',
        quantity: 10,
      }),
    );

    expect(store.snapshot()).toEqual({
      RELIANCE: 90,
      TCS: -75,
      INFY: 0,
    });
  });

  it('ignores later events with the same event_id even if fields differ', () => {
    const store = new PositionStore();
    const first = store.apply(event({ event_id: 'evt-1', symbol: 'RELIANCE', quantity: 90 }));
    const second = store.apply(
      event({
        event_id: 'evt-1',
        symbol: 'TCS',
        transaction_type: 'SELL',
        quantity: 5,
      }),
    );

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(store.snapshot()).toEqual({ RELIANCE: 90 });
    expect(store.hasEvent('evt-1')).toBe(true);
  });

  it('does not occupy an event_id until an event is applied', () => {
    const store = new PositionStore();
    expect(store.hasEvent('evt-1')).toBe(false);
    store.apply(event({ event_id: 'evt-1' }));
    expect(store.hasEvent('evt-1')).toBe(true);
  });
});
