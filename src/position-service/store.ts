import type { OrderEvent } from '../shared/event';

export type ApplyResult = {
  duplicate: boolean;
  position: number;
};

/**
 * In-memory net positions.
 * Map<symbol, net quantity> and Set<event_id> keep accepted state process-local.
 * Updates are synchronous, so concurrent HTTP reads see a consistent snapshot.
 */
export class PositionStore {
  private readonly positions = new Map<string, number>();
  private readonly seenEventIds = new Set<string>();

  apply(event: OrderEvent): ApplyResult {
    if (this.seenEventIds.has(event.event_id)) {
      return {
        duplicate: true,
        position: this.positions.get(event.symbol) ?? 0,
      };
    }

    this.seenEventIds.add(event.event_id);
    const delta = event.transaction_type === 'BUY' ? event.quantity : -event.quantity;
    const next = (this.positions.get(event.symbol) ?? 0) + delta;
    this.positions.set(event.symbol, next);
    return { duplicate: false, position: next };
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.positions);
  }

  hasEvent(eventId: string): boolean {
    return this.seenEventIds.has(eventId);
  }

  symbolCount(): number {
    return this.positions.size;
  }
}
