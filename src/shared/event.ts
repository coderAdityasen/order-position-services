import { z } from 'zod';

export const TRANSACTION_TYPES = ['BUY', 'SELL'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export type OrderEvent = {
  event_id: string;
  symbol: string;
  transaction_type: TransactionType;
  quantity: number;
};

export type ParseOrderEventResult =
  | { ok: true; event: OrderEvent }
  | { ok: false; reason: string };

function trimmedString(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

function quantityIssue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return 'quantity must not be blank';
  }
  if (typeof value === 'string' && value.trim() === '') {
    return 'quantity must not be blank';
  }

  const text = typeof value === 'number' ? String(value) : String(value).trim();

  if (!/^[+-]?\d+$/.test(text)) {
    if (text.includes('.') || /e/i.test(text)) {
      return `quantity must be an integer, got "${text}"`;
    }
    return `quantity must be a number, got "${text}"`;
  }

  const n = Number(text);
  if (!Number.isSafeInteger(n)) {
    return `quantity must be a safe integer, got "${text}"`;
  }
  if (n <= 0) {
    return `quantity must be a positive integer, got ${n}`;
  }
  return null;
}

/**
 * Validates an incoming CSV row or HTTP JSON body into an order event.
 * Symbol case and spelling are preserved; surrounding whitespace is trimmed
 * so blank CSV cells are treated as empty.
 */
export const OrderEventSchema = z
  .object({
    event_id: z.unknown().optional(),
    symbol: z.unknown().optional(),
    transaction_type: z.unknown().optional(),
    quantity: z.unknown().optional(),
  })
  .passthrough()
  .superRefine((row, ctx) => {
    if (trimmedString(row.event_id).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['event_id'],
        message: 'event_id must be a non-empty string',
      });
    }

    if (trimmedString(row.symbol).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['symbol'],
        message: 'symbol must be a non-empty string',
      });
    }

    const transactionType = trimmedString(row.transaction_type);
    if (transactionType !== 'BUY' && transactionType !== 'SELL') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['transaction_type'],
        message: `transaction_type must be exactly BUY or SELL, got "${transactionType}"`,
      });
    }

    const issue = quantityIssue(row.quantity);
    if (issue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantity'],
        message: issue,
      });
    }
  });

export function parseOrderEvent(input: unknown): ParseOrderEventResult {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: 'event must be an object' };
  }

  const result = OrderEventSchema.safeParse(input);
  if (!result.success) {
    const reason = result.error.issues.map((issue) => issue.message).join('; ');
    return { ok: false, reason };
  }

  const row = result.data;
  return {
    ok: true,
    event: {
      event_id: trimmedString(row.event_id),
      symbol: trimmedString(row.symbol),
      transaction_type: trimmedString(row.transaction_type) as TransactionType,
      quantity:
        typeof row.quantity === 'number' ? row.quantity : Number(String(row.quantity).trim()),
    },
  };
}
