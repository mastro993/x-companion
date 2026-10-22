import { CheckIcon } from 'lucide-react';
import { Field, FieldDescription, FieldError } from '@/components/ui/field';
import { PROVIDERS, type ProviderId } from '@/lib/providers';
import { KeyRow } from './KeyRow';

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
  const { label, keysUrl } = PROVIDERS[provider];
  // Other failures (network, quota, timeout) say nothing about the key itself.
  const invalid = error === 'Invalid API key' || undefined;

  return (
    <Field data-invalid={invalid}>
      <KeyRow
        active
        provider={provider}
        apiKey={savedKey}
        onSave={onCommit}
        invalid={invalid}
        describedBy={error ? 'api-key-error' : undefined}
      />
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
