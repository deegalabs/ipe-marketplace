import { useEffect, useState } from 'react';

export interface PickupFormValues {
  eventId: string;
}

interface Props {
  value: PickupFormValues | null;
  onChange: (v: PickupFormValues) => void;
}

export function PickupForm({ value, onChange }: Props) {
  const [draft, setDraft] = useState<PickupFormValues>(
    value ?? { eventId: 'ipe-demo-day-2026' },
  );

  // Surface the default to the parent on mount so the Checkout CTA enables
  // without forcing the buyer to touch the field. (Before, onChange only
  // fired on edit — so the parent's `pickup` state stayed null and the CTA
  // stayed disabled even though the form was technically complete.)
  useEffect(() => {
    if (draft.eventId) onChange(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
