import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type EventDTO } from '../api';

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

  return (
    <fieldset className="space-y-3 border border-ipe-green/20 rounded-md p-4">
      <legend className="px-2 text-sm font-medium text-ipe-green">Pickup at event</legend>

      {eventsQ.isLoading && <EventSkeleton />}

      {!eventsQ.isLoading && events.length > 1 && (
        <div className="space-y-2" role="radiogroup" aria-label="Select event">
          {events.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              selected={draft.eventId === e.slug}
              onSelect={() => update(e.slug)}
            />
          ))}
        </div>
      )}

      {!eventsQ.isLoading && events.length === 1 && (
        <EventCard event={events[0]} selected onSelect={() => update(events[0].slug)} />
      )}

      {!eventsQ.isLoading && events.length === 0 && (
        <div>
          <label className="label">Event slug</label>
          <input
            className="input"
            value={draft.eventId}
            placeholder="ipe-demo-day-2026"
            onChange={(e) => update(e.target.value)}
          />
          <p className="text-xs text-ipe-ink/60 mt-1">
            No events configured yet. Enter the event slug or ask the admin to add one.
          </p>
        </div>
      )}

      <p className="text-xs text-ipe-ink/60">
        Show the order in My orders at the event to collect.
      </p>
    </fieldset>
  );
}

function EventCard({
  event,
  selected,
  onSelect,
}: {
  event: EventDTO;
  selected: boolean;
  onSelect: () => void;
}) {
  const { weekday, date, time } = formatEventDate(event.date);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`w-full p-3.5 rounded-md border text-left transition-all duration-250 ease-smooth ${
        selected
          ? 'border-ipe-green-600 bg-ipe-green-50 dark:bg-ipe-green-700/30 shadow-sm'
          : 'border-ipe-stone-200 dark:border-ipe-navy-500/30 hover:border-ipe-green-600/50 hover:bg-ipe-stone-50 dark:hover:bg-ipe-navy-700/30'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`mt-1 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
            selected ? 'border-ipe-gold' : 'border-ipe-stone-300'
          }`}
        >
          {selected && <span className="w-2 h-2 rounded-full bg-ipe-gold" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ipe-ink leading-tight">{event.name}</p>
          <p className="text-sm text-ipe-ink/70 mt-1 tabular-nums">
            <span className="font-medium">{weekday}, {date}</span>
            <span className="text-ipe-ink/50"> · </span>
            <span>{time}</span>
          </p>
          {event.location && (
            <p className="text-xs text-ipe-ink/60 mt-1 flex items-center gap-1">
              <PinIcon /> {event.location}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

function EventSkeleton() {
  return (
    <div className="p-3.5 rounded-md border border-ipe-stone-200 dark:border-ipe-navy-500/30 animate-pulse-subtle">
      <div className="flex items-start gap-3">
        <div className="w-4 h-4 rounded-full bg-ipe-stone-100 dark:bg-ipe-navy-700/50 mt-1 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 bg-ipe-stone-100 dark:bg-ipe-navy-700/50 rounded" />
          <div className="h-3 w-1/2 bg-ipe-stone-100 dark:bg-ipe-navy-700/50 rounded" />
          <div className="h-3 w-1/3 bg-ipe-stone-100 dark:bg-ipe-navy-700/50 rounded" />
        </div>
      </div>
    </div>
  );
}

/// "Thursday, May 28" + "7:00 PM" — locale-aware. Splits weekday from the rest
/// so we can emphasize it visually.
function formatEventDate(iso: string) {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return { weekday, date, time };
}

function PinIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 10c0 7-8 12-8 12s-8-5-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
