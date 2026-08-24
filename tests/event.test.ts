import { parseOrderEvent } from '../src/shared/event';

describe('parseOrderEvent', () => {
  const valid = {
    event_id: 'evt-0001',
    symbol: 'RELIANCE',
    transaction_type: 'BUY',
    quantity: 90,
  };

  it('accepts a valid BUY event with numeric quantity', () => {
    expect(parseOrderEvent(valid)).toEqual({ ok: true, event: valid });
  });

  it('accepts SELL and string quantities from CSV cells', () => {
    expect(
      parseOrderEvent({
        event_id: 'evt-0002',
        symbol: 'TCS',
        transaction_type: 'SELL',
        quantity: '75',
      }),
    ).toEqual({
      ok: true,
      event: {
        event_id: 'evt-0002',
        symbol: 'TCS',
        transaction_type: 'SELL',
        quantity: 75,
      },
    });
  });

  it('preserves symbol case', () => {
    const result = parseOrderEvent({ ...valid, symbol: 'Reliance' });
    expect(result).toEqual({
      ok: true,
      event: { ...valid, symbol: 'Reliance' },
    });
  });

  it('rejects blank event IDs', () => {
    const blank = parseOrderEvent({ ...valid, event_id: '' });
    const whitespace = parseOrderEvent({ ...valid, event_id: '   ' });
    const missing = parseOrderEvent({
      symbol: 'RELIANCE',
      transaction_type: 'BUY',
      quantity: 1,
    });
    expect(blank).toEqual({ ok: false, reason: 'event_id must be a non-empty string' });
    expect(whitespace).toEqual({ ok: false, reason: 'event_id must be a non-empty string' });
    expect(missing).toEqual({ ok: false, reason: 'event_id must be a non-empty string' });
  });

  it('rejects blank symbols', () => {
    const blank = parseOrderEvent({ ...valid, symbol: '' });
    const whitespace = parseOrderEvent({ ...valid, symbol: '  ' });
    expect(blank).toEqual({ ok: false, reason: 'symbol must be a non-empty string' });
    expect(whitespace).toEqual({ ok: false, reason: 'symbol must be a non-empty string' });
  });

  it('rejects invalid transaction types', () => {
    for (const transaction_type of ['HOLD', 'buy', 'Sell', '']) {
      const result = parseOrderEvent({ ...valid, transaction_type });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/transaction_type must be exactly BUY or SELL/);
      }
    }
  });

  it('trims a valid transaction type with surrounding whitespace', () => {
    expect(
      parseOrderEvent({
        ...valid,
        transaction_type: ' BUY ',
      }),
    ).toEqual({ ok: true, event: valid });
  });

  it('rejects zero, negative, non-integer, and blank quantities', () => {
    expect(parseOrderEvent({ ...valid, quantity: 0 })).toEqual({
      ok: false,
      reason: 'quantity must be a positive integer, got 0',
    });
    expect(parseOrderEvent({ ...valid, quantity: -5 })).toEqual({
      ok: false,
      reason: 'quantity must be a positive integer, got -5',
    });
    expect(parseOrderEvent({ ...valid, quantity: '-3' })).toEqual({
      ok: false,
      reason: 'quantity must be a positive integer, got -3',
    });
    expect(parseOrderEvent({ ...valid, quantity: '1.5' })).toEqual({
      ok: false,
      reason: 'quantity must be an integer, got "1.5"',
    });
    expect(parseOrderEvent({ ...valid, quantity: 1.5 })).toEqual({
      ok: false,
      reason: 'quantity must be an integer, got "1.5"',
    });
    expect(parseOrderEvent({ ...valid, quantity: 'abc' })).toEqual({
      ok: false,
      reason: 'quantity must be a number, got "abc"',
    });
    expect(parseOrderEvent({ ...valid, quantity: '' })).toEqual({
      ok: false,
      reason: 'quantity must not be blank',
    });
    expect(parseOrderEvent({ ...valid, quantity: '   ' })).toEqual({
      ok: false,
      reason: 'quantity must not be blank',
    });
    expect(
      parseOrderEvent({
        event_id: 'evt-0001',
        symbol: 'RELIANCE',
        transaction_type: 'BUY',
      }),
    ).toEqual({
      ok: false,
      reason: 'quantity must not be blank',
    });
  });

  it('rejects a non-object payload', () => {
    expect(parseOrderEvent(null)).toEqual({ ok: false, reason: 'event must be an object' });
    expect(parseOrderEvent(['evt-0001'])).toEqual({
      ok: false,
      reason: 'event must be an object',
    });
  });

  it('reports multiple field errors together', () => {
    const result = parseOrderEvent({
      event_id: '',
      symbol: '',
      transaction_type: 'HOLD',
      quantity: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('event_id must be a non-empty string');
      expect(result.reason).toContain('symbol must be a non-empty string');
      expect(result.reason).toContain('transaction_type must be exactly BUY or SELL');
      expect(result.reason).toContain('quantity must be a positive integer, got 0');
    }
  });
});
