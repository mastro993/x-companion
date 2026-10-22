import { ShieldAlertIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useModels } from '@/hooks/use-models';
import { setProviderKey, updateSettings } from '@/hooks/use-settings';
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from '@/lib/providers';
import type { ProviderSettings, Settings } from '@/lib/settings';
import { ApiKeyField } from './ApiKeyField';
import { ModelPicker } from './ModelPicker';
import { OtherKeys } from './OtherKeys';

const LIMIT_KEY_URL = 'https://github.com/mastro993/x-companion#limit-what-a-key-can-spend';

const providerItems = PROVIDER_IDS.map((id) => ({ value: id, label: PROVIDERS[id].label }));

export function ProviderTab({ settings }: { settings: Settings }) {
  const active = settings.activeProvider;
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="active-provider">Active provider</FieldLabel>
        <Select
          items={providerItems}
          value={active}
          onValueChange={(id) => id && updateSettings((s) => ({ ...s, activeProvider: id }))}
        >
          <SelectTrigger id="active-provider" className="w-full">
            <SelectValue placeholder="Choose a provider" />
          </SelectTrigger>
          <SelectContent>
            {providerItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {active && <ActiveProvider key={active} provider={active} saved={settings.providers[active]} />}
      <OtherKeys settings={settings} />
      {/* Always on screen: role="alert" would announce it on every visit to the tab. */}
      <Alert role="note">
        <ShieldAlertIcon aria-hidden />
        <AlertTitle>Keys are stored in this browser</AlertTitle>
        <AlertDescription>
          They're saved unencrypted in your browser profile. Give each key a spending limit, and use
          one made only for x-companion.{' '}
          <a href={LIMIT_KEY_URL} target="_blank" rel="noreferrer">
            How to limit a key ↗
          </a>
        </AlertDescription>
      </Alert>
    </FieldGroup>
  );
}

function ActiveProvider({ provider, saved }: { provider: ProviderId; saved?: ProviderSettings }) {
  const { models, loading, error, load, reset } = useModels(provider);
  const apiKey = saved?.apiKey ?? '';

  // Validate the stored key and load its models whenever it changes, here or in another panel.
  useEffect(() => {
    if (apiKey) void load(apiKey);
    else reset();
  }, [apiKey, load, reset]);

  function commitKey(key: string) {
    void updateSettings((s) => setProviderKey(s, provider, key));
    // An unchanged key doesn't trigger the effect, so re-verify it here.
    if (key && key === apiKey) void load(key);
  }

  return (
    <>
      <ApiKeyField
        provider={provider}
        savedKey={apiKey}
        checking={loading}
        error={error}
        modelCount={models?.length ?? null}
        onCommit={commitKey}
      />
      <ModelPicker
        hasKey={!!apiKey}
        value={saved?.model ?? null}
        models={models}
        loading={loading}
        onChange={(model) =>
          updateSettings((s) => ({
            ...s,
            providers: { ...s.providers, [provider]: { apiKey: '', ...s.providers[provider], model } },
          }))
        }
        onRefresh={() => load(apiKey)}
      />
    </>
  );
}
