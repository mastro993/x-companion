import { FieldLegend, FieldSet } from '@/components/ui/field';
import { setProviderKey, updateSettings } from '@/hooks/use-settings';
import { PROVIDER_IDS } from '@/lib/providers';
import type { Settings } from '@/lib/settings';
import { KeyRow } from './KeyRow';

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
          <li key={id} className="py-2">
            <KeyRow
              provider={id}
              apiKey={settings.providers[id]?.apiKey ?? ''}
              onSave={(key) => void updateSettings((s) => setProviderKey(s, id, key))}
            />
          </li>
        ))}
      </ul>
    </FieldSet>
  );
}
