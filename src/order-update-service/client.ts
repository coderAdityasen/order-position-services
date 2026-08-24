import type { OrderEvent } from '../shared/event';

export class RetryableSendError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'RetryableSendError';
  }
}

export class PermanentSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentSendError';
  }
}

export type SendEventResult = {
  status: 'accepted' | 'duplicate' | 'rejected';
  reason?: string;
};

export async function sendEvent(
  baseUrl: string,
  event: OrderEvent,
  options: { timeoutMs: number },
): Promise<SendEventResult> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new RetryableSendError(`could not reach position service: ${message}`, err);
  }

  if (response.status >= 500) {
    throw new RetryableSendError(`position service returned ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (response.status === 400) {
    const reason =
      body && typeof body === 'object' && 'reason' in body
        ? String((body as { reason: unknown }).reason)
        : `position service returned ${response.status}`;
    return { status: 'rejected', reason };
  }

  if (response.status === 200 || response.status === 202) {
    const status =
      body &&
      typeof body === 'object' &&
      'status' in body &&
      (body as { status: unknown }).status === 'duplicate'
        ? 'duplicate'
        : 'accepted';
    return { status };
  }

  throw new PermanentSendError(`unexpected position service status ${response.status}`);
}

export async function sendEventWithRetry(
  baseUrl: string,
  event: OrderEvent,
  options: {
    timeoutMs: number;
    retries: number;
    sleep: (ms: number) => Promise<void>;
    onRetry?: (attempt: number, err: Error, delayMs: number) => void;
  },
): Promise<SendEventResult> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= options.retries; attempt++) {
    try {
      return await sendEvent(baseUrl, event, { timeoutMs: options.timeoutMs });
    } catch (err) {
      if (err instanceof PermanentSendError) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === options.retries) {
        break;
      }
      const delayMs = Math.min(250 * 2 ** (attempt - 1), 4000);
      options.onRetry?.(attempt, lastError, delayMs);
      await options.sleep(delayMs);
    }
  }
  throw lastError ?? new RetryableSendError('send failed');
}

export async function waitForPositionService(
  baseUrl: string,
  options: { timeoutMs: number; sleep: (ms: number) => Promise<void> },
): Promise<void> {
  if (options.timeoutMs === 0) {
    return;
  }

  const deadline = Date.now() + options.timeoutMs;
  let lastError = 'not attempted';
  while (Date.now() <= deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await options.sleep(200);
  }
  throw new Error(
    `position service not reachable at ${baseUrl} within ${options.timeoutMs}ms (${lastError})`,
  );
}
