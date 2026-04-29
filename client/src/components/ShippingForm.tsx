import { useState } from 'react';

export interface ShippingFormValues {
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
}

interface Props {
  value: ShippingFormValues | null;
  onChange: (v: ShippingFormValues) => void;
}

export function ShippingForm({ value, onChange }: Props) {
  const [draft, setDraft] = useState<ShippingFormValues>(
    value ?? { fullName: '', line1: '', city: '', state: '', postalCode: '', country: 'BR' },
  );

  const update = (patch: Partial<ShippingFormValues>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (next.fullName && next.line1 && next.city && next.state && next.postalCode && next.country.length === 2) {
      onChange(next);
    }
  };

  return (
    <fieldset className="space-y-3 border border-ipe-green/20 rounded-md p-4">
      <legend className="px-2 text-sm font-medium text-ipe-green">Shipping address</legend>
      <div>
        <label className="label">Full name</label>
        <input className="input" value={draft.fullName} onChange={(e) => update({ fullName: e.target.value })} />
      </div>
      <div>
        <label className="label">Address line 1</label>
        <input className="input" value={draft.line1} onChange={(e) => update({ line1: e.target.value })} />
      </div>
      <div>
        <label className="label">Address line 2 (optional)</label>
        <input className="input" value={draft.line2 ?? ''} onChange={(e) => update({ line2: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">City</label>
          <input className="input" value={draft.city} onChange={(e) => update({ city: e.target.value })} />
        </div>
        <div>
          <label className="label">State</label>
          <input className="input" value={draft.state} onChange={(e) => update({ state: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Postal code</label>
          <input className="input" value={draft.postalCode} onChange={(e) => update({ postalCode: e.target.value })} />
        </div>
        <div>
          <label className="label">Country (ISO-2)</label>
          <input
            className="input"
            value={draft.country}
            maxLength={2}
            onChange={(e) => update({ country: e.target.value.toUpperCase() })}
          />
        </div>
      </div>
      <div>
        <label className="label">Phone (optional)</label>
        <input className="input" value={draft.phone ?? ''} onChange={(e) => update({ phone: e.target.value })} />
      </div>
      <p className="text-xs text-ipe-ink/60">
        Stored encrypted at rest; only the admin can decrypt to ship the item.
      </p>
    </fieldset>
  );
}
