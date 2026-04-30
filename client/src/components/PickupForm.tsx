import { useState } from 'react';

export interface PickupFormValues {
  eventId: string;
}

interface Props {
  value: PickupFormValues | null;
  onChange: (v: PickupFormValues) => void;
}

export function PickupForm({ value, onChange }: Props) {
  const [draft, setDraft] = useState<PickupFormValues>(
    value ?? { eventId: 'ipe-meetup-2026-05' },
  );

  const update = (patch: Partial<PickupFormValues>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (next.eventId) onChange(next);
  };

  return (
    <fieldset className="space-y-3 border border-ipe-green/20 rounded-md p-4">
      <legend className="px-2 text-sm font-medium text-ipe-green">Pickup at event</legend>
      <div>
        <label className="label">Event</label>
        <input
          className="input"
          value={draft.eventId}
          onChange={(e) => update({ eventId: e.target.value })}
        />
        <p className="text-xs text-ipe-ink/60 mt-1">
          The admin sets the active event ID. Default works for the next meetup.
        </p>
      </div>
      <p className="text-xs text-ipe-ink/60">
        Show the order in My orders (or the 1155 receipt on your wallet) at the event to collect.
      </p>
    </fieldset>
  );
}
