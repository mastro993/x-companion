import { useEffect, useState } from 'react';
import { CheckIcon, EyeIcon, EyeOffIcon } from 'lucide-react';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { PROVIDERS, type ProviderId } from '@/lib/providers';
import { NO_AUTOFILL } from './format';

interface Props {
  provider: ProviderId;
  savedKey: string;
  checking: boolean;
  error: string;
  modelCount: number | null;
  /** Saves the trimmed key ("" removes it) and validates it. */
  onCommit: (apiKey: string) => void;
}

export function ApiKeyField({ provider, savedKey, checking, error, modelCount, onCommit }: Props) {
  const { label, keyPlaceholder, keysUrl } = PROVIDERS[provider];
  const [draft, setDraft] = useState(savedKey);
  const [shown, setShown] = useState(false);
  // Other failures (network, quota, timeout) say nothing about the key itself.
  const invalid = error === 'Invalid API key' || undefined;

  useEffect(() => setDraft(savedKey), [savedKey]);

  function commit(value: string, force = false) {
    const key = value.trim();
    if (force || key !== savedKey) onCommit(key);
  }

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor="api-key">{label} API key</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id="api-key"
          type={shown ? 'text' : 'password'}
          placeholder={keyPlaceholder}
          value={draft}
          aria-invalid={invalid}
          aria-describedby={error ? 'api-key-error' : undefined}
          {...NO_AUTOFILL}
          // A paste replaces the whole key and saves it; an empty paste changes nothing.
          onPaste={(e) => {
            const v = e.clipboardData.getData('text').trim();
            if (!v) return;
            e.preventDefault();
            setDraft(v);
            commit(v);
          }}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit(draft)}
          onBlur={() => commit(draft)}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label="Show key"
            aria-pressed={shown}
            onClick={() => setShown((v) => !v)}
          >
            {shown ? <EyeOffIcon /> : <EyeIcon />}
          </InputGroupButton>
          <InputGroupButton
            variant="secondary"
            disabled={checking || !draft.trim()}
            focusableWhenDisabled
            onClick={() => commit(draft, true)}
          >
            {checking && <Spinner aria-hidden />}
            Verify
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <FieldDescription className="flex flex-wrap justify-between gap-x-3">
        <a href={keysUrl} target="_blank" rel="noreferrer">
          Get your {label} key ↗
        </a>
        <span role="status" className="inline-flex items-center gap-1">
          {checking
            ? 'Checking key…'
            : !error &&
              modelCount !== null && (
                <>
                  <CheckIcon className="size-4 text-success" aria-hidden />
                  Key verified · {modelCount} {modelCount === 1 ? 'model' : 'models'}
                </>
              )}
        </span>
      </FieldDescription>
      <FieldError id="api-key-error">{error}</FieldError>
    </Field>
  );
}
