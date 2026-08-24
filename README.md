# Order Update and Position Maintaining Services

Take-home implementation of the Software Development Engineer Intern assessment.

Two independently runnable Node.js services:

1. **Order Update Service** streams `order_updates.csv` one row at a time, validates each record, and publishes accepted events over HTTP.
2. **Position Maintaining Service** receives those events, keeps net positions in memory, and serves `GET /position` while events are still arriving.

A simple, correct, tested solution is preferred over extra infrastructure. There is no database, broker, Docker, or frontend.

## Architecture

```
order_updates.csv
        │  stream one row at a time
        ▼
┌───────────────────────────┐     POST /events (JSON)      ┌──────────────────────────────┐
│  Order Update Service     │ ───────────────────────────► │  Position Maintaining Service│
│  - CSV streaming          │                              │  - Express HTTP API          │
│  - Zod validation         │                              │  - Map<symbol, position>     │
│  - ≤50 events / second    │                              │  - Set<event_id>             │
│  - retries on transport   │     GET /position            │  - GET /position             │
└───────────────────────────┘ ◄─────────────────────────── └──────────────────────────────┘
```

The two processes share a TypeScript package so the event contract stays in one place. They still start as separate programs and talk only over HTTP.

### Why HTTP

The assessment allows HTTP, gRPC, Redis, ZeroMQ, or custom TCP. HTTP was chosen because:

- it needs no extra daemon or broker;
- status codes make delivery errors obvious (`400` validation, `5xx` / network retry);
- the position API is already HTTP, so one transport covers both ingest and reads;
- it is easy to test with `supertest` and `fetch`.

gRPC or a queue would add operational weight without changing the in-memory semantics the spec asks for.

### Event payload

Both the CSV row and the HTTP body map to the same logical event:

```json
{
  "event_id": "evt-0001",
  "symbol": "RELIANCE",
  "transaction_type": "BUY",
  "quantity": 90
}
```

Zod enforces the contract:

| Field | Rule |
| --- | --- |
| `event_id` | non-empty string; first *valid* event for an ID wins |
| `symbol` | non-empty string; supplied case is preserved |
| `transaction_type` | exactly `BUY` or `SELL` |
| `quantity` | positive integer |

Invalid rows are logged with a reason and skipped. Processing continues.

### Delivery errors and limitations

- Connection failures and `5xx` responses are retried with short exponential backoff (`SEND_RETRIES`, default 5).
- `400` validation failures are not retried; they are logged and the next CSV row is processed.
- Events are sent **sequentially** in CSV order. There is no internal send buffer beyond the current row.
- If retries are exhausted, that event is logged as a send failure and the service continues. It is **not** replayed later.
- Duplicate `event_id` values are ignored in both services. Idempotency is in-memory only and resets when the position service restarts.
- Durable / exactly-once delivery across process restarts is out of scope, as specified.

Node.js runs JavaScript on a single thread. Position `Map` updates are synchronous, so `GET /position` never observes a half-applied event.

## Setup

Requires **Node.js 18+** (tested on Node 22) and npm.

```bash
git clone https://github.com/coderAdityasen/order-position-services.git
cd order-position-services
npm install
```

## Run

Start the position service first, then the order-update service in a second terminal.

**PowerShell**

```powershell
# terminal 1
npm run start:position

# terminal 2
$env:CSV_PATH="./data/order_updates.csv"
$env:POSITION_SERVICE_URL="http://127.0.0.1:3000"
$env:EVENTS_PER_SECOND="50"
npm run start:order
```

**bash**

```bash
# terminal 1
npm run start:position

# terminal 2
CSV_PATH=./data/order_updates.csv \
POSITION_SERVICE_URL=http://127.0.0.1:3000 \
EVENTS_PER_SECOND=50 \
npm run start:order
```

The order-update service waits until `GET /health` succeeds, then streams the CSV. With 1,000 rows at 50 events/second, ingest takes about 20 seconds. Logs print `input processing complete` when the file is finished.

### Example API usage

While either service is running:

```bash
curl http://127.0.0.1:3000/position
```

```json
{
  "RELIANCE": 4500,
  "TCS": -3750,
  "HDFCBANK": 3000,
  "ICICIBANK": -2250,
  "INFY": 1500
}
```

JSON key order is not important. Negative and zero positions are valid. After the supplied `data/order_updates.csv` (1,000 well-formed rows, 20 symbols × 50 repeats) every symbol has a non-zero net.

Manual event ingest:

```bash
curl -X POST http://127.0.0.1:3000/events \
  -H "content-type: application/json" \
  -d "{\"event_id\":\"evt-demo\",\"symbol\":\"RELIANCE\",\"transaction_type\":\"BUY\",\"quantity\":90}"
```

`GET /health` returns `{ "status": "ok" }`.

## Tests

```bash
npm test
```

Typecheck:

```bash
npm run build
```

The suite covers the required cases:

- BUY / SELL position math
- multiple symbols, including negative and zero nets
- duplicate `event_id` handling (first valid event wins)
- invalid transaction types
- zero, negative, non-integer, and blank quantities
- blank event IDs and symbols
- continuing after an invalid CSV row
- `GET /position` response shape
- an HTTP end-to-end path from a temp CSV through both services

Tests set `EVENTS_PER_SECOND=0` (no delay) so they are not timing-sensitive.

## Configuration

| Variable | Service | Default | Meaning |
| --- | --- | --- | --- |
| `HOST` | position | `0.0.0.0` | bind address |
| `PORT` | position | `3000` | bind port |
| `CSV_PATH` | order-update | `./data/order_updates.csv` | input file; not hardcoded to a machine-specific path |
| `POSITION_SERVICE_URL` | order-update | `http://127.0.0.1:3000` | base URL of the position service |
| `EVENTS_PER_SECOND` | order-update | `50` | max emit rate; `0` disables throttling |
| `SEND_RETRIES` | order-update | `5` | attempts per event on transport / `5xx` errors |
| `SEND_TIMEOUT_MS` | order-update | `5000` | per-request timeout |
| `HEALTH_WAIT_MS` | order-update | `10000` | how long to wait for `/health` at startup |
| `LOG_LEVEL` | both | `info` | `debug` \| `info` \| `warn` \| `error` |

See `.env.example`. Copy values into the shell; a dotenv file is not required.

## Project layout

```
src/shared/                  event contract (Zod), logger, env config
src/order-update-service/    CSV stream, HTTP client, throttle, processor
src/position-service/        in-memory store, Express app, process entry
tests/                       Jest + supertest
data/order_updates.csv       supplied assessment fixture
```

## Known limitations

- State lives in a `Map` and a `Set`. A process restart loses positions and seen IDs.
- Failed sends after retries are skipped, not written to a dead-letter file.
- The 50 events/second cap is a sleep between successful send *attempts*, not a kernel-level shaper. It is enough to stay under the limit; sub-millisecond accuracy is not claimed.
- The order-update service is a batch producer, not an HTTP server.
- There is no authentication, persistence, or dashboard, matching the assessment non-goals.

## AI assistance

Parts of this repository were drafted with AI assistance (Grok). The design, validation rules, tests, and documentation were checked against the assessment PDF. I can explain every file and trade-off.

## License

Private assessment submission. The CSV is synthetic data provided with the assignment.
