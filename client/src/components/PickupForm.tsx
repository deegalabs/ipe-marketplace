import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export interface PickupFormValues {
  eventId: string;
}

interface Props {
  value: PickupFormValues | null;
  onChange: (v: PickupFormValues) => void;
}

/// Pickup form. The eventId is chosen from the admin-curated events list
/// (`/events` returns only active events sorted by date). If the list is
/// empty we fall back to a free-text input so a fresh deploy still works.
export function PickupForm({ value, onChange }: Props) {
  const eventsQ = useQuery({ queryKey: ['events'], queryFn: api.listEvents });
  const events = eventsQ.data ?? [];

  // Default to the first (soonest) active event; fall back to a free-text slug
  // if the admin hasn't curated any yet.
  const defaultSlug = value?.eventId ?? events[0]?.slug ?? '';
  const [draft, setDraft] = useState<PickupFormValues>({ eventId: defaultSlug });

  // When events load, surface the default to the parent so the Checkout CTA
  // enables without forcing the buyer to touch the field.
  useEffect(() => {
    if (events.length && !draft.eventId) {
      const next = { eventId: events[0].slug };
      setDraft(next);
      onChange(next);
    } else if (draft.eventId) {
      onChange(draft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsQ.data]);

  const update = (slug: string) => {
    const next = { eventId: slug };
    setDraft(next);
    if (slug) onChange(next);
  };

  const selected = events.find((e) => e.slug === draft.eventId);

  return (
    <fieldset className="space-y-3 border border-ipe-green/20 rounded-md p-4">
      <legend className="px-2 text-sm font-medium text-ipe-green">Pickup at event</legend>
      <div>
        <label className="label">Event</label>
        {events.length > 0 ? (
          <>
            <select
              className="input"
              value={draft.eventId}
              onChange={(e) => update(e.target.value)}
            >
              {events.map((e) => (
                <option key={e.id} value={e.slug}>
                  {e.name} · {new Date(e.date).toLocaleDateString()}
                </option>
              ))}
            </select>
            {selected?.location && (
              <p className="text-xs text-ipe-ink/60 mt-1">📍 {selected.location}</p>
            )}
          </>
        ) : (
          <>
            <input
              className="input"
              value={draft.eventId}
              placeholder="ipe-demo-day-2026"
              onChange={(e) => update(e.target.value)}
            />
            <p className="text-xs text-ipe-ink/60 mt-1">
              No events configured yet. Enter the event slug or ask the admin to add one.
            </p>
          </>
        )}
      </div>
      <p className="text-xs text-ipe-ink/60">
        Show the order in My orders at the event to collect.
      </p>
    </fieldset>
  );
}
