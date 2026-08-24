import request from 'supertest';
import { createPositionApp } from '../src/position-service/app';
import { PositionStore } from '../src/position-service/store';
import { silentLogger } from './helpers';

function app() {
  const store = new PositionStore();
  return { store, app: createPositionApp(store, silentLogger()) };
}

describe('Position Maintaining Service HTTP API', () => {
  it('returns an empty object from GET /position before any events', async () => {
    const { app: server } = app();
    const res = await request(server).get('/position');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it('returns current positions from GET /position, including zero nets', async () => {
    const { app: server } = app();

    await request(server).post('/events').send({
      event_id: 'evt-0001',
      symbol: 'RELIANCE',
      transaction_type: 'BUY',
      quantity: 90,
    });
    await request(server).post('/events').send({
      event_id: 'evt-0002',
      symbol: 'TCS',
      transaction_type: 'SELL',
      quantity: 75,
    });
    await request(server).post('/events').send({
      event_id: 'evt-0003',
      symbol: 'INFY',
      transaction_type: 'BUY',
      quantity: 10,
    });
    await request(server).post('/events').send({
      event_id: 'evt-0004',
      symbol: 'INFY',
      transaction_type: 'SELL',
      quantity: 10,
    });

    const res = await request(server).get('/position');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      RELIANCE: 90,
      TCS: -75,
      INFY: 0,
    });
  });

  it('accepts valid events and ignores duplicates', async () => {
    const { app: server } = app();
    const first = await request(server).post('/events').send({
      event_id: 'evt-0001',
      symbol: 'RELIANCE',
      transaction_type: 'BUY',
      quantity: 90,
    });
    const duplicate = await request(server).post('/events').send({
      event_id: 'evt-0001',
      symbol: 'TCS',
      transaction_type: 'SELL',
      quantity: 5,
    });

    expect(first.status).toBe(202);
    expect(first.body.status).toBe('accepted');
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.status).toBe('duplicate');

    const positions = await request(server).get('/position');
    expect(positions.body).toEqual({ RELIANCE: 90 });
  });

  it('rejects invalid events without changing positions', async () => {
    const { app: server } = app();
    const res = await request(server).post('/events').send({
      event_id: 'evt-bad',
      symbol: 'RELIANCE',
      transaction_type: 'HOLD',
      quantity: 90,
    });
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('rejected');
    expect(res.body.reason).toMatch(/transaction_type/);

    const positions = await request(server).get('/position');
    expect(positions.body).toEqual({});
  });

  it('rejects malformed JSON without crashing', async () => {
    const { app: server } = app();
    const res = await request(server)
      .post('/events')
      .set('content-type', 'application/json')
      .send('{"event_id":');
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('rejected');
  });

  it('reports health', async () => {
    const { app: server } = app();
    const res = await request(server).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
