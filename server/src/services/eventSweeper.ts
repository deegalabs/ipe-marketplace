import { and, eq, lt } from 'drizzle-orm';
import { db, schema } from '../db/client.js';

/// Auto-deactivate events once they're over. An event carries `endsAt`; when
/// now() passes it we flip `active=false` so the admin list reflects reality.
///
/// The buyer-facing GET /events already filters `ends_at > now()`, so buyers
/// never see a dead event even between sweeps — this loop exists to keep the
/// *stored* flag honest for the admin view and any `active`-based logic.
///
/// Race safety: the UPDATE filters by `active = true`, so a concurrent manual
/// toggle simply leaves no rows matching — the sweep is a no-op for that event.

const SWEEP_INTERVAL_MS = 60_000; // every minute — end times are minute-precision

export function startEventSweeper() {
  setInterval(() => {
    void sweepEndedEvents();
  }, SWEEP_INTERVAL_MS);
  console.log(`[event-sweeper] started — interval=${SWEEP_INTERVAL_MS / 1000}s`);
}

async function sweepEndedEvents() {
  try {
    const deactivated = await db
      .update(schema.events)
      .set({ active: false })
      .where(and(eq(schema.events.active, true), lt(schema.events.endsAt, new Date())))
      .returning({ id: schema.events.id });
    if (deactivated.length > 0) {
      console.log(
        `[event-sweeper] auto-deactivated ${deactivated.length} ended event(s):`,
        deactivated.map((e) => e.id).join(', '),
      );
    }
  } catch (err) {
    console.error('[event-sweeper] sweep failed', err);
  }
}
