import { useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { looksLikeKeyFor, PROVIDERS, type ProviderId } from '@/lib/providers';
import { maskKey, NO_AUTOFILL } from './format';

interface Props {
  provider: ProviderId;
  apiKey: string;
  /** Saves a trimmed key; "" removes it. */
  onSave: (key: string) => void;
  /** The active provider's row: titled "<Provider> API key", with the form open while no key is saved. */
  active?: boolean;
  invalid?: boolean;
  /** Extra description for the input, such as the active key's error. */
  describedBy?: string;
}

/** One provider's key. Write-only: a saved key shows masked and can be replaced or removed, never read back. */
export function KeyRow({ provider, apiKey, onSave, active = false, invalid, describedBy }: Props) {
  const { label, keyPrefix } = PROVIDERS[provider];
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState('');
  const editButton = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const refocus = useRef(false);
  const confirmId = useId();
  const warningId = useId();
  const showForm = editing || (active && !apiKey);
  const key = draft.trim();
  // A partial prefix typed by hand ("sk-an") doesn't flash the warning.
  const suspicious = !!key && !keyPrefix.startsWith(key) && !looksLikeKeyFor(provider, key);

  // A saved or removed key swaps the row's controls once storage reports it: keep focus in the row.
  useEffect(() => {
    // A key saved elsewhere closes the open form: drop any held draft so Replace starts empty.
    if (!editing) setDraft('');
    if (!refocus.current) return;
    refocus.current = false;
    (editButton.current ?? input.current)?.focus();
  }, [apiKey]);

  function finish(newKey?: string) {
    if (newKey !== undefined) onSave(newKey);
    refocus.current = newKey !== undefined && newKey !== apiKey;
    // Render the row's buttons now so focus can return to one of them.
    flushSync(() => {
      setEditing(false);
      setConfirming(false);
      setDraft('');
    });
    (editButton.current ?? input.current)?.focus();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {/* Stacked so the whole mask, including the identifying last 4, fits at 320px. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{active ? `${label} API key` : label}</span>
          <span className="font-mono text-xs text-muted-foreground">
            <span className="sr-only">{apiKey ? 'Key ' : 'No key'}</span>
            <span aria-hidden={!apiKey || undefined}>{maskKey(apiKey)}</span>
          </span>
        </div>
        {!showForm && !confirming && (
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
      {showForm && (
        <div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (key) finish(key);
            }}
          >
            <Input
              ref={input}
              type="password"
              aria-label={`${label} API key`}
              aria-invalid={invalid}
              aria-describedby={describedBy ? `${warningId} ${describedBy}` : warningId}
              placeholder={`${keyPrefix}…`}
              value={draft}
              autoFocus={editing}
              {...NO_AUTOFILL}
              // A paste replaces the whole draft. It saves right away only if it looks like this
              // provider's key: anything else (a password, most other providers' keys) waits for
              // Save. OpenAI and DeepSeek keys share sk-, so they pass for each other.
              onPaste={(e) => {
                const v = e.clipboardData.getData('text').trim();
                if (!v) return;
                e.preventDefault();
                if (looksLikeKeyFor(provider, v)) finish(v);
                else setDraft(v);
              }}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && finish()}
            />
            <Button type="submit" disabled={!key}>
              Save
            </Button>
            {editing && (
              <Button type="button" variant="ghost" onClick={() => finish()}>
                Cancel
              </Button>
            )}
          </form>
          {/* Mounted with the form, so screen readers announce the warning when it appears. */}
          <p id={warningId} role="status" className="text-sm text-muted-foreground not-empty:mt-2">
            {suspicious &&
              `This doesn't look like a key for ${label}. Check that you copied the right key, then click Save.`}
          </p>
        </div>
      )}
    </div>
  );
}
