import { useState } from 'react';

export interface PickupFormValues {
  eventId: string;
  displayName: string;
}

interface Props {
  value: PickupFormValues | null;
  onChange: (v: PickupFormValues) => void;
}

export function PickupForm({ value, onChange }: Props) {
  const [draft, setDraft] = useState<PickupFormValues>(
    value ?? { eventId: 'ipe-meetup-2026-05', displayName: '' },
  );

  const update = (patch: Partial<PickupFormValues>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (next.eventId && next.displayName) onChange(next);
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
      <div>
        <label className="label">Your name (for verification at pickup)</label>
        <input
          className="input"
          value={draft.displayName}
          onChange={(e) => update({ displayName: e.target.value })}
          placeholder="As shown on your ID / badge"
        />
      </div>
      <p className="text-xs text-ipe-ink/60">
        Show your wallet (the 1155 receipt) and ID at the event to collect.
      </p>
    </fieldset>
  );
}
