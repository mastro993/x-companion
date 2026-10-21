import { useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '@/components/ui/button';
import { FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { setProviderKey, updateSettings } from '@/hooks/use-settings';
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from '@/lib/providers';
import type { Settings } from '@/lib/settings';
import { maskKey, NO_AUTOFILL } from './format';

/** Keys for providers other than the active one. Never changes the active provider. */
export function OtherKeys({ settings }: { settings: Settings }) {
  const others = PROVIDER_IDS.filter((id) => id !== settings.activeProvider);
  return (
    // min-w-0: a fieldset defaults to min-content width, which overflows narrow panels.
    <FieldSet className="min-w-0 gap-0">
      <FieldLegend variant="label">
        {settings.activeProvider ? 'Other saved keys' : 'Saved keys'}
      </FieldLegend>
      <ul className="divide-y">
        {others.map((id) => (
          <KeyRow key={id} provider={id} apiKey={settings.providers[id]?.apiKey ?? ''} />
        ))}
      </ul>
    </FieldSet>
  );
}

function KeyRow({ provider, apiKey }: { provider: ProviderId; apiKey: string }) {
  const { label, keyPlaceholder } = PROVIDERS[provider];
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState('');
  const editButton = useRef<HTMLButtonElement>(null);
  const confirmId = useId();

  function finish(newKey?: string) {
    if (newKey !== undefined) void updateSettings((s) => setProviderKey(s, provider, newKey));
    // Render the row's buttons now so focus can return to one of them.
    flushSync(() => {
      setEditing(false);
      setConfirming(false);
      setDraft('');
    });
    editButton.current?.focus();
  }

  return (
    <li className="flex flex-col gap-2 py-2">
      <div className="flex items-center gap-2">
        {/* Stacked so the whole mask, including the identifying last 4, fits at 320px. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{label}</span>
          <span className="font-mono text-xs text-muted-foreground">
            <span className="sr-only">{apiKey ? 'Key ' : 'No key'}</span>
            <span aria-hidden={!apiKey || undefined}>{maskKey(apiKey)}</span>
          </span>
        </div>
        {!editing && !confirming && (
          <>
            <Button ref={editButton} size="xs" variant="outline" onClick={() => setEditing(true)}>
              {apiKey ? 'Replace' : 'Add'}
              <span className="sr-only"> {label} key</span>
            </Button>
            {apiKey && (
              <Button size="xs" variant="ghost" onClick={() => setConfirming(true)}>
                Remove
                <span className="sr-only"> {label} key</span>
              </Button>
            )}
          </>
        )}
      </div>
      {confirming && (
        <div role="group" aria-labelledby={confirmId} className="flex items-center gap-2">
          <span id={confirmId} className="min-w-0 flex-1">
            Remove {label} key?
          </span>
          <Button size="xs" variant="destructive" onClick={() => finish('')}>
            Remove
          </Button>
          {/* The safe choice gets focus, so a repeated Enter doesn't remove the key. */}
          <Button size="xs" variant="ghost" autoFocus onClick={() => finish()}>
            Cancel
          </Button>
        </div>
      )}
      {editing && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) finish(draft.trim());
          }}
        >
          <Input
            type="password"
            aria-label={`${label} API key`}
            placeholder={keyPlaceholder}
            value={draft}
            autoFocus
            {...NO_AUTOFILL}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && finish()}
          />
          <Button type="submit" disabled={!draft.trim()}>
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={() => finish()}>
            Cancel
          </Button>
        </form>
      )}
    </li>
  );
}
